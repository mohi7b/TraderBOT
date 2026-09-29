const { DepthBookSync, crc32 } = require("../../../../common/depth-book-sync.cjs");

/**
 * Bitget v2 `books` pushes carry the sequencing in the payload itself:
 *   update   → { asks: [[price, size], ...], bids: [...], ts, seq, pseq }
 *   snapshot → { asks, bids, ts, seq, pseq: 0 } (top-level `action: "snapshot"`)
 * Continuity therefore means `pseq === state` (and `seq > state`); the payload has
 * no `checksum` member, so the optional CRC32 guard below never engages.
 */
class BitgetOrderBookSync extends DepthBookSync {
    constructor(options = {}) {
        super({ ...options,
            normalizeSnapshot: value => ({ bids: value.bids, asks: value.asks, state: Number(value.seq || value.seqNum), sequence: { seq: Number(value.seq || value.seqNum), checksum: Number(value.checksum) || null }, eventTimestamp: Number(value.ts) || Date.now() }),
            normalizeUpdate: value => { const data = value.data || value; const seq = Number(data.seq || data.seqNum); const previousSeq = Number(data.pseq || data.prevSeqNum || data.prevSeq); return Number.isFinite(seq) ? { bids: data.bids || [], asks: data.asks || [], state: seq, previousSeq, checksum: Number(data.checksum), eventTimestamp: Number(data.ts) || Date.now(), sequence: { seq, previousSeq: Number.isFinite(previousSeq) ? previousSeq : null, checksum: Number(data.checksum) || null } } : null; },
            validateUpdate: (update, state, initial, bidsMap, asksMap) => { if (!Number.isFinite(state) || !Number.isFinite(update.state) || update.state <= state) return false; if (Number.isFinite(update.previousSeq) ? update.previousSeq !== state : update.state !== state + 1) return false; if (Number.isFinite(update.checksum)) { const bids = new Map(bidsMap); const asks = new Map(asksMap); for (const level of update.bids) bids.set(Number(level[0]), Number(level[1])); for (const level of update.asks) asks.set(Number(level[0]), Number(level[1])); const bidLevels = [...bids.entries()].filter(([, qty]) => qty > 0).sort((a, b) => b[0] - a[0]); const askLevels = [...asks.entries()].filter(([, qty]) => qty > 0).sort((a, b) => a[0] - b[0]); const values = []; for (let index = 0; index < 25; index += 1) { if (bidLevels[index]) values.push(bidLevels[index][0], bidLevels[index][1]); if (askLevels[index]) values.push(askLevels[index][0], askLevels[index][1]); } if (crc32(values.join(":")) !== update.checksum) return false; } return true; }
        });
    }
}

module.exports = BitgetOrderBookSync;