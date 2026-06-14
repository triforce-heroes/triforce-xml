import type { XMLReference, XMLReferencesNode, XMLRoot } from "@/types/XMLTypes";

import { buildReference } from "@/services/ReferenceService";
import { parseXml, serializeXml } from "@/services/XmlService";

const COPYID_ATTRIBUTE = "copyid";
const CAPTION_ATTRIBUTE = "caption";
const DIALOG_TAG = "dialog";
const LANG_REFERENCE = "lang";
const REGEX_ATTRIBUTE = "regex";
const TEXT_ATTRIBUTE = "text";

interface EffectiveResource {
  resource: XMLReference;
  sourceContainer: XMLReferencesNode;
}

function cloneContainer(container: XMLReferencesNode): XMLReferencesNode {
  return {
    tag: container.tag,
    id: container.id,
    attributes: { ...container.attributes },
    references: container.references.map((resource) => ({
      id: resource.id,
      attributes: { ...resource.attributes },
    })),
  };
}

function resolveCopyId(
  document: XMLRoot,
  container: XMLReferencesNode,
  visited: Set<number>,
): XMLReferencesNode | undefined {
  const copyId = container.attributes[COPYID_ATTRIBUTE];

  if (copyId === undefined) {
    return undefined;
  }

  const targetContainerId = Number(copyId);
  const targetContainer = document.referencesNodes.find(
    (candidate) => candidate.id === targetContainerId,
  );

  if (targetContainer === undefined || visited.has(targetContainer.id)) {
    return undefined;
  }

  return targetContainer;
}

function getEffectiveResources(
  document: XMLRoot,
  container: XMLReferencesNode,
  visited = new Set<number>(),
): EffectiveResource[] {
  if (visited.has(container.id)) {
    return [];
  }

  visited.add(container.id);

  const targetContainer = resolveCopyId(document, container, visited);

  if (targetContainer !== undefined) {
    return getEffectiveResources(document, targetContainer, visited);
  }

  return container.references.map((resource) => ({
    resource,
    sourceContainer: container,
  }));
}

function hasReplacement(
  effectiveResources: EffectiveResource[],
  replacements: Map<string, string>,
): boolean {
  return effectiveResources.some(
    ({ resource, sourceContainer }) =>
      replacements.has(buildReference(sourceContainer, String(resource.id))) ||
      replacements.has(buildReference(sourceContainer, `${resource.id}.regex`)),
  );
}

function applyResourceReplacement(
  sourceContainer: XMLReferencesNode,
  resource: XMLReference,
  replacements: Map<string, string>,
): XMLReference {
  const textReference = buildReference(sourceContainer, String(resource.id));
  const regexReference = buildReference(sourceContainer, `${resource.id}.regex`);
  const replacementText = replacements.get(textReference);
  const replacementRegex = replacements.get(regexReference);

  if (replacementText === undefined && replacementRegex === undefined) {
    return {
      id: resource.id,
      attributes: { ...resource.attributes },
    };
  }

  const attributes = { ...resource.attributes };

  if (replacementText !== undefined) {
    attributes[TEXT_ATTRIBUTE] = replacementText;
  }

  if (replacementRegex !== undefined) {
    attributes[REGEX_ATTRIBUTE] = replacementRegex;
  }

  return {
    id: resource.id,
    attributes,
  };
}

function rebuildContainer(
  document: XMLRoot,
  container: XMLReferencesNode,
  replacements: Map<string, string>,
): XMLReferencesNode {
  const effectiveResources = getEffectiveResources(document, container);
  const shouldExpand = hasReplacement(effectiveResources, replacements);
  const rebuiltContainer = cloneContainer(container);

  if (container.attributes[COPYID_ATTRIBUTE] !== undefined && !shouldExpand) {
    rebuiltContainer.references = [];
  } else {
    rebuiltContainer.attributes = Object.fromEntries(
      Object.entries(rebuiltContainer.attributes).filter(([key]) => key !== COPYID_ATTRIBUTE),
    );
    rebuiltContainer.references = effectiveResources.map(({ resource, sourceContainer }) =>
      applyResourceReplacement(sourceContainer, resource, replacements),
    );
  }

  if (container.tag === DIALOG_TAG) {
    const captionReference = buildReference(container, CAPTION_ATTRIBUTE);

    if (replacements.has(captionReference)) {
      rebuiltContainer.attributes[CAPTION_ATTRIBUTE] = replacements.get(captionReference)!;
    }
  }

  return rebuiltContainer;
}

export function rebuild(sourceXml: Buffer | string, replacements: Map<string, string>): string {
  const sourceString = sourceXml.toString("utf8");
  const document = parseXml(sourceString);
  const hasBom = sourceString.codePointAt(0) === 0xfe_ff;

  const rebuilt: XMLRoot = {
    declaration: { ...document.declaration },
    attributes: { ...document.attributes },
    referencesNodes: document.referencesNodes.map((container) =>
      rebuildContainer(document, container, replacements),
    ),
  };

  if (replacements.has(LANG_REFERENCE)) {
    rebuilt.attributes[LANG_REFERENCE] = replacements.get(LANG_REFERENCE)!;
  }

  const raw = rebuildRaw(rebuilt);

  return hasBom ? `\u{FEFF}${raw}` : raw;
}

export function rebuildRaw(document: XMLRoot): string {
  return serializeXml(document);
}
