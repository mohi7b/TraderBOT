/**
 * ============================================================
 *  File: oi_trend.cjs
 *  Path: collector/realtime/futures/market/oi_trend.cjs
 *  Version: 5.1.0 (ENTERPRISE)
 *
 *  Description:
 *      Trend analyzer for Open Interest.
 *      این داده برای تشخیص:
 *      - روند صعودی OI (ورود پول)
 *      - روند نزولی OI (خروج پول)
 *      - تغییرات ساختاری بازار
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesOITrend {

    constructor() {
        this.history = {};
        this.window = 20; // تعداد نمونه برای تحلیل روند
    }

    handle(exchange, symbol, data) {
        const oi = Number(data.oi);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push(oi);

        if (arr.length > this.window) arr.shift();

        const trend = oi - arr[0];

        return {
            exchange,
            symbol,
            type: "openInterest_trend",
            oi,
            trend,
            samples: arr.length,
            ts: data.ts || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesOITrend;
