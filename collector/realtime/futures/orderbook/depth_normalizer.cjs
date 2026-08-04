/**
 * ============================================================
 *  File: depth_normalizer.cjs
 *  Path: collector/realtime/futures/orderbook/depth_normalizer.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Normalizer for Binance Futures orderbook.
 *      Normalization = تبدیل حجم‌ها به مقیاس استاندارد
 *      برای استفاده در:
 *      - مدل‌های ML
 *      - تحلیل‌های آماری
 *      - مقایسهٔ چند صرافی
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthNormalizer {

    constructor(levels = 50) {
        this.levels = levels;
    }

    normalize(arr) {
        const max = Math.max(...arr.map(([_, qty]) => Number(qty)), 1);
        return arr.map(([price, qty]) => ({
            price: Number(price),
            normalized: Number(qty) / max
        }));
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        return {
            exchange,
            symbol,
            type: "depth_normalizer",
            levels: this.levels,
            bids: this.normalize(bids),
            asks: this.normalize(asks),
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthNormalizer;
