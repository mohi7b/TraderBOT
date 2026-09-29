class DepthBookSync {
    constructor({ fetchSnapshot, normalizeSnapshot, normalizeUpdate, validateUpdate, onSnapshot, onUpdate, onStateChange, maxCrossedStreak = 3 }) {
        this.fetchSnapshot = fetchSnapshot;
        this.normalizeSnapshot = normalizeSnapshot;
        this.normalizeUpdate = normalizeUpdate;
        this.validateUpdate = validateUpdate;
        this.onSnapshot = onSnapshot || (() => {});
        this.onUpdate = onUpdate || (() => {});
        this.onStateChange = onStateChange || (() => {});
        this.bids = new Map();
        this.asks = new Map();
        this.buffer = [];
        this.state = null;
        this.status = "syncing";
        this.loading = false;

        /* fix #5 — a synced book can never be crossed (bestBid >= bestAsk): a
         * crossing proves an update was lost, so that level snapshot must not
         * be published. A single crossing is dropped with a notification; a run
         * of `maxCrossedStreak` crossings forces a resync. */
        this.maxCrossedStreak = Number(maxCrossedStreak) > 0 ? Number(maxCrossedStreak) : 3;
        this.crossedSkips = 0;
        this.crossedStreak = 0;
        this.crossedSamples = [];

        /* fix #6 — when the REST seed is newer than everything buffered, the
         * buffer can never re-attach to it. The next LIVE update becomes the
         * new anchor (forward-only) instead of a false "invalid" resync loop. */
        this.anchorPending = false;
        this.anchorRecoveries = 0;
        this.lastAnchor = null;
    }

    start() {
        this.status = "syncing";
        this.state = null;
        this.bids.clear();
        this.asks.clear();
        this.buffer = [];
        this.crossedStreak = 0;
        this.anchorPending = false;
        this.onStateChange(this.status);
        return this.loadSnapshot();
    }

    push(raw) {
        const update = this.normalizeUpdate(raw);
        if (!update) return false;
        if (this.status !== "healthy") {
            this.buffer.push(update);
            if (this.buffer.length > 2000) this.buffer.shift();
            return false;
        }
        return this.apply(update, this.anchorPending);
    }

    async loadSnapshot() {
        if (this.loading || !this.fetchSnapshot) return;
        this.loading = true;
        try {
            const snapshot = await this.fetchSnapshot();
            this.setSnapshot(snapshot);
        } catch (error) {
            this.status = "invalid";
            this.onStateChange(this.status, error);
        } finally {
            this.loading = false;
        }
    }

    setSnapshot(raw) {
        const snapshot = this.normalizeSnapshot(raw);
        if (!snapshot) throw new Error("Invalid orderbook snapshot");
        this.bids = this.toMap(snapshot.bids);
        this.asks = this.toMap(snapshot.asks);
        this.state = snapshot.state;
        this.status = "healthy";
        this.emitBook("snapshot", snapshot.eventTimestamp, snapshot.sequence);
        const pending = this.buffer;
        this.buffer = [];
        const first = pending.findIndex(update => this.validateUpdate(update, this.state, true, this.bids, this.asks));
        if (first < 0) {
            if (!pending.length) {
                /* Nothing was buffered: the seed IS the anchor and the next live
                 * update must continue it exactly — a gap here is real. */
                this.onStateChange(this.status, null, { reason: "awaiting_first_update", state: this.state });
                return true;
            }
            /* fix #6 — every buffered update is older than the seed (the REST
             * snapshot raced ahead of the live buffer), so none of them can
             * re-attach to it. Dropping them is correct; waiting for the next
             * live update and anchoring on it is what avoids the resync loop a
             * strict `previousSequence === state` rule would create. */
            this.anchorPending = true;
            this.onStateChange(this.status, null, {
                reason: "buffer_older_than_snapshot",
                dropped: pending.length,
                state: this.state
            });
            return true;
        }
        for (const update of pending.slice(first)) {
            if (!this.apply(update, false)) return false;
        }
        this.status = "healthy";
        this.onStateChange(this.status);
        return true;
    }

    apply(update, anchor = false) {
        const valid = anchor ? this.anchorValid(update) : this.validateUpdate(update, this.state, false, this.bids, this.asks);

        if (!valid) {
            this.status = "invalid";
            this.onStateChange(this.status, new Error("Orderbook sequence or checksum validation failed"));
            return false;
        }

        if (anchor) {
            this.anchorPending = false;
            this.anchorRecoveries += 1;
            this.lastAnchor = { from: this.state, to: update.state, at: Date.now() };
            this.onStateChange(this.status, null, { reason: "anchored_on_live_update", ...this.lastAnchor });
        }

        this.applyLevels(this.bids, update.bids);
        this.applyLevels(this.asks, update.asks);
        this.state = update.state;
        this.status = "healthy";
        this.emitBook("update", update.eventTimestamp, update.sequence, update);
        return true;
    }

    /**
     * fix #6 — structural validity of an update that may become the new anchor:
     * it has to move the book forward, but it does not have to continue the
     * current sequence (that is exactly what re-anchoring means).
     */
    anchorValid(update) {
        const next = Number(update && update.state);
        if (!Number.isFinite(next)) return false;
        const state = Number(this.state);
        if (!Number.isFinite(state)) return true;
        return next > state;
    }

    output(timestamp, sequence, update = {}) {
        return { bids: this.ordered(this.bids, "desc"), asks: this.ordered(this.asks, "asc"), eventTimestamp: timestamp, sequence, update };
    }

    /**
     * fix #5 — single emit path for snapshots and updates: a crossed book is
     * never published, and a persistent crossing escalates to a resync.
     */
    emitBook(kind, timestamp, sequence, update = {}) {
        const book = this.output(timestamp, sequence, update);

        if (!isCrossed(book)) {
            this.crossedStreak = 0;
            if (kind === "snapshot") this.onSnapshot(book);
            else this.onUpdate(book);
            return book;
        }

        this.crossedSkips += 1;
        this.crossedStreak += 1;

        const evidence = {
            reason: "crossed_book",
            kind,
            bestBid: book.bids[0] ? book.bids[0].price : null,
            bestAsk: book.asks[0] ? book.asks[0].price : null,
            skipped: this.crossedSkips
        };

        if (this.crossedSamples.length < 5) this.crossedSamples.push({ ...evidence, at: Date.now() });

        if (this.crossedStreak >= this.maxCrossedStreak) {
            this.status = "invalid";
            this.onStateChange(this.status, new Error("Crossed orderbook persisted — resyncing"), evidence);
            return null;
        }

        this.onStateChange(this.status, null, evidence);
        return null;
    }

    stats() {
        return {
            status: this.status,
            state: this.state,
            buffered: this.buffer.length,
            bids: this.bids.size,
            asks: this.asks.size,
            crossedSkips: this.crossedSkips,
            crossedStreak: this.crossedStreak,
            anchorRecoveries: this.anchorRecoveries,
            anchorPending: this.anchorPending,
            lastAnchor: this.lastAnchor
        };
    }

    applyLevels(target, levels) {
        for (const [priceValue, qtyValue] of levels || []) {
            const price = Number(priceValue);
            const qty = Number(qtyValue);
            if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
            if (qty <= 0) target.delete(price);
            else target.set(price, qty);
        }
    }

    toMap(levels) { const map = new Map(); this.applyLevels(map, levels); return map; }

    ordered(map, direction) {
        return [...map.entries()].sort((a, b) => direction === "desc" ? b[0] - a[0] : a[0] - b[0]).map(([price, qty]) => ({ price, qty }));
    }
}

/**
 * fix #5 — a synced book is crossed when its best bid is not strictly below its
 * best ask. An empty or non-finite side is not a crossing.
 */
function isCrossed(book) {
    const bid = book && book.bids && book.bids[0];
    const ask = book && book.asks && book.asks[0];
    if (!bid || !ask) return false;
    const bestBid = Number(bid.price);
    const bestAsk = Number(ask.price);
    if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return false;
    return bestBid >= bestAsk;
}

function crc32(value) {
    let crc = 0xffffffff;
    for (let index = 0; index < value.length; index += 1) {
        crc ^= value.charCodeAt(index);
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) | 0;
}

module.exports = { DepthBookSync, crc32, isCrossed };