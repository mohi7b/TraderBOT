/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_100.cjs
 * Role:
 *   Spot Depth 100
 *   - عمق متوسط (100 سطح)
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepth100(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    emit({
        event: "depth_100",
        symbol,
        bids: data.bids.slice(0, 100),
        asks: data.asks.slice(0, 100),
        timestamp: data.timestamp || Date.now()
    });
};
