/* ============================================================
 * File: funding_delta.cjs
 * Path: collector/crypto/realtime/futures/funding/funding_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta (change) between current and previous funding rate.
 *
 * Relations:
 *   - Input: funding.cjs
 *   - Output: funding_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

let lastRate = null;

module.exports = function handleFundingDelta({ symbol, data, emit }) {
    if (!data || data.type !== "funding") return;

    const current = Number(data.rate);
    const delta = lastRate !== null ? current - lastRate : 0;
    lastRate = current;

    emit({
        event: "funding_delta",
        symbol,
        rate: current,
        delta,
        timestamp: data.timestamp
    });
};
