import type { XMLReference, XMLReferencesNode, XMLRoot } from "../types/XMLTypes";
export declare function getResourceText(document: XMLRoot, container: XMLReferencesNode, resource: XMLReference): string | undefined;
export declare function buildReference(container: XMLReferencesNode, suffix: string): string;
