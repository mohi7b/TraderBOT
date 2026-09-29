/* ============================================================
 * File: collector/crypto/onchain/tests/server.test.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   The runnable entry point: its flags, its output path and the group
 *   filter. Requiring server.cjs is safe — it only runs main() when it is
 *   the process entry (require.main === module), never when imported.
 *
 *   resolveBus() is not called here: it would make the realtime service
 *   (sockets, pipeline) exist just to assert that it returns an object. The
 *   server handles both outcomes — a bus, or `{error}` plus a message.
 *
 * Run:
 *   node --test collector/crypto/onchain/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { parseArgs, catalogFor, resolveBus, OUT_FILE } = require(path.join(ROOT, "server.cjs"));

test("the CLI reads its flags, and the defaults are the whole catalog", () => {
    const defaults = parseArgs([]);
    assert.equal(defaults.bus, false);
    assert.equal(defaults.out, OUT_FILE);
    assert.equal(defaults.providers, null);
    assert.equal(defaults.tasks, null);
    assert.equal(defaults.groups, null);
    assert.equal(defaults.polls, null);
    assert.ok(OUT_FILE.startsWith(path.join(ROOT, "..", "..", "..", "data")));

    const parsed = parseArgs(["--providers", "mempool,nasdaq", "--polls", "3", "--interval", "5000", "--groups", "chains", "--out", "/tmp/x.ndjson", "--bus"]);
    assert.deepEqual(parsed.providers, ["mempool", "nasdaq"]);
    assert.equal(parsed.polls, 3);
    assert.equal(parsed.interval, 5000);
    assert.deepEqual(parsed.groups, ["chains"]);
    assert.equal(parsed.out, "/tmp/x.ndjson");
    assert.equal(parsed.bus, true);

    /* --sweeps is the sibling modules' word for the same thing. */
    assert.equal(parseArgs(["--sweeps", "2"]).polls, 2);
    assert.equal(parseArgs(["--tasks", " mempool/blocks , defillama/cexs "]).tasks.length, 2);
    assert.equal(typeof resolveBus, "function");
});

test("the group filter builds the catalog the run will use", () => {
    assert.equal(catalogFor(null), undefined, "no filter: the default catalog");
    assert.equal(catalogFor([]), undefined);

    const chains = catalogFor(["chains"]);
    assert.deepEqual(chains.groups(), ["chains"]);
    assert.equal(chains.size(), 1);

    const two = catalogFor(["holders", "funds"]);
    assert.deepEqual(two.groups(), ["holders", "funds"]);
    assert.equal(two.size(), 27);

    assert.throws(() => catalogFor(["nope"]), /unknown group/);
    assert.throws(() => catalogFor(["chains", "nope"]), /known: chains, holders, stablecoins, funds/);
});
