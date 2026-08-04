/**
 * ============================================================
 *  File: oi.cjs
 *  Path: collector/realtime/futures/market/oi.cjs
 *  Version: 5.1.0 (ENTERPRISE)
 *
 *  Description:
 *      Raw Open Interest processor for Binance USDT-M Futures.
 *      این داده یکی از مهم‌ترین داده‌های فیوچرز است:
 *      - جهت‌گیری بازار
 *      - قدرت لانگ/شورت
 *      - تشخیص روندهای بزرگ
 *      - تشخیص رفتار نهنگ‌ها
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesOI {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "openInterest",
            oi: Number(data.oi),
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesOI;
