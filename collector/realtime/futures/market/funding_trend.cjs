/**
 * ============================================================
 *  File: funding_trend.cjs
 *  Path: collector/realtime/futures/market/funding_trend.cjs
 *  Version: 5.4.0 (ENTERPRISE)
 *
 *  Description:
 *      Funding Trend processor for Binance Futures.
 *      Trend = جهت حرکت نرخ فاندینگ در یک پنجرهٔ زمانی.
 *
 *      کاربردها:
 *      - تشخیص روند فاندینگ
 *      - تشخیص فشار میان‌مدت بازار
 *      - تحلیل جهت‌گیری لانگ/شورت
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesFundingTrend {

    constructor(window = 20) {
        this.window = window;
        this.history = {};
    }

    handle(exchange, symbol, data) {
        const rate = Number(data.f);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push(rate);

        if (arr.length > this.window) arr.shift();

        const trend = rate - arr[0];

        return {
            exchange,
            symbol,
            type: "funding_trend",
            rate,
            trend,
            samples: arr.length,
            ts: data.t || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesFundingTrend;
