import { xml2js, js2xml } from "xml-js";

import type { XMLReference, XMLReferencesNode, XMLRoot, XMLDeclaration } from "@/types/XMLTypes";

interface XmlJSElement {
  type: string;
  name?: string;
  attributes?: Record<string, string>;
  elements?: XmlJSElement[];
  text?: string;
}

interface XmlJSRoot {
  declaration?: { attributes?: Record<string, string> };
  elements?: XmlJSElement[];
}

export function parseXml(xml: string): XMLRoot {
  const root = xml2js(xml, {
    compact: false,
    ignoreDeclaration: false,
    ignoreInstruction: true,
    ignoreComment: true,
    ignoreCdata: true,
    ignoreDoctype: true,
  }) as XmlJSRoot;

  const declaration: XMLDeclaration = {
    version: "1.0",
    encoding: "utf8",
  };

  if (root.declaration?.attributes !== undefined) {
    const declarationAttributes = root.declaration.attributes;

    if (declarationAttributes["version"] !== undefined) {
      declaration.version = declarationAttributes["version"];
    }

    if (declarationAttributes["encoding"] !== undefined) {
      declaration.encoding = declarationAttributes["encoding"];
    }

    if (declarationAttributes["standalone"] !== undefined) {
      declaration.standalone = declarationAttributes["standalone"];
    }
  }

  const translationElement = root.elements?.find(
    (element) => element.type === "element" && element.name === "translation",
  );

  if (translationElement === undefined) {
    throw new TypeError("Missing <translation> root element.");
  }

  const containers: XMLReferencesNode[] = [];

  for (const element of translationElement.elements ?? []) {
    if (element.type !== "element") {
      continue;
    }

    const tag = element.name;

    if (tag !== "dialog" && tag !== "menu" && tag !== "string") {
      continue;
    }

    const attributes = element.attributes ?? {};
    const resources: XMLReference[] = [];

    for (const child of element.elements ?? []) {
      if (child.type !== "element" || child.name !== "res") {
        continue;
      }

      const childAttributes = child.attributes ?? {};
      const id = Number(childAttributes["id"]);

      if (Number.isNaN(id)) {
        throw new TypeError(`Invalid resource id in <${tag} id="${attributes["id"]}">.`);
      }

      resources.push({
        id,
        attributes: { ...childAttributes },
      });
    }

    const containerId = Number(attributes["id"]);

    if (Number.isNaN(containerId)) {
      throw new TypeError(`Invalid container id in <${tag}>.`);
    }

    containers.push({
      tag,
      id: containerId,
      attributes: { ...attributes },
      references: resources,
    });
  }

  return {
    declaration,
    attributes: { ...translationElement.attributes },
    referencesNodes: containers,
  };
}

export function serializeXml(document: XMLRoot): string {
  const root: XmlJSRoot = {
    declaration: {
      attributes: {
        version: document.declaration.version,
        encoding: document.declaration.encoding,
      },
    },
    elements: [
      {
        type: "element",
        name: "translation",
        attributes: escapeAttributes(document.attributes),
        elements: document.referencesNodes.map((container) => ({
          type: "element",
          name: container.tag,
          attributes: escapeAttributes({
            id: String(container.id),
            ...container.attributes,
          }),
          elements: container.references.map((resource) => ({
            type: "element",
            name: "res",
            attributes: escapeAttributes({
              id: String(resource.id),
              ...resource.attributes,
            }),
          })),
        })),
      },
    ],
  };

  if (document.declaration.standalone !== undefined) {
    root.declaration!.attributes!["standalone"] = document.declaration.standalone;
  }

  return js2xml(root, {
    compact: false,
    fullTagEmptyElement: false,
    spaces: "\t",
  });
}

function escapeAttributes(attributes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key, escapeAttributeValue(value)]),
  );
}

function escapeAttributeValue(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
