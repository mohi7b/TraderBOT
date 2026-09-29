const { prune } = require("../retention-policy.cjs");

const INTERVAL_MS = Object.freeze({
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000
});

class CandleHistoryStore {
    constructor() {
        this.candles = new Map(); // key: symbol:market:interval -> candle[]
    }

    key(symbol, market, interval) {
        return `${symbol}:${market}:${interval}`;
    }

    upsert(symbol, market, interval, candle) {
        const key = this.key(symbol, market, interval);
        const list = this.candles.get(key) || [];
        const last = list[list.length - 1];
        if (last && last.openTime === candle.openTime) list[list.length - 1] = candle;
        else list.push(candle);
        this.candles.set(key, list);
        return candle;
    }

    values(symbol, market, interval) {
        return this.candles.get(this.key(symbol, market, interval)) || [];
    }

    pruneAll(now = Date.now()) {
        for (const [key, list] of this.candles) {
            const interval = key.split(":")[2];
            this.candles.set(key, prune(list, { interval, getTimestamp: (candle) => candle.openTime }, now));
        }
    }
}

module.exports = { CandleHistoryStore, INTERVAL_MS };
