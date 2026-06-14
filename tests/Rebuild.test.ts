import { readdirSync, readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { XMLRoot } from "@/types/XMLTypes";

import { extract } from "@/Extract";
import { rebuild, rebuildRaw } from "@/Rebuild";

const path = "tests/fixtures";

describe("service Rebuild", () => {
  const tests = readdirSync(path, { withFileTypes: true })
    .filter((file) => file.isFile() && /(?<!\.rebuilded)\.xml$/.test(file.name))
    .map((file) => file.name);

  it.each(tests)("rebuild(%j)", async (file) => {
    const source = readFileSync(`${path}/${file}`, "utf8");
    const rebuilt = rebuild(source, new Map());

    writeFileSync(`${path}/${file.replace(/\.xml$/, ".rebuilded.xml")}`, rebuilt);

    expect(extract(rebuilt)).toStrictEqual(extract(source));
    await expect(extract(rebuilt)).toMatchFileSnapshot(
      `./fixtures/${file.replace(/\.xml$/, ".rebuilded.xml")}.snap`,
    );
  });

  describe("rebuildRaw", () => {
    it("builds a minimal XML document from scratch", () => {
      const document: XMLRoot = {
        declaration: { version: "1.0", encoding: "utf8" },
        attributes: { lang: "en" },
        referencesNodes: [
          {
            tag: "dialog",
            id: 1,
            attributes: {},
            references: [{ id: 1, attributes: { text: "Hello" } }],
          },
        ],
      };

      expect(rebuildRaw(document)).toBe(
        '<?xml version="1.0" encoding="utf8"?>\n<translation lang="en">\n\t<dialog id="1">\n\t\t<res id="1" text="Hello"/>\n\t</dialog>\n</translation>',
      );
    });

    it("escapes special characters in attribute values", () => {
      const document: XMLRoot = {
        declaration: { version: "1.0", encoding: "utf8" },
        attributes: {},
        referencesNodes: [
          {
            tag: "menu",
            id: 10,
            attributes: {},
            references: [
              {
                id: 1,
                attributes: { text: 'Use <item> & "Potion"' },
              },
            ],
          },
        ],
      };

      const xml = rebuildRaw(document);

      expect(xml).toContain('text="Use &lt;item&gt; &amp; &quot;Potion&quot;"');
    });

    it("serializes multiple container types", () => {
      const document: XMLRoot = {
        declaration: { version: "1.0", encoding: "utf8" },
        attributes: {},
        referencesNodes: [
          {
            tag: "string",
            id: 5,
            attributes: { type: "system" },
            references: [
              { id: 1, attributes: { text: "Yes" } },
              { id: 2, attributes: { text: "No" } },
            ],
          },
        ],
      };

      expect(rebuildRaw(document)).toBe(
        '<?xml version="1.0" encoding="utf8"?>\n<translation>\n\t<string id="5" type="system">\n\t\t<res id="1" text="Yes"/>\n\t\t<res id="2" text="No"/>\n\t</string>\n</translation>',
      );
    });
  });

  describe("replacements", () => {
    it("replaces the translation lang attribute", () => {
      const source = '<?xml version="1.0" encoding="utf8"?>\n<translation lang="en" />';
      const result = rebuild(source, new Map([["lang", "pt"]]));

      expect(result).toContain('<translation lang="pt"');
    });

    it("replaces a dialog caption", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1" caption="Old Caption">',
        '    <res id="1" text="Hello" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["dialog.1.caption", "New Caption"]]));

      expect(result).toContain('caption="New Caption"');
      expect(result).toContain('text="Hello"');
    });

    it("replaces a resource text", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <menu id="2">',
        '    <res id="1" text="Start" />',
        "  </menu>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["menu.2.1", "Iniciar"]]));

      expect(extract(result)).toContainEqual({
        reference: "menu.2.1",
        text: "Iniciar",
      });
    });

    it("replaces a string resource using its type in the reference", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <string type="system" id="5">',
        '    <res id="1" text="OK" />',
        "  </string>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["string.system.1", "OK!"]]));

      expect(extract(result)).toContainEqual({
        reference: "string.system.1",
        text: "OK!",
      });
    });

    it("replaces a regex resource", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <string type="system" id="5">',
        '    <res id="1" regex="[a-z]+" />',
        "  </string>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["string.system.1.regex", "[A-Z]+"]]));

      expect(extract(result)).toContainEqual({
        reference: "string.system.1.regex",
        text: "[A-Z]+",
      });
    });

    it("replaces both text and regex on the same resource", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" text="Hello" regex="[a-z]+" case="1" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const result = rebuild(
        source,
        new Map([
          ["dialog.1.1", "World"],
          ["dialog.1.1.regex", "[A-Z]+"],
        ]),
      );

      expect(extract(result)).toEqual(
        expect.arrayContaining([
          { reference: "dialog.1.1", text: "World" },
          { reference: "dialog.1.1.regex", text: "[A-Z]+" },
        ]),
      );
    });

    it("preserves extra attributes when replacing regex", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" regex="AND" case="1" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["dialog.1.1.regex", "OR"]]));

      expect(result).toContain('case="1"');
      expect(result).toContain('regex="OR"');
    });

    it("expands a copyid container when a regex replacement targets it", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" regex="[a-z]+" />',
        "  </dialog>",
        '  <dialog id="2" copyid="1" />',
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["dialog.1.1.regex", "[A-Z]+"]]));

      expect(result).not.toContain('copyid="1"');
      expect(extract(result)).toEqual(
        expect.arrayContaining([
          { reference: "dialog.1.1.regex", text: "[A-Z]+" },
          { reference: "dialog.2.1.regex", text: "[A-Z]+" },
        ]),
      );
    });

    it("expands a copyid container when a referenced resource is replaced", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" text="Shared" />',
        "  </dialog>",
        '  <dialog id="2" copyid="1" />',
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["dialog.1.1", "Compartilhado"]]));

      expect(result).not.toContain('copyid="1"');
      expect(result).toContain('id="2"');
      expect(extract(result)).toEqual(
        expect.arrayContaining([
          { reference: "dialog.1.1", text: "Compartilhado" },
          { reference: "dialog.2.1", text: "Compartilhado" },
        ]),
      );
    });

    it("keeps copyid containers collapsed when no replacement targets them", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" text="Shared" />',
        "  </dialog>",
        '  <dialog id="2" copyid="1" />',
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map());

      expect(result).toContain('copyid="1"');
      expect(result).not.toMatch(/<dialog id="2">[\s\S]*<res/);
    });

    it("expands a copyid container when the source container resource is replaced", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" text="Shared" />',
        "  </dialog>",
        '  <dialog id="2" copyid="1" />',
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map([["dialog.1.1", "Compartilhado"]]));

      expect(result).not.toContain('copyid="1"');
      expect(result).toContain('<dialog id="2">');
      expect(extract(result)).toEqual(
        expect.arrayContaining([
          { reference: "dialog.1.1", text: "Compartilhado" },
          { reference: "dialog.2.1", text: "Compartilhado" },
        ]),
      );
    });
  });

  describe("cycle protection", () => {
    it("extract does not hang on circular refid", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1">',
        '    <res id="1" refid="2" />',
        '    <res id="2" refid="1" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const entries = extract(source);

      expect(entries).toHaveLength(0);
    });

    it("extract does not hang on circular copyid", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1" copyid="2" />',
        '  <dialog id="2" copyid="1">',
        '    <res id="1" text="Shared" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const entries = extract(source);

      expect(entries).toHaveLength(0);
    });

    it("rebuild does not hang on circular copyid", () => {
      const source = [
        '<?xml version="1.0" encoding="utf8"?>',
        '<translation>',
        '  <dialog id="1" copyid="2" />',
        '  <dialog id="2" copyid="1">',
        '    <res id="1" text="Shared" />',
        "  </dialog>",
        "</translation>",
      ].join("\n");

      const result = rebuild(source, new Map());

      expect(result).toContain('copyid="2"');
      expect(result).toContain('copyid="1"');
    });
  });
});
