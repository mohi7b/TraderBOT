/**
 * ============================================================
 *  File: depth_clusters.cjs
 *  Path: collector/realtime/futures/orderbook/depth_clusters.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Liquidity Clusters processor for Binance Futures orderbook.
 *
 *      Clusters = نقاطی که حجم زیادی در یک سطح قیمت جمع شده باشد.
 *      این داده برای:
 *      - تشخیص مناطق مهم نقدینگی
 *      - تشخیص نقاط برگشت قیمت
 *      - تشخیص محل قرارگیری سفارشات نهنگ‌ها
 *      - تحلیل Orderflow پیشرفته
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthClusters {

    constructor(levels = 50, threshold = 0.02) {
        this.levels = levels;
        this.threshold = threshold; // درصدی از کل حجم برای تشخیص خوشه
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const bid_total = bids.reduce((sum, [_, qty]) => sum + Number(qty), 0);
        const ask_total = asks.reduce((sum, [_, qty]) => sum + Number(qty), 0);

        const bid_clusters = bids
            .filter(([_, qty]) => Number(qty) > bid_total * this.threshold)
            .map(([price, qty]) => ({
                price: Number(price),
                qty: Number(qty),
                side: "bid"
            }));

        const ask_clusters = asks
            .filter(([_, qty]) => Number(qty) > ask_total * this.threshold)
            .map(([price, qty]) => ({
                price: Number(price),
                qty: Number(qty),
                side: "ask"
            }));

        return {
            exchange,
            symbol,
            type: "depth_clusters",
            levels: this.levels,
            threshold: this.threshold,
            bid_clusters,
            ask_clusters,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthClusters;
