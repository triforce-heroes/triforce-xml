import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chunk } from "@triforce-heroes/triforce-core/Array";
import { generateQuery } from "@triforce-heroes/triforce-publisher";
import { regex } from "arkregex";

import { extract } from "@/Extract";

const fixturesPath = "tests/fixtures";
const outDir = "tools";

const entries = new Map<string, Map<string, Set<string>>>();
const letters = new Set<number>();

for (const file of readdirSync(fixturesPath, { withFileTypes: true })) {
  if (!file.isFile() || !file.name.endsWith(".xml")) {
    continue;
  }

  const filePath = join(fixturesPath, file.name);
  const sourceEntries = extract(readFileSync(filePath));
  const languageMatch = /^lang-(?<language>\w+)\.xml$/.exec(file.name);

  if (!languageMatch) {
    continue;
  }

  const rawLanguage = languageMatch.groups?.["language"] ?? file.name;

  const languageMap: Record<string, string> = {
    cn: "zh-CN",
    ja: "jp",
  };

  const language = languageMap[rawLanguage] ?? rawLanguage;

  for (const entry of sourceEntries) {
    if (!entries.has(entry.reference)) {
      entries.set(entry.reference, new Map());
    }

    const entryMessages = entries.get(entry.reference)!;

    if (!entryMessages.has(entry.text)) {
      entryMessages.set(entry.text, new Set());

      for (const letter of entry.text) {
        letters.add(letter.codePointAt(0)!);
      }
    }

    entryMessages.get(entry.text)!.add(language);
  }
}

const processedEntries = [...entries.entries()].map(([reference, entry]) => ({
  resource: "",
  reference,
  sources: Object.fromEntries(
    [...entry.entries()].map(([message, messageLanguages]) => [message, [...messageLanguages]]),
  ),
}));

writeFileSync(join(outDir, "entries.json"), JSON.stringify(processedEntries, null, "\t"));

writeFileSync(
  join(outDir, "letters.json"),
  JSON.stringify(
    [...letters].toSorted((letterA, letterB) => letterA - letterB),
    null,
    "\t",
  ),
);

writeFileSync(
  join(outDir, "uniques.json"),
  JSON.stringify(
    [...new Set([...entries.values()].flatMap((entry) => [...entry.keys()]))],
    null,
    "\t",
  ),
);

function hashEntry(entry: (typeof processedEntries)[number]): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

const currentHashes: Record<string, string> = {};

for (const entry of processedEntries) {
  currentHashes[entry.reference] = hashEntry(entry);
}

let latestVersion = 0;

if (existsSync(outDir)) {
  for (const file of readdirSync(outDir)) {
    const match = regex("^query_v(?<version>\\d+)\\.json$").exec(file);
    const version = match?.groups.version;

    if (version !== undefined) {
      const versionNumber = Number.parseInt(version, 10);

      if (versionNumber > latestVersion) {
        latestVersion = versionNumber;
      }
    }
  }
}

let needsNewVersion = true;
let previousHashes: Record<string, string> | null = null;

if (latestVersion > 0) {
  previousHashes = JSON.parse(
    readFileSync(join(outDir, `query_v${latestVersion}.json`), "utf8"),
  ) as Record<string, string>;

  if (
    Object.keys(previousHashes).length === Object.keys(currentHashes).length &&
    Object.entries(currentHashes).every(([ref, hash]) => previousHashes![ref] === hash)
  ) {
    needsNewVersion = false;
  }
}

if (needsNewVersion) {
  const newVersion = latestVersion + 1;

  let diffEntries = processedEntries;

  if (previousHashes) {
    diffEntries = processedEntries.filter(
      (entry) => previousHashes[entry.reference] !== currentHashes[entry.reference],
    );
  }

  const chunkEntries = chunk(diffEntries, 100);
  const chunkDate = Date.now();

  writeFileSync(
    join(outDir, `query_v${newVersion}.json`),
    JSON.stringify(currentHashes, null, "\t"),
  );

  writeFileSync(
    join(outDir, `query_v${newVersion}.sql`),
    chunkEntries
      .map((partialEntries) => generateQuery(9, partialEntries, chunkDate)!)
      .join(";\n\n"),
  );
}
