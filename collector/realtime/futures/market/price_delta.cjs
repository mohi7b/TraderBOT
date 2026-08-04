/**
 * ============================================================
 *  File: price_delta.cjs
 *  Path: collector/realtime/futures/market/price_delta.cjs
 *  Version: 5.3.0 (ENTERPRISE)
 *
 *  Description:
 *      Price delta processor for Binance Futures.
 *      Delta = تغییرات لحظه‌ای قیمت.
 *      این داده برای:
 *      - تشخیص تغییرات ناگهانی
 *      - تشخیص برگشت‌های سریع
 *      - الگوریتم‌های اسکالپینگ
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesPriceDelta {

    constructor() {
        this.lastPrice = {};
    }

    handle(exchange, symbol, data) {
        const price = Number(data.p);
        const prev = this.lastPrice[symbol] || price;

        const delta = price - prev;

        this.lastPrice[symbol] = price;

        return {
            exchange,
            symbol,
            type: "price_delta",
            price,
            delta,
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesPriceDelta;
