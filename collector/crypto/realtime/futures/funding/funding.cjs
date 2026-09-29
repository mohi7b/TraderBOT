/* ============================================================
 * File: funding.cjs
 * Path: collector/crypto/realtime/futures/funding/funding.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles normalized realtime funding rate events for futures.
 *
 * Relations:
 *   - Input: exchange normalized funding stream
 *   - Output: funding → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handleFunding({ symbol, data, emit }) {
    if (!data || data.type !== "funding") return;

    const nextFundingTime = Number(data.nextFundingTime);

    emit({
        event: "funding",
        symbol,
        rate: Number(data.rate),
        /* An absent/unknown funding time must be null, never NaN: a non-finite
         * number is treated as data corruption by the validators (and by JSON
         * consumers) and it broke the live-health numbers.finite gate. */
        nextFundingTime: Number.isFinite(nextFundingTime) && nextFundingTime > 0 ? nextFundingTime : null,
        timestamp: data.timestamp
    });
};
