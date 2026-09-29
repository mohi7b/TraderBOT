const { DepthBookSync } = require("../../../../common/depth-book-sync.cjs");

/**
 * KuCoin futures `/contractMarket/level2` pushes one price level per message:
 *   { sequence, change: "<price>,<side>,<size>", timestamp }
 * `sequence` increases by exactly 1 per message and the REST `/level2/snapshot`
 * seed shares the same counter, so continuity means `sequence - 1 === state`.
 * The futures feed emits `price,side,size` (spot emits `side,price,size`), so the
 * side token is located instead of assuming a fixed position.
 */
function parseChange(change) {
    const tokens = String(Array.isArray(change) ? change[0] : change || "").split(",");
    const sideIndex = tokens.findIndex(token => token === "buy" || token === "sell");
    if (sideIndex < 0) return null;
    const values = tokens.filter((token, index) => index !== sideIndex).map(Number);
    if (values.length < 2 || !values.every(Number.isFinite)) return null;
    return { side: tokens[sideIndex], price: values[0], size: values[1] };
}

class KucoinOrderBookSync extends DepthBookSync {
    constructor(options = {}) {
        super({ ...options,
            normalizeSnapshot: value => ({ bids: value.bids, asks: value.asks, state: Number(value.sequence), sequence: { sequence: Number(value.sequence) }, eventTimestamp: Number(value.timestamp) || Date.now() }),
            normalizeUpdate: value => { const data = value.data || value; const sequence = Number(data.sequence); const change = parseChange(data.change); return Number.isFinite(sequence) && change ? { bids: change.side === "buy" ? [[change.price, change.size]] : [], asks: change.side === "sell" ? [[change.price, change.size]] : [], state: sequence, previousSequence: sequence - 1, eventTimestamp: Number(data.timestamp) || Date.now(), sequence: { sequence, previousSequence: sequence - 1 } } : null; },
            validateUpdate: (update, state) => Boolean(Number.isFinite(state) && update.state > state && update.previousSequence === state)
        });
    }
}

KucoinOrderBookSync.parseChange = parseChange;

module.exports = KucoinOrderBookSync;