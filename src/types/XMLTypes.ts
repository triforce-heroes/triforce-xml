export interface XMLDeclaration {
  version: string;
  encoding: string;
  standalone?: string;
}

export interface XMLRoot {
  declaration: XMLDeclaration;
  attributes: Record<string, string>;
  referencesNodes: XMLReferencesNode[];
}

export interface XMLReference {
  id: number;
  attributes: Record<string, string>;
}

export interface XMLReferencesNode {
  tag: "dialog" | "menu" | "string";
  id: number;
  attributes: Record<string, string>;
  references: XMLReference[];
}
