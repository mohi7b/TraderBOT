/* ============================================================
 * File: collector/crypto/onchain/tests/bus-seam.test.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   The seam that `server.cjs --bus` uses, and nothing more: the onchain
 *   collector's envelopes must land on the *realtime* service's event bus
 *   under the `onchain:` axis, so analytics-engine (already subscribed to
 *   that bus) sees them next to its spot/futures entries.
 *
 *   This is the one test that touches the realtime service: it starts the
 *   service in this process, resolves the bus the way the server does,
 *   publishes through the bridge, reads the bus back by channel and then
 *   disposes the singleton it created.
 *
 * Run:
 *   node --test collector/crypto/onchain/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { resolveBus } = require(path.join(ROOT, "server.cjs"));
const onchain = require(path.join(ROOT, "index.cjs"));
const fx = require("./fixtures.cjs");

test("--bus: an onchain reading lands on the realtime event bus", async () => {
    const realtime = require(path.join(ROOT, "..", "realtime", "index.cjs"));
    /* This process is the one running the realtime service: resolveBus()
     * attaches to a bus that exists, it never builds one. */
    realtime.getService();
    const bus = resolveBus();
    try {
        assert.ok(bus && typeof bus.publish === "function", "the realtime bus is reachable through the server's resolver");

        const seen = [];
        const unsubscribe = bus.subscribe((entry) => seen.push(entry));
        const collector = onchain.createCollector({ client: fx.createFakeClient(), bus, taskIds: ["defillama/cexs"] });
        const sweep = await collector.pollOnce();
        unsubscribe();

        assert.equal(sweep.readings, 3, "three tracked holders answer");
        assert.equal(sweep.published, 3);

        /* The bus keeps the last value of every channel: onchain:* is there. */
        const channel = "onchain:crypto:BINANCE:exchange_reserves";
        assert.ok(bus.channels({ market: "onchain" }).includes(channel), `no ${channel} on the bus`);
        const entry = bus.latestFor(channel);
        assert.equal(entry.symbol, "BINANCE");
        assert.equal(entry.payload.envelope.meta.sourceType, "onchain");
        assert.equal(entry.payload.envelope.meta.marketType, null);
        assert.equal(entry.payload.envelope.payload.reservesUsd, 128_500_000_000);
        assert.equal(seen.length, 3, "every published envelope reached a subscriber");
    } finally {
        realtime.resetService();
    }
});
