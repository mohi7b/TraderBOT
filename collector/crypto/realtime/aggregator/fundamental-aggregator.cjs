const { HORIZONS } = require("../../common/fundamental-event.cjs");

function signedDirection(direction) {
    return direction === "bullish" ? 1 : direction === "bearish" ? -1 : 0;
}

class FundamentalAggregator {
    aggregate(symbol, events = []) {
        const byHorizon = Object.fromEntries(HORIZONS.map((horizon) => [horizon, {
            score: 0,
            confidence: 0,
            count: 0,
            latest: null,
            macro: [],
            news: [],
            sentiment: []
        }]));

        for (const event of events) {
            if (event.symbol && event.symbol !== symbol) continue;
            const bucket = byHorizon[event.horizon] || byHorizon.short;
            const weight = Math.max(0, Math.min(1, Number(event.importance) || 0));
            bucket.score += signedDirection(event.direction) * weight;
            bucket.confidence += weight;
            bucket.count += 1;
            bucket.latest = !bucket.latest || event.timestamp >= bucket.latest.timestamp ? event : bucket.latest;
            bucket[event.type].push(event);
        }

        for (const bucket of Object.values(byHorizon)) {
            bucket.score = bucket.confidence ? Math.max(-1, Math.min(1, bucket.score / bucket.confidence)) : 0;
            bucket.confidence = Math.min(1, bucket.confidence);
        }

        const macroBias = byHorizon.yearly.score * 0.35 + byHorizon.monthly.score * 0.3 + byHorizon.weekly.score * 0.2 + byHorizon.long.score * 0.15;
        const shortShock = Math.max(Math.abs(byHorizon.micro.score), Math.abs(byHorizon.short.score));
        return {
            symbol,
            updatedAt: Date.now(),
            byHorizon,
            regime: { score: macroBias, direction: macroBias > 0.2 ? "bullish" : macroBias < -0.2 ? "bearish" : "neutral" },
            shortShock: { score: shortShock, active: shortShock >= 0.6 },
            rangeContext: {
                supportResistanceBias: (byHorizon.intraday.score + byHorizon.medium.score) / 2,
                eventCount: events.length
            }
        };
    }
}

module.exports = FundamentalAggregator;
