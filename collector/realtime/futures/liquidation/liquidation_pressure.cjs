/**
 * ============================================================
 *  File: liquidation_pressure.cjs
 *  Path: collector/realtime/futures/liquidation/liquidation_pressure.cjs
 *  Version: 5.6.0 (ENTERPRISE)
 *
 *  Description:
 *      Liquidation Pressure processor for Binance Futures.
 *
 *      Pressure = فشار لانگ/شورت بر اساس لیکوئیدیشن‌ها.
 *
 *      اگر لیکوئیدیشن لانگ باشد → فشار فروش
 *      اگر لیکوئیدیشن شورت باشد → فشار خرید
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesLiquidationPressure {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const qty  = Number(data.o.q);
        const side = data.o.S;

        const pressure =
            side === "BUY"  ? "buy_liquidation" :
            side === "SELL" ? "sell_liquidation" :
            "unknown";

        return {
            exchange,
            symbol,
            type: "liquidation_pressure",
            qty,
            side,
            pressure,
            ts: data.o.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesLiquidationPressure;
