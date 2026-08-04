/**
 * ============================================================
 *  File: mark_price_trend.cjs
 *  Path: collector/realtime/futures/market/mark_price_trend.cjs
 *  Version: 5.5.0 (ENTERPRISE)
 *
 *  Description:
 *      Mark Price Trend processor for Binance Futures.
 *      Trend = جهت حرکت مارک‌پرایس در یک پنجرهٔ زمانی.
 *
 *      مارک‌پرایس از میانگین قیمت چند صرافی ساخته می‌شود
 *      و روند آن برای تحلیل رفتار بازار حیاتی است. 
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesMarkPriceTrend {

    constructor(window = 20) {
        this.window = window;
        this.history = {};
    }

    handle(exchange, symbol, data) {
        const mark = Number(data.p);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push(mark);

        if (arr.length > this.window) arr.shift();

        const trend = mark - arr[0];

        return {
            exchange,
            symbol,
            type: "mark_price_trend",
            markPrice: mark,
            trend,
            samples: arr.length,
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesMarkPriceTrend;
