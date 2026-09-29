/* ============================================================
 * File: collector/liquidity_6markets/tests/feed-client.test.cjs
 * Section: collector/liquidity_6markets/tests
 * Version: 1.0.0
 *
 * Role:
 *   The client that talks to the outside world, with no outside world:
 *   every fetch is replaced, so what is being tested is the promise the
 *   section makes to itself —
 *
 *     - every attempt is bounded by the provider's own timeoutMs, so a
 *       venue that accepts the connection and then says nothing cannot
 *       hold a sweep open;
 *     - a stop signal cancels the request *in flight*, not only the next
 *       one, and stopping is reported as "cancelled", never as a timeout
 *       or as a venue failure;
 *     - a failure is a value, and the gate counts each kind of failure
 *       apart (timeouts, cancellations, retries), never as one number.
 *
 *   Run:
 *     node --test collector/liquidity_6markets/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { createFeedClient, sleepWith } = require(path.join(ROOT, "core", "feed-client.cjs"));
const { providerConfig } = require(path.join(ROOT, "config", "providers.cjs"));

const URL = "https://example.test/quote";

/**
 * A venue that accepts the connection and then says nothing, honouring the
 * signal it was handed — which is exactly how a real fetch behaves.
 */
function quietFetch() {
    const called = [];

    return {
        called,
        fetchImpl: (url, init) =>
            new Promise((resolve, reject) => {
                const signal = init && init.signal;
                called.push({ url, signal });
                if (!signal) return; /* nothing can end this request: the test would hang */
                signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")), { once: true });
            })
    };
}

test("an answer is kept as it is, and nothing is counted against the venue", async () => {
    let seen = null;
    const client = createFeedClient({
        fetchImpl: async (url, init) => {
            seen = init;
            return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ price: 1.23 }) };
        }
    });

    const answer = await client.get("binance", URL);

    assert.equal(answer.ok, true);
    assert.deepEqual(answer.data, { price: 1.23 });
    assert.equal(answer.reason, null);
    assert.ok(seen.signal instanceof AbortSignal, "the attempt carries a signal, so it can be given up on");
    assert.equal(seen.signal.aborted, false, "an answered request is not aborted");

    const gate = client.stats().binance;
    assert.equal(gate.timeouts, 0);
    assert.equal(gate.failures, 0);
    assert.equal(gate.requests, 1);
});

test("a quiet venue is given up on, and a timeout is counted as a timeout", async () => {
    const venue = quietFetch();
    const client = createFeedClient({ fetchImpl: venue.fetchImpl });

    const answer = await client.get("binance", URL, { attempts: 1, timeoutMs: 25 });

    assert.equal(answer.ok, false);
    assert.equal(answer.reason, "timeout after 25 ms");
    assert.equal(answer.status, null);
    assert.equal(venue.called.length, 1);

    const gate = client.stats().binance;
    assert.equal(gate.timeouts, 1, "the gate knows it was our own clock, not the venue saying no");
    assert.equal(gate.cancelled, 0);
    assert.equal(gate.failures, 1);
    assert.equal(gate.lastError, "timeout after 25 ms");
});

test("with no override, the number the provider declares is the budget", async () => {
    const delays = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...rest) => {
        delays.push(ms);
        return realSetTimeout(fn, ms, ...rest);
    };

    let client = null;
    try {
        client = createFeedClient({ fetchImpl: async () => { throw new Error("network down"); } });
        const answer = await client.get("binance", URL, { attempts: 1 });

        assert.equal(answer.ok, false);
        assert.equal(answer.reason, "network down", "a failure is reported as what it was");
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.ok(
        delays.includes(providerConfig("binance").timeoutMs),
        `the provider's own timeoutMs (${providerConfig("binance").timeoutMs} ms) was armed, saw ${JSON.stringify(delays)}`
    );
    assert.equal(client.stats().binance.timeouts, 0, "a network error is not a timeout");
});

test("a timeout is retried, and each attempt is counted", async () => {
    const venue = quietFetch();
    const waits = [];
    let tick = 0;
    const client = createFeedClient({
        fetchImpl: venue.fetchImpl,
        sleep: async (ms) => { waits.push(ms); },
        /* The clock runs far ahead of the last request, so the rate gate is
         * never the reason this client waited: every recorded pause is a
         * backoff between two attempts. */
        now: () => (tick += 1) * 1_000_000_000
    });

    const answer = await client.get("okx", URL, { attempts: 3, timeoutMs: 20 });

    assert.equal(answer.ok, false);
    assert.equal(answer.reason, "timeout after 20 ms");
    assert.equal(venue.called.length, 3, "a timeout is transient: it is retried, not given up on");

    const gate = client.stats().okx;
    assert.deepEqual(waits, [250, 500], "and backed off between the attempts");
    assert.equal(gate.timeouts, 3, "every attempt that timed out is counted");
    assert.equal(gate.retries, 2);
});


test("the caller's stop signal cancels the request in flight", async () => {
    const venue = quietFetch();
    const controller = new AbortController();
    const client = createFeedClient({ fetchImpl: venue.fetchImpl });

    const pending = client.get("binance", URL, { attempts: 3, signal: controller.signal, timeoutMs: 60_000 });
    setTimeout(() => controller.abort(), 10);
    const answer = await pending;

    assert.equal(answer.ok, false);
    assert.equal(answer.reason, "cancelled");
    assert.equal(venue.called.length, 1, "a cancelled request is not retried");

    const gate = client.stats().binance;
    assert.equal(gate.cancelled, 1);
    assert.equal(gate.timeouts, 0, "stopping is not a timeout");
    assert.equal(gate.failures, 1, "and the caller is told the request did not complete");
});

test("a stop signal that already fired asks the venue nothing", async () => {
    const venue = quietFetch();
    const controller = new AbortController();
    controller.abort();

    const client = createFeedClient({ fetchImpl: venue.fetchImpl });
    const answer = await client.get("binance", URL, { signal: controller.signal });

    assert.equal(answer.ok, false);
    assert.equal(answer.reason, "cancelled");
    assert.equal(venue.called.length, 0, "nothing was sent");

    const gate = client.stats().binance;
    assert.equal(gate.requests, 0, "…and the venue's rate budget was not spent");
    assert.equal(gate.cancelled, 1);
});

test("sleepWith is a pause a stop can cut short", async () => {
    let guardTimer = null;

    try {
        assert.equal(await sleepWith(async () => {}, 1, null), true, "no signal: an ordinary pause");

        const fired = new AbortController();
        fired.abort();
        assert.equal(
            await sleepWith(() => { throw new Error("an aborted signal must not be waited on"); }, 1, fired.signal),
            false,
            "an already-aborted signal never waits"
        );

        const controller = new AbortController();
        const pending = sleepWith(() => new Promise(() => {}), 60_000, controller.signal);
        const guard = new Promise((resolve) => { guardTimer = setTimeout(() => resolve("still waiting"), 1_000); });
        controller.abort();

        assert.equal(await Promise.race([pending, guard]), false, "the pause ended on the caller's word, not on the timer");
    } finally {
        if (guardTimer) clearTimeout(guardTimer);
    }
});
