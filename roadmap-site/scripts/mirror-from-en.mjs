#!/usr/bin/env node
/**
 * English-first workflow helper.
 *
 * While the English copy is still being iterated on, only `en.json` is edited.
 * This script copies the chosen block(s) from en.json into the other locales so
 * the multilingual validator and the ROADMAP.md generator stay green. The
 * mirrored blocks are placeholders to be localized in one pass later.
 *
 * Usage:
 *   node scripts/mirror-from-en.mjs                   # mirrors `tokenSummary`
 *   node scripts/mirror-from-en.mjs tokenSummary hero  # mirrors several blocks
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(root, "src", "content", "roadmap");
const LOCALES = ["en", "fa", "ar", "tr", "de"];

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const blocks = requested.length > 0 ? requested : ["tokenSummary"];

const read = (locale) => JSON.parse(readFileSync(join(CONTENT_DIR, `${locale}.json`), "utf8"));
const english = read("en");

for (const block of blocks) {
  if (!(block in english)) {
    console.error(`skip: "${block}" does not exist in en.json`);
    process.exitCode = 1;
  }
}

const mirrorable = blocks.filter((block) => block in english);

LOCALES.filter((locale) => locale !== "en").forEach((locale) => {
  const file = join(CONTENT_DIR, `${locale}.json`);
  const content = read(locale);

  mirrorable.forEach((block) => {
    content[block] = english[block];
  });

  writeFileSync(file, JSON.stringify(content, null, 2) + "\n", "utf8");
  console.log(`${locale}: mirrored ${mirrorable.join(", ")} from en (pending localization)`);
});
