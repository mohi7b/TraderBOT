/* ============================================================
 * File: oi.cjs
 * Path: collector/crypto/realtime/futures/oi/oi.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles normalized realtime Open Interest events for futures.
 *
 * Relations:
 *   - Input: exchange normalized oi stream
 *   - Output: oi → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handleOI({ symbol, data, emit }) {
    if (!data || data.type !== "oi") return;

    emit({
        event: "oi",
        symbol,
        oi: Number(data.oi),
        timestamp: data.timestamp
    });
};
