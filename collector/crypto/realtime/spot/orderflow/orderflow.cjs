/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/orderflow.cjs
 * Role:
 *   Spot Orderflow (Main Module)
 *   - جریان سفارش‌ها (Trade Stream)
 *   - تشخیص خرید/فروش واقعی
 *   - مشابه ساختار liquidations/price در فیوچرز
 * ============================================================ */

module.exports = function spotOrderflow(packet) {
    const { symbol, data, emit } = packet;

    if (!data.price || !data.qty || !data.side) return;

    emit({
        event: "orderflow",
        symbol,
        price: Number(data.price),
        qty: Number(data.qty),
        side: data.side, // buy / sell
        timestamp: data.timestamp || Date.now()
    });
};
