import type { XMLReferencesNode, XMLRoot } from "@/types/XMLTypes";

import { buildReference, getResourceText } from "@/services/ReferenceService";
import { parseXml, unescapeControlChars } from "@/services/XmlService";

export interface ExtractedEntry {
  reference: string;
  text: string;
}

const COPYID_ATTRIBUTE = "copyid";
const CAPTION_ATTRIBUTE = "caption";
const REGEX_ATTRIBUTE = "regex";
const DIALOG_TAG = "dialog";
const LANG_REFERENCE = "lang";

interface ResourceLike {
  id: number;
  attributes: Record<string, string>;
}

function resolveContainerResources(
  document: XMLRoot,
  container: XMLReferencesNode,
  visited = new Set<number>(),
): ResourceLike[] {
  if (visited.has(container.id)) {
    return [];
  }

  visited.add(container.id);

  if (container.attributes[COPYID_ATTRIBUTE] !== undefined) {
    const targetContainerId = Number(container.attributes[COPYID_ATTRIBUTE]);
    const targetContainer = document.referencesNodes.find(
      (candidate) => candidate.id === targetContainerId,
    );

    if (targetContainer !== undefined) {
      return resolveContainerResources(document, targetContainer, visited);
    }
  }

  return container.references;
}

export function extract(xml: Buffer | string): ExtractedEntry[] {
  const document = parseXml(xml.toString("utf8"));
  const entries: ExtractedEntry[] = [];

  if (document.attributes[LANG_REFERENCE] !== undefined) {
    entries.push({
      reference: LANG_REFERENCE,
      text: unescapeControlChars(document.attributes[LANG_REFERENCE]),
    });
  }

  for (const container of document.referencesNodes) {
    if (container.tag === DIALOG_TAG && container.attributes[CAPTION_ATTRIBUTE] !== undefined) {
      entries.push({
        reference: buildReference(container, CAPTION_ATTRIBUTE),
        text: unescapeControlChars(container.attributes[CAPTION_ATTRIBUTE]),
      });
    }

    const resources = resolveContainerResources(document, container);

    for (const resource of resources) {
      const text = getResourceText(document, container, resource);

      if (text !== undefined) {
        entries.push({
          reference: buildReference(container, String(resource.id)),
          text: unescapeControlChars(text),
        });
      }

      if (resource.attributes[REGEX_ATTRIBUTE] !== undefined) {
        entries.push({
          reference: buildReference(container, `${resource.id}.regex`),
          text: resource.attributes[REGEX_ATTRIBUTE],
        });
      }
    }
  }

  return entries;
}
