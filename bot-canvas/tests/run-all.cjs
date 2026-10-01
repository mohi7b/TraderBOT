/* ============================================================
 * File: bot-canvas/tests/run-all.cjs
 * Section: bot-canvas/tests
 * Version: 1.0.0
 *
 * Role:
 *   Run every *.test.cjs in this folder, each in its own process, and
 *   print a one-line summary per file plus a total. The canvas suite is
 *   pure functions over documents and drawings, so nothing here starts a
 *   bus, a socket or a timer — but the same runner the other suites use,
 *   for the same reason: one file that fails must not stop the rest.
 *
 * Usage:
 *   node bot-canvas/tests/run-all.cjs               # everything
 *   node bot-canvas/tests/run-all.cjs seam-canvas    # only matching names
 *
 * Bounded runs (2026-09-30):
 *   This box has ~3.9 GB of RAM and the editor's extension host — the
 *   process that owns the chat — dies with "Reached heap limit" the
 *   moment anything else takes the memory. A test that leaks, or one
 *   that prints a whole tape, took the session down with it. So every
 *   child now runs with a capped heap and its output is clipped before
 *   it reaches the terminal:
 *
 *     TEST_HEAP_MB    V8 heap cap per test file   (default 512)
 *     TEST_OUT_LINES  lines echoed per file       (default 60; 0 = all)
 *
 *   A passing test prints one line; a failing one says why at the end,
 *   so clipping keeps the head and the tail.
 * ============================================================ */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const filters = process.argv.slice(2);

const HEAP_MB = Number(process.env.TEST_HEAP_MB || 512);
const OUT_LINES = Number(process.env.TEST_OUT_LINES ?? 60);
const HEAD_LINES = Math.max(1, Math.round(OUT_LINES / 3));
const TAIL_LINES = Math.max(1, OUT_LINES - HEAD_LINES);

function clip(output) {
    const lines = output.split("\n");
    if (OUT_LINES <= 0 || lines.length <= OUT_LINES) return lines;
    return [
        ...lines.slice(0, HEAD_LINES),
        `… ${lines.length - OUT_LINES} more lines (TEST_OUT_LINES=0 to see all) …`,
        ...lines.slice(lines.length - TAIL_LINES),
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
    const run = spawnSync(
        process.execPath,
        [`--max-old-space-size=${HEAP_MB}`, path.join(HERE, file)],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
    const ms = Date.now() - started;

    results.push({ file, ok: run.status === 0 });
    console.log(`${run.status === 0 ? "PASS" : "FAIL"}  ${file}  (${ms}ms)`);

    if (output) {
        for (const line of clip(output)) console.log(`      ${line}`);
    }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} files passed`);
if (failed.length) console.log(`failed: ${failed.map((item) => item.file).join(", ")}`);

process.exit(failed.length ? 1 : 0);
