import type { XMLRoot } from "./types/XMLTypes";
export declare function rebuild(sourceXml: Buffer | string, replacements: Map<string, string>): string;
export declare function rebuildRaw(document: XMLRoot): string;
