const { DepthBookSync, crc32 } = require("../../../../common/depth-book-sync.cjs");

class OKXOrderBookSync extends DepthBookSync {
    constructor(options = {}) {
        super({ ...options,
            normalizeSnapshot: value => ({ bids: value.bids, asks: value.asks, state: Number(value.seqId), sequence: { seqId: Number(value.seqId), prevSeqId: Number(value.prevSeqId) || null, checksum: Number(value.checksum) || null }, eventTimestamp: Number(value.ts) || Date.now() }),
            normalizeUpdate: value => { const data = value.data || value; const seqId = Number(data.seqId); return Number.isFinite(seqId) ? { bids: data.bids || [], asks: data.asks || [], state: seqId, previousSeqId: Number(data.prevSeqId), checksum: Number(data.checksum), eventTimestamp: Number(data.ts) || Date.now(), sequence: { seqId, previousSeqId: Number(data.prevSeqId) || null, checksum: Number(data.checksum) || null } } : null; },
            validateUpdate: (update, state, initial, bidsMap, asksMap) => { if (!state || update.previousSeqId !== state || update.state <= state) return false; if (Number.isFinite(update.checksum) && update.checksum !== 0) { const bids = new Map(bidsMap); const asks = new Map(asksMap); for (const level of update.bids) bids.set(Number(level[0]), Number(level[1])); for (const level of update.asks) asks.set(Number(level[0]), Number(level[1])); const bidLevels = [...bids.entries()].filter(([, qty]) => qty > 0).sort((a, b) => b[0] - a[0]); const askLevels = [...asks.entries()].filter(([, qty]) => qty > 0).sort((a, b) => a[0] - b[0]); const values = []; for (let index = 0; index < 25; index += 1) { if (bidLevels[index]) values.push(bidLevels[index][0], bidLevels[index][1]); if (askLevels[index]) values.push(askLevels[index][0], askLevels[index][1]); } if (crc32(values.join(":")) !== update.checksum) return false; } return true; }
        });
    }
}

module.exports = OKXOrderBookSync;