/* ============================================================
 * File: test/depth-book-sync.test.cjs
 *
 * Verifies the shared sync engine (collector/crypto/common/depth-book-sync.cjs):
 *
 *   fix #5 — a crossed synced book is never published; a persistent
 *            crossing escalates to a resync
 *   fix #6 — when the REST seed is newer than the buffered updates, the
 *            next live update becomes the new anchor instead of the
 *            "previousSequence === state" resync loop
 *
 * The fake validator below is the strict KuCoin/Bybit kind: it ignores the
 * `initial` flag and demands exact continuity, which is exactly what used to
 * turn a startup race into a false gap.
 * ============================================================ */

const assert = require("node:assert/strict");
const { DepthBookSync, isCrossed } = require("../collector/crypto/common/depth-book-sync.cjs");

function makeSync(engineOverrides = {}) {
    const events = { snapshots: [], updates: [], states: [] };

    const sync = new DepthBookSync({
        normalizeSnapshot: value => ({
            bids: value.bids,
            asks: value.asks,
            state: Number(value.state),
            sequence: { sequence: Number(value.state) },
            eventTimestamp: value.ts || 1
        }),
        normalizeUpdate: value => ({
            bids: value.bids || [],
            asks: value.asks || [],
            state: Number(value.state),
            previousSequence: Number(value.previousSequence),
            eventTimestamp: value.ts || 1,
            sequence: { sequence: Number(value.state), previousSequence: Number(value.previousSequence) }
        }),
        /* strict, continuity-only validator (KuCoin/Bybit style) */
        validateUpdate: (update, state) => Boolean(Number.isFinite(state) && update.state > state && update.previousSequence === state),
        onSnapshot: book => events.snapshots.push(book),
        onUpdate: book => events.updates.push(book),
        onStateChange: (status, error, meta) => events.states.push({ status, error: error && error.message, meta }),
        ...engineOverrides
    });

    return { sync, events };
}

const lastState = events => events.states[events.states.length - 1] || {};
const stateWithReason = (events, reason) => [...events.states].reverse().find(state => state.meta && state.meta.reason === reason) || {};
const hasReason = (events, reason) => events.states.some(state => state.meta && state.meta.reason === reason);

/* ------------------------------------------------------------
 * 1. the happy path: seed + strict continuation
 * ---------------------------------------------------------- */
{
    const { sync, events } = makeSync();

    sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 5, ts: 100 });
    assert.equal(sync.status, "healthy");
    assert.equal(events.snapshots.length, 1);
    assert.equal(events.snapshots[0].bids[0].price, 100);
    assert.equal(sync.anchorPending, false, "a contiguous seed needs no anchor");
    assert.equal(lastState(events).meta.reason, "awaiting_first_update");

    sync.push({ bids: [[100, 2]], asks: [], state: 6, previousSequence: 5 });
    assert.equal(events.updates.length, 1);
    assert.equal(events.updates[0].bids[0].qty, 2);
    assert.equal(sync.state, 6);

    /* a real gap must still be refused */
    sync.push({ bids: [[99, 1]], asks: [], state: 8, previousSequence: 7 });
    assert.equal(sync.status, "invalid");
    assert.equal(events.updates.length, 1, "a real gap must not be published");

    /* an empty buffer never loosens the chain: the first update after the seed
     * must continue it exactly */
    const strict = makeSync();
    strict.sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 5, ts: 100 });
    strict.sync.push({ bids: [[100, 2]], asks: [], state: 9, previousSequence: 8 });
    assert.equal(strict.sync.status, "invalid", "no buffer → strict continuity is kept");
    assert.equal(strict.events.updates.length, 0);
}

/* ------------------------------------------------------------
 * 2. fix #6 — buffer older than the seed → anchor, not resync
 * ---------------------------------------------------------- */
{
    const { sync, events } = makeSync();

    /* live updates arrive before the REST seed resolves */
    sync.push({ bids: [[100, 1]], asks: [], state: 12, previousSequence: 11 });
    sync.push({ bids: [[100, 3]], asks: [], state: 13, previousSequence: 12 });
    assert.equal(sync.buffer.length, 2);

    /* the seed raced ahead of the buffer (state 20 > 13) */
    sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 20, ts: 100 });

    assert.equal(sync.status, "healthy");
    assert.equal(sync.buffer.length, 0, "stale buffered updates are dropped");
    assert.equal(sync.anchorPending, true, "the next live update is the anchor");
    assert.equal(lastState(events).meta.reason, "buffer_older_than_snapshot");
    assert.equal(lastState(events).meta.dropped, 2);

    /* the next live update does NOT continue the seed — the old engine went
     * "invalid" here and looped through resync forever */
    sync.push({ bids: [[100, 5]], asks: [], state: 21, previousSequence: 12 });
    assert.equal(sync.status, "healthy", "a forward-only update re-anchors the book");
    assert.equal(sync.anchorRecoveries, 1);
    assert.equal(sync.anchorPending, false);
    assert.equal(sync.lastAnchor.from, 20);
    assert.equal(sync.lastAnchor.to, 21);
    assert.equal(events.updates.length, 1, "the anchored book is published");
    assert.equal(lastState(events).meta.reason, "anchored_on_live_update");

    /* exact continuity is enforced again after the anchor */
    sync.push({ bids: [[100, 6]], asks: [], state: 22, previousSequence: 21 });
    assert.equal(events.updates.length, 2);
    sync.push({ bids: [[100, 7]], asks: [], state: 23, previousSequence: 99 });
    assert.equal(sync.status, "invalid");
    assert.equal(events.updates.length, 2, "the chain is strict again once anchored");

    /* an update that is OLDER than the seed can never anchor */
    const older = makeSync();
    older.sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 20, ts: 100 });
    older.sync.anchorPending = true;
    older.sync.push({ bids: [[100, 1]], asks: [], state: 19, previousSequence: 18 });
    assert.equal(older.sync.status, "invalid", "a replayed update is still a resync");
}

