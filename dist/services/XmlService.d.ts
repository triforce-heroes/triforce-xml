import type { XMLRoot } from "../types/XMLTypes";
export declare function parseXml(xml: string): XMLRoot;
export declare function serializeXml(document: XMLRoot): string;
export declare function unescapeControlChars(text: string): string;
export declare function escapeControlChars(text: string): string;
