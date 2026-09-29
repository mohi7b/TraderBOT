/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_delta.cjs
 * Role:
 *   Spot Depth Delta
 *   - تغییرات لحظه‌ای عمق بازار
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const last = {};

module.exports = function spotDepthDelta(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const prev = last[symbol] || { bids: [], asks: [] };

    const delta = {
        bids: data.bids.length - prev.bids.length,
        asks: data.asks.length - prev.asks.length
    };

    last[symbol] = { bids: data.bids, asks: data.asks };

    emit({
        event: "depth_delta",
        symbol,
        delta,
        timestamp: data.timestamp || Date.now()
    });
};
