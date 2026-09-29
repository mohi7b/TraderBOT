/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_full.cjs
 * Role:
 *   Spot Depth Full
 *   - عمق کامل بازار اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepthFull(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    emit({
        event: "depth_full",
        symbol,
        bids: data.bids,
        asks: data.asks,
        timestamp: data.timestamp || Date.now()
    });
};
