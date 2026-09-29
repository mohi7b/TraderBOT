/* ============================================================
 * File: analytics-engine/tests/run-all.cjs
 * Section: analytics-engine/tests
 * Version: 1.0.0
 *
 * Role:
 *   Run every *.test.cjs in this folder, each in its own process, and
 *   print a one-line summary per file plus a total.
 *
 * Usage:
 *   node analytics-engine/tests/run-all.cjs          # everything
 *   node analytics-engine/tests/run-all.cjs engine   # only matching names
 * ============================================================ */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const filters = process.argv.slice(2);

const files = fs
    .readdirSync(HERE)
    .filter((name) => name.endsWith(".test.cjs"))
    .filter((name) => !filters.length || filters.some((needle) => name.includes(needle)))
    .sort();

if (!files.length) {
    console.error("no test files matched", filters);
    process.exit(1);
}

const results = [];

for (const file of files) {
    const started = Date.now();
    const run = spawnSync(process.execPath, [path.join(HERE, file)], { encoding: "utf8" });
    const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
    const ms = Date.now() - started;

    results.push({ file, ok: run.status === 0 });
    console.log(`${run.status === 0 ? "PASS" : "FAIL"}  ${file}  (${ms}ms)`);

    if (output) {
        for (const line of output.split("\n")) console.log(`      ${line}`);
    }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} files passed`);
if (failed.length) console.log(`failed: ${failed.map((item) => item.file).join(", ")}`);

process.exit(failed.length ? 1 : 0);
