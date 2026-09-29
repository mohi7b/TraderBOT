// Dynamic Summary Builder.
//
// Produces a lightweight market summary from raw 1m candles (via the Dynamic Timeframe Builder). No summary
// is persisted: metrics are recomputed on demand from candles_1m.db.
//
// Output shape (facts object):
//   last_close, last_volume, change_percent, high, low, volatility, trend, structure.

const { buildTf } = require("../timeframe/build-tf.cjs");
const { assertTf, tfWidthMs } = require("../timeframe/utils.cjs");
const { DEFAULT_ROOT } = require("../root.cjs");

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Bar-to-bar close returns (decimal fractions). Empty when fewer than 2 bars.
function closeReturns(candles) {
    const out = [];
    for (let i = 1; i < candles.length; i += 1) {
        const prev = candles[i - 1].close;
        if (prev !== 0) out.push((candles[i].close - prev) / prev);
    }
    return out;
}

function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values) {
    if (values.length === 0) return 0;
    const m = mean(values);
    const variance = values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
    return Math.sqrt(variance);
}

// Classifies the near-term direction from the slope of recent closes using a simple linear regression over
// the last `lookback` bars. Returns { direction: "up"|"down"|"flat", slope }.
function trendSnapshot(candles, lookback = 8) {
    const tail = candles.slice(-lookback);
    if (tail.length < 2) return Object.freeze({ direction: "flat", slope: 0 });

    const n = tail.length;
    const xs = tail.map((_, i) => i);
    const ys = tail.map((c) => c.close);
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i += 1) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) * (xs[i] - mx);
    }
    const slope = den === 0 ? 0 : num / den;
    const scale = my === 0 ? 0 : slope / my; // normalised slope
    const direction = scale > 0.0005 ? "up" : scale < -0.0005 ? "down" : "flat";
    return Object.freeze({ direction, slope });
}

// Structure snapshot: where the last close sits within the recent high/low range, plus the number of local
// swing highs/lows in the tail (a rough support/resistance density signal).
function structureSnapshot(candles, lookback = 20) {
    const tail = candles.slice(-lookback);
    if (tail.length === 0) return Object.freeze({ position: null, swingHighs: 0, swingLows: 0 });

    let high = -Infinity;
    let low = Infinity;
    for (const c of tail) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }
    const last = tail[tail.length - 1].close;
    const range = high - low;
    const position = range === 0 ? 0.5 : (last - low) / range;

    let swingHighs = 0;
    let swingLows = 0;
    for (let i = 1; i < tail.length - 1; i += 1) {
        if (tail[i].high > tail[i - 1].high && tail[i].high > tail[i + 1].high) swingHighs += 1;
        if (tail[i].low < tail[i - 1].low && tail[i].low < tail[i + 1].low) swingLows += 1;
    }

    return Object.freeze({
        position: Number(position.toFixed(4)),
        swingHighs,
        swingLows,
    });
}

// Builds the dynamic summary for a symbol + timeframe.
function buildSummary(symbol, tf, { exchange = null, from = null, to = null, rootDir = DEFAULT_ROOT } = {}) {
    const resolved = symbol.trim().toUpperCase();
    const key = assertTf(tf);
    const candles = buildTf(resolved, key, { exchange, from, to, rootDir });

    if (candles.length === 0) {
        return Object.freeze({
            symbol: resolved,
            tf: key,
            candles: 0,
            last_close: null,
            last_volume: 0,
            change_percent: null,
            high: null,
            low: null,
            volatility: null,
            trend: Object.freeze({ direction: "flat", slope: 0 }),
            structure: Object.freeze({ position: null, swingHighs: 0, swingLows: 0 }),
        });
    }

    const last = candles[candles.length - 1];
    const prevClose = candles.length >= 2 ? candles[candles.length - 2].close : last.open;
    const changePercent = prevClose === 0 ? null : ((last.close - prevClose) / prevClose) * 100;

    let high = -Infinity;
    let low = Infinity;
    for (const c of candles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }

    const returns = closeReturns(candles);
    // Annualised volatility: per-bar return stddev scaled by sqrt(bars per year) for this timeframe.
    const barsPerYear = YEAR_MS / tfWidthMs(key);
    const volatility = returns.length ? stddev(returns) * Math.sqrt(barsPerYear) : 0;

    return Object.freeze({
        symbol: resolved,
        tf: key,
        candles: candles.length,
        last_close: last.close,
        last_volume: last.volume,
        change_percent: Number(changePercent.toFixed(4)),
        high,
        low,
        volatility: Number(volatility.toFixed(6)),
        trend: trendSnapshot(candles),
        structure: structureSnapshot(candles),
    });
}

module.exports = { buildSummary, closeReturns, trendSnapshot, structureSnapshot, mean, stddev };
