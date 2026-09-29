/* ============================================================
 * File: funding_aggregator.cjs
 * Path: collector/crypto/realtime/futures/funding/funding_aggregator.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Aggregates all funding-related signals into a single packet.
 *
 * Relations:
 *   - Input: funding, funding_delta, funding_trend, funding_pressure
 *   - Output: funding_aggregated → worker
 * ============================================================ */

module.exports = function handleFundingAggregator({ symbol, data, emit }) {
    const allowed = [
        "funding",
        "funding_delta",
        "funding_trend",
        "funding_pressure"
    ];

    if (!data || !allowed.includes(data.event)) return;

    emit({
        event: "funding_aggregated",
        symbol,
        payload: data,
        timestamp: data.timestamp
    });
};
