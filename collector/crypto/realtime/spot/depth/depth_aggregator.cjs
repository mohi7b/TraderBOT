/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_aggregator.cjs
 * Role:
 *   Spot Depth Aggregator
 *   - تجمیع عمق بازار اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepthAggregator(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const aggregated = {
        bids: data.bids.slice(0, 50),
        asks: data.asks.slice(0, 50)
    };

    emit({
        event: "depth_aggregator",
        symbol,
        aggregated,
        timestamp: data.timestamp || Date.now()
    });
};
