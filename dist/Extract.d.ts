export interface ExtractedEntry {
    reference: string;
    text: string;
}
export declare function extract(xml: Buffer | string): ExtractedEntry[];
