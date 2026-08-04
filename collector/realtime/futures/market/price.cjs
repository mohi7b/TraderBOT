/**
 * ============================================================
 *  File: price.cjs
 *  Path: collector/realtime/futures/market/price.cjs
 *  Version: 5.3.0 (ENTERPRISE)
 *
 *  Description:
 *      Raw price processor for Binance USDT-M Futures.
 *      این داده پایهٔ تمام تحلیل‌های قیمت است.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesPrice {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "price",
            price: Number(data.p),
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesPrice;
