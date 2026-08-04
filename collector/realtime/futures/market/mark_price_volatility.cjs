/**
 * ============================================================
 *  File: mark_price_volatility.cjs
 *  Path: collector/realtime/futures/market/mark_price_volatility.cjs
 *  Version: 5.5.0 (ENTERPRISE)
 *
 *  Description:
 *      Mark Price Volatility processor for Binance Futures.
 *      Volatility = میزان نوسان مارک‌پرایس در یک پنجرهٔ زمانی.
 *
 *      مارک‌پرایس برای جلوگیری از لیکوئیدیشن‌های غیرمنصفانه استفاده می‌شود
 *      و باید نوسان آن دقیقاً اندازه‌گیری شود. 
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesMarkPriceVolatility {

    constructor(window = 30) {
        this.window = window;
        this.history = {};
    }

    handle(exchange, symbol, data) {
        const mark = Number(data.p);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push(mark);

        if (arr.length > this.window) arr.shift();

        const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
        const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
        const volatility = Math.sqrt(variance);

        return {
            exchange,
            symbol,
            type: "mark_price_volatility",
            markPrice: mark,
            volatility,
            samples: arr.length,
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesMarkPriceVolatility;
