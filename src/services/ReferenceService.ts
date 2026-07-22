import type { XMLReference, XMLReferencesNode, XMLRoot } from "@/types/XMLTypes";

const TEXT_ATTRIBUTE = "text";
const REFID_ATTRIBUTE = "refid";
const TYPE_ATTRIBUTE = "type";
const STRING_TAG = "string";

interface ResourceTarget {
  containerId: number;
  resourceId: number;
}

function parseReferenceId(referenceId: string, currentContainerId: number): ResourceTarget {
  const parts = referenceId.split(":");

  if (parts.length === 2) {
    return {
      containerId: Number(parts[0]),
      resourceId: Number(parts[1]),
    };
  }

  return {
    containerId: currentContainerId,
    resourceId: Number(parts[0]),
  };
}

export function getResourceText(
  document: XMLRoot,
  container: XMLReferencesNode,
  resource: XMLReference,
): string | undefined {
  return getResourceTextRecursive(document, container, resource, new Set());
}

function getResourceTextRecursive(
  document: XMLRoot,
  container: XMLReferencesNode,
  resource: XMLReference,
  visited: Set<string>,
): string | undefined {
  let currentContainer = container;
  let currentResource = resource;

  while (true) {
    const visitedKey = `${currentContainer.id}:${currentResource.id}`;

    if (visited.has(visitedKey)) {
      return undefined;
    }

    visited.add(visitedKey);

    const attributes = currentResource.attributes;

    if (attributes[TEXT_ATTRIBUTE] !== undefined) {
      return attributes[TEXT_ATTRIBUTE];
    }

    if (attributes[REFID_ATTRIBUTE] !== undefined) {
      const target = parseReferenceId(attributes[REFID_ATTRIBUTE], currentContainer.id);
      const targetContainer = document.referencesNodes.find(
        (candidate) => candidate.id === target.containerId,
      );

      if (targetContainer === undefined) {
        return undefined;
      }

      const targetResource = targetContainer.references.find(
        (candidate) => candidate.id === target.resourceId,
      );

      if (targetResource === undefined) {
        return undefined;
      }

      currentContainer = targetContainer;
      currentResource = targetResource;

      continue;
    }

    return undefined;
  }
}

export function buildReference(container: XMLReferencesNode, suffix: string): string {
  if (container.tag === STRING_TAG) {
    const stringType = container.attributes[TYPE_ATTRIBUTE];

    if (stringType === undefined) {
      return `string.${container.id}.${suffix}`;
    }

    return `string.${stringType}.${suffix}`;
  }

  const name = container.attributes["name"];
  const identifier = name ?? container.id;

  return `${container.tag}.${identifier}.${suffix}`;
}
