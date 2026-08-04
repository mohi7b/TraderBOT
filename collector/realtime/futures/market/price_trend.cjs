/**
 * ============================================================
 *  File: price_trend.cjs
 *  Path: collector/realtime/futures/market/price_trend.cjs
 *  Version: 5.3.0 (ENTERPRISE)
 *
 *  Description:
 *      Price trend processor for Binance Futures.
 *      Trend = جهت حرکت قیمت در یک پنجرهٔ زمانی.
 *
 *      این داده برای:
 *      - تشخیص روندهای کوتاه‌مدت
 *      - تشخیص برگشت‌ها
 *      - الگوریتم‌های ML
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesPriceTrend {

    constructor(window = 20) {
        this.window = window;
        this.history = {};
    }

    handle(exchange, symbol, data) {
        const price = Number(data.p);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push(price);

        if (arr.length > this.window) arr.shift();

        const trend = price - arr[0];

        return {
            exchange,
            symbol,
            type: "price_trend",
            price,
            trend,
            samples: arr.length,
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesPriceTrend;
