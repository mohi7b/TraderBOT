/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/pressure.cjs
 * Role:
 *   Spot Orderflow Pressure
 *   - فشار خرید/فروش از روی جریان سفارش‌ها
 *   - مشابه pressure در فیوچرز
 * ============================================================ */

module.exports = function spotOrderflowPressure(packet) {
    const { symbol, data, emit } = packet;

    const qty = Number(data.qty);
    if (!qty) return;

    const pressure =
        data.side === "buy" ? "buy_pressure" :
        data.side === "sell" ? "sell_pressure" :
        "neutral";

    emit({
        event: "orderflow_pressure",
        symbol,
        price: Number(data.price),
        qty,
        pressure,
        timestamp: data.timestamp || Date.now()
    });
};