/* ------------------------------------------------------------
 * 3. fix #5 — crossed books are never published
 * ---------------------------------------------------------- */
assert.equal(isCrossed({ bids: [{ price: 100 }], asks: [{ price: 101 }] }), false);
assert.equal(isCrossed({ bids: [], asks: [{ price: 101 }] }), false, "an empty side is not a crossing");
assert.equal(isCrossed({ bids: [{ price: 101 }], asks: [{ price: 101 }] }), true);
assert.equal(isCrossed({ bids: [{ price: 102 }], asks: [{ price: 101 }] }), true);
assert.equal(isCrossed(null), false);

{
    const { sync, events } = makeSync();

    /* a crossed seed is dropped */
    sync.setSnapshot({ bids: [[101, 1]], asks: [[101, 2]], state: 5, ts: 100 });
    assert.equal(events.snapshots.length, 0, "a crossed snapshot must not be published");
    assert.equal(sync.crossedSkips, 1);
    assert.equal(sync.crossedStreak, 1);
    assert.equal(sync.status, "healthy", "one crossing is dropped, not fatal");
    assert.equal(stateWithReason(events, "crossed_book").meta.bestBid, 101);
    assert.equal(stateWithReason(events, "crossed_book").meta.bestAsk, 101);

    /* an update that crosses the book is dropped as well */
    sync.push({ bids: [[102, 1]], asks: [], state: 6, previousSequence: 5 });
    assert.equal(events.updates.length, 0);
    assert.equal(sync.crossedSkips, 2);
    assert.equal(sync.crossedStreak, 2);
    assert.equal(sync.status, "healthy");

    /* a persistent crossing means the book is corrupt → resync */
    sync.push({ bids: [[103, 1]], asks: [], state: 7, previousSequence: 6 });
    assert.equal(sync.status, "invalid");
    assert.equal(lastState(events).error, "Crossed orderbook persisted — resyncing");
}

/* ------------------------------------------------------------
 * 4. a published book clears the crossing streak
 * ---------------------------------------------------------- */
{
    const { sync, events } = makeSync();

    sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 5, ts: 100 });
    sync.push({ bids: [[102, 1]], asks: [], state: 6, previousSequence: 5 });
    assert.equal(sync.crossedStreak, 1);

    /* the level leaves the book again → the book is healthy */
    sync.push({ bids: [[102, 0]], asks: [], state: 7, previousSequence: 6 });
    assert.equal(events.updates.length, 1);
    assert.equal(sync.crossedStreak, 0, "a published book clears the streak");
    assert.equal(hasReason(events, "crossed_book"), true, "the crossing itself was announced");
    assert.equal(sync.crossedSkips, 1, "only the crossing was skipped");
}

/* ------------------------------------------------------------
 * 5. stats() + start() hygiene
 * ---------------------------------------------------------- */
{
    const { sync } = makeSync();
    sync.setSnapshot({ bids: [[100, 1]], asks: [[101, 1]], state: 5, ts: 100 });
    sync.push({ bids: [[100, 2]], asks: [], state: 6, previousSequence: 5 });

    const stats = sync.stats();
    assert.equal(stats.status, "healthy");
    assert.equal(stats.state, 6);
    assert.equal(stats.bids, 1);
    assert.equal(stats.asks, 1);
    assert.equal(stats.crossedSkips, 0);
    assert.equal(stats.anchorRecoveries, 0);
    assert.equal(stats.anchorPending, false);

    sync.start();
    assert.equal(sync.status, "syncing");
    assert.equal(sync.state, null);
    assert.equal(sync.stats().bids, 0);
    assert.equal(sync.anchorPending, false);
}

console.log("depth book sync tests passed: strict chain, startup anchor (fix #6), crossed guard (fix #5)");
