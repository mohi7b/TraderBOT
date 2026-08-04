/**
 * ============================================================
 *  File: price_speed.cjs
 *  Path: collector/realtime/futures/market/price_speed.cjs
 *  Version: 5.3.0 (ENTERPRISE)
 *
 *  Description:
 *      Price speed processor for Binance Futures.
 *      Speed = سرعت تغییر قیمت در واحد زمان.
 *      این داده برای:
 *      - تشخیص مومنتوم
 *      - تشخیص حرکت‌های سریع
 *      - مدل‌های ML
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesPriceSpeed {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const price = Number(data.p);
        const ts = data.T || Date.now();

        const prev = this.last[symbol] || { price, ts };

        const dt = (ts - prev.ts) || 1;
        const dp = price - prev.price;

        const speed = dp / dt;

        this.last[symbol] = { price, ts };

        return {
            exchange,
            symbol,
            type: "price_speed",
            price,
            speed,
            ts,
            raw: data
        };
    }
}

module.exports = FuturesPriceSpeed;
