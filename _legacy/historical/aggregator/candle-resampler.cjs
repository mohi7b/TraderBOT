const { INTERVAL_MS } = require("./candle-history-store.cjs");

/** Builds a higher-timeframe candle from closed lower-timeframe candles covering exactly one bucket. */
function resample(sourceCandles, targetInterval) {
    const bucketMs = INTERVAL_MS[targetInterval];
    if (!bucketMs || !sourceCandles.length) return null;

    const openTime = Math.floor(sourceCandles[0].openTime / bucketMs) * bucketMs;
    const ordered = [...sourceCandles].sort((a, b) => a.openTime - b.openTime);

    return {
        openTime,
        closeTime: openTime + bucketMs - 1,
        open: ordered[0].open,
        high: Math.max(...ordered.map((candle) => candle.high)),
        low: Math.min(...ordered.map((candle) => candle.low)),
        close: ordered[ordered.length - 1].close,
        volume: ordered.reduce((sum, candle) => sum + candle.volume, 0),
        buyVolume: ordered.reduce((sum, candle) => sum + (candle.buyVolume || 0), 0),
        sellVolume: ordered.reduce((sum, candle) => sum + (candle.sellVolume || 0), 0),
        sourceCandles: ordered.length,
        isComplete: true
    };
}

module.exports = { resample };
