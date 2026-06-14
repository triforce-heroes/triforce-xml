import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extract } from "@/Extract";

const path = "tests/fixtures";

describe("service Extract", () => {
  const tests = readdirSync(path, { withFileTypes: true })
    .filter((file) => file.isFile() && /(?<!\.rebuilded)\.xml$/.test(file.name))
    .map((file) => file.name);

  it.each(tests)("extract(%j)", async (file) => {
    await expect(extract(readFileSync(`${path}/${file}`))).toMatchFileSnapshot(
      `./fixtures/${file}.snap`,
    );
  });

  it("resolves refid to the target text", () => {
    const source = [
      '<?xml version="1.0" encoding="utf8"?>',
      '<translation>',
      '  <dialog id="1">',
      '    <res id="1" text="Original" />',
      '    <res id="2" refid="1" />',
      "  </dialog>",
      "</translation>",
    ].join("\n");

    expect(extract(source)).toContainEqual({
      reference: "dialog.1.2",
      text: "Original",
    });
  });

  it("extracts resources with a regex attribute", () => {
    const source = [
      '<?xml version="1.0" encoding="utf8"?>',
      '<translation>',
      '  <menu id="1">',
      '    <res id="1" text="OK" />',
      '    <res id="2" regex="[a-z]+" />',
      "  </menu>",
      "</translation>",
    ].join("\n");

    expect(extract(source)).toStrictEqual([
      { reference: "menu.1.1", text: "OK" },
      { reference: "menu.1.2.regex", text: "[a-z]+" },
    ]);
  });
});
