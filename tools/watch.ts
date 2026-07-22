import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chunk } from "@triforce-heroes/triforce-core/Array";
import { queryGenerator } from "@triforce-heroes/triforce-publisher";
import { regex } from "arkregex";

import { extract } from "@/Extract";

const fixturesPath = "tests/fixtures";
const outDirectory = "tools";

const entries = new Map<string, Map<string, Set<string>>>();
const letters = new Set<number>();
const fixtureFiles = readdirSync(fixturesPath, { withFileTypes: true });

for (const file of fixtureFiles) {
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

const processedEntries = [...entries].map(([reference, entry]) => ({
  resource: "",
  reference,
  sources: Object.fromEntries(
    [...entry].map(([message, messageLanguages]) => [message, [...messageLanguages]]),
  ),
}));

writeFileSync(join(outDirectory, "entries.json"), JSON.stringify(processedEntries, null, "\t"));

writeFileSync(
  join(outDirectory, "letters.json"),
  JSON.stringify(
    [...letters].toSorted((letterA, letterB) => letterA - letterB),
    null,
    "\t",
  ),
);

writeFileSync(
  join(outDirectory, "uniques.json"),
  JSON.stringify(
    (() => {
      const allTexts = Iterator.from(entries.values()).flatMap(
        (entry) => Iterator.from(entry.keys()).toArray(),
      ).toArray();

      return [...new Set(allTexts)];
    })(),
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

  if (existsSync(outDirectory)) {
  for (const file of readdirSync(outDirectory)) {
    const match = regex("^query_v(?<version>\\d+)\\.json$").exec(file);
    const version = match?.groups.version;

    if (version !== undefined) {
      const versionNumber = Number(version);

      if (versionNumber > latestVersion) {
        latestVersion = versionNumber;
      }
    }
  }
}

let isNeedsNewVersion = true;
let previousHashes: Record<string, string> | null = null;

if (latestVersion > 0) {
  previousHashes = JSON.parse(
    readFileSync(join(outDirectory, `query_v${latestVersion}.json`), "utf8"),
  ) as Record<string, string>;

  if (
    Object.keys(previousHashes).length === Object.keys(currentHashes).length &&
    Object.entries(currentHashes).every(([reference, hash]) => previousHashes![reference] === hash)
  ) {
    isNeedsNewVersion = false;
  }
}

if (isNeedsNewVersion) {
  const newVersion = latestVersion + 1;

  let diffEntries = processedEntries;

  diffEntries = previousHashes
    ? processedEntries.filter(
        (entry) => previousHashes[entry.reference] !== currentHashes[entry.reference],
      )
    : diffEntries;

  const chunkEntries = chunk(diffEntries, 100);
  const chunkDate = Date.now();

  writeFileSync(
    join(outDirectory, `query_v${newVersion}.json`),
    JSON.stringify(currentHashes, null, "\t"),
  );

  writeFileSync(
    join(outDirectory, `query_v${newVersion}.sql`),
    chunkEntries
      .map((partialEntries) => queryGenerator(9, partialEntries, chunkDate)!)
      .join(";\n\n"),
  );
}
