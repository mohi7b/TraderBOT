/**
 * ============================================================
 *  File: funding_pressure.cjs
 *  Path: collector/realtime/futures/market/funding_pressure.cjs
 *  Version: 5.4.0 (ENTERPRISE)
 *
 *  Description:
 *      Funding Pressure processor for Binance Futures.
 *      Pressure = فشار لانگ/شورت بر اساس نرخ فاندینگ.
 *
 *      اگر rate > 0 → لانگ‌ها پول می‌دهند → فشار فروش
 *      اگر rate < 0 → شورت‌ها پول می‌دهند → فشار خرید
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesFundingPressure {

    handle(exchange, symbol, data) {
        const rate = Number(data.f);

        const pressure =
            rate > 0 ? "sell_pressure" :
            rate < 0 ? "buy_pressure" :
            "neutral";

        return {
            exchange,
            symbol,
            type: "funding_pressure",
            rate,
            pressure,
            ts: data.t || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesFundingPressure;
