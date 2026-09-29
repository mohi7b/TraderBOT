const { DepthBookSync } = require("../../../../common/depth-book-sync.cjs");

class BybitOrderBookSync extends DepthBookSync {
    constructor(options = {}) {
        super({ ...options,
            normalizeSnapshot: value => ({ bids: value.b || value.bids, asks: value.a || value.asks, state: Number(value.u || value.updateId), sequence: { updateId: Number(value.u || value.updateId), seq: Number(value.seq) || null }, eventTimestamp: Number(value.ts || value.cts || value.E) || Date.now() }),
            normalizeUpdate: value => { const data = value.data || value; if (data.type === "snapshot") return null; const updateId = Number(data.u); return Number.isFinite(updateId) ? { bids: data.b || [], asks: data.a || [], state: updateId, previousUpdateId: Number(data.pu), eventTimestamp: Number(data.ts || data.cts || data.E) || Date.now(), sequence: { updateId, previousUpdateId: Number(data.pu) || null, seq: Number(data.seq) || null } } : null; },
            validateUpdate: (update, state) => Boolean(state && update.state > state && (update.previousUpdateId ? update.previousUpdateId === state : update.state === state + 1))
        });
    }
}

module.exports = BybitOrderBookSync;