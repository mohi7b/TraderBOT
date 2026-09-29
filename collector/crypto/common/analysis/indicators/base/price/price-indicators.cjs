function sma(values, period) {
    const input = values.filter(Number.isFinite);
    if (!input.length || input.length < period) return null;
    return input.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function ema(values, period) {
    const input = values.filter(Number.isFinite);
    if (!input.length || input.length < period) return null;
    const multiplier = 2 / (period + 1);
    let result = input.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    for (const value of input.slice(period)) result = (value - result) * multiplier + result;
    return result;
}

function returns(values, lookback = 1) {
    if (values.length <= lookback) return null;
    const previous = Number(values[values.length - 1 - lookback]);
    const current = Number(values[values.length - 1]);
    return Number.isFinite(previous) && previous !== 0 && Number.isFinite(current) ? (current - previous) / previous : null;
}

function trueRange(candle, previousClose) {
    if (!candle) return null;
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(previousClose);
    if (![high, low].every(Number.isFinite)) return null;
    return Number.isFinite(close) ? Math.max(high - low, Math.abs(high - close), Math.abs(low - close)) : high - low;
}

function atr(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < period) return null;
    const ranges = candles.map((candle, index) => trueRange(candle, candles[index - 1]?.close)).filter(Number.isFinite);
    return ranges.length < period ? null : sma(ranges, period);
}

module.exports = { sma, ema, returns, trueRange, atr };
