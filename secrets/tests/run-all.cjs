/* ============================================================
 * File: secrets/tests/run-all.cjs
 * Section: secrets/tests
 * Version: 1.0.0
 *
 * Role:
 *   Run every *.test.cjs in this folder, each in its own process, and print a
 *   one-line summary per file plus a total. The vault suite next door seals and
 *   opens values and hashes nothing, so it is cheap — but it is the same runner
 *   the other suites use, for the same reasons: each file gets a fresh database,
 *   and one file that fails must not stop the rest.
 *
 * Usage:
 *   node secrets/tests/run-all.cjs              # everything
 *   node secrets/tests/run-all.cjs vault        # only matching names
 *
 * Bounded runs:
 *   Each child runs with a capped heap, and its output is clipped before it
 *   reaches the terminal, so a runaway test cannot take the editor with it:
 *
 *     TEST_HEAP_MB    V8 heap cap per test file   (default 512)
 *     TEST_OUT_LINES  lines echoed per file       (default 60; 0 = all)
 *     TEST_TIMEOUT_MS kill a file that hangs      (default 120000)
 *
 *   A passing test prints a few lines; a failing one says why at the end, so
 *   clipping keeps the head and the tail and drops the middle.
 * ============================================================
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const filters = process.argv.slice(2);

const HEAP_MB = Number(process.env.TEST_HEAP_MB || 512);
const OUT_LINES = Number(process.env.TEST_OUT_LINES ?? 60);
const HEAD_LINES = Math.max(1, Math.round(OUT_LINES / 3));
const TAIL_LINES = Math.max(1, OUT_LINES - HEAD_LINES);
const KILL_MS = Number(process.env.TEST_TIMEOUT_MS || 120_000);

function clip(output) {
    const lines = output.split("\n");
    if (OUT_LINES <= 0 || lines.length <= OUT_LINES) return lines;
    return [
        ...lines.slice(0, HEAD_LINES),
        `… ${lines.length - OUT_LINES} more lines (TEST_OUT_LINES=0 to see all) …`,
        ...lines.slice(lines.length - TAIL_LINES)
    ];
}

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
    /* A test that hangs is a bug in the test, not a reason to fill the box
     * with processes: it is killed, and the timeout is a failure. */
    const run = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, path.join(HERE, file)], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: KILL_MS
    });
    const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
    const ms = Date.now() - started;
    const ok = run.status === 0 && !run.error;

    results.push({ file, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${file}  (${ms}ms)`);
    if (run.error) console.log(`      ${run.error.code}: ${file} did not finish within ${KILL_MS}ms`);
    if (output) {
        for (const line of clip(output)) console.log(`      ${line}`);
    }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} files passed`);
if (failed.length) console.log(`failed: ${failed.map((item) => item.file).join(", ")}`);

process.exit(failed.length ? 1 : 0);
