/* ============================================================
 * File: collector/crypto/realtime/spot/depth/depth_pressure.cjs
 * Role:
 *   Spot Depth Pressure
 *   - فشار خرید/فروش از روی عمق بازار
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

module.exports = function spotDepthPressure(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bidTop = Number(data.bids[0]?.[1] || 0);
    const askTop = Number(data.asks[0]?.[1] || 0);

    const pressure =
        bidTop > askTop ? "buy" :
        askTop > bidTop ? "sell" :
        "neutral";

    emit({
        event: "depth_pressure",
        symbol,
        pressure,
        bidTop,
        askTop,
        timestamp: data.timestamp || Date.now()
    });
};
