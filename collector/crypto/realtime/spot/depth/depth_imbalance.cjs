/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_imbalance.cjs
 * Role:
 *   Spot Depth Imbalance
 *   - عدم تعادل سفارش‌ها
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepthImbalance(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bidSum = data.bids.reduce((a, b) => a + Number(b[1]), 0);
    const askSum = data.asks.reduce((a, b) => a + Number(b[1]), 0);

    const imbalance = bidSum - askSum;

    emit({
        event: "depth_imbalance",
        symbol,
        imbalance,
        bidSum,
        askSum,
        timestamp: data.timestamp || Date.now()
    });
};
