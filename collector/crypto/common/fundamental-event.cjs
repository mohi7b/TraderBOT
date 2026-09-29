const HORIZONS = Object.freeze(["micro", "short", "intraday", "medium", "long", "weekly", "monthly", "yearly"]);
const EVENT_TYPES = Object.freeze(["macro", "news", "sentiment"]);
const DIRECTIONS = Object.freeze(["bullish", "bearish", "neutral"]);

function createFundamentalEvent(input = {}) {
    const type = EVENT_TYPES.includes(input.type) ? input.type : "news";
    const horizon = HORIZONS.includes(input.horizon) ? input.horizon : "short";
    const direction = DIRECTIONS.includes(input.direction) ? input.direction : "neutral";
    const timestamp = Number(input.timestamp) || Date.now();
    const importance = Math.max(0, Math.min(1, Number(input.importance) || 0));
    const surprise = Number.isFinite(Number(input.surprise)) ? Number(input.surprise) : null;

    return {
        schemaVersion: 1,
        id: input.id || `${type}:${input.source || "unknown"}:${timestamp}`,
        type,
        source: input.source || "unknown",
        symbol: input.symbol || null,
        region: input.region || null,
        indicator: input.indicator || null,
        title: input.title || null,
        timestamp,
        horizon,
        direction,
        importance,
        surprise,
        expected: input.expected ?? null,
        actual: input.actual ?? null,
        expiresAt: Number(input.expiresAt) || null,
        payload: input.payload || {}
    };
}

module.exports = { HORIZONS, EVENT_TYPES, DIRECTIONS, createFundamentalEvent };
