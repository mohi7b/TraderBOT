/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_20.cjs
 * Role:
 *   Spot Depth 20
 *   - دریافت عمق سبک (20 سطح)
 *   - مناسب برای سرعت بالا
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepth20(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    emit({
        event: "depth_20",
        symbol,
        bids: data.bids.slice(0, 20),
        asks: data.asks.slice(0, 20),
        timestamp: data.timestamp || Date.now()
    });
};
