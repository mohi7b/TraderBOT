/**
 * ============================================================
 *  File: liquidation_clusters.cjs
 *  Path: collector/realtime/futures/liquidation/liquidation_clusters.cjs
 *  Version: 5.6.0 (ENTERPRISE)
 *
 *  Description:
 *      Liquidation Clusters processor for Binance Futures.
 *
 *      Clusters = نقاطی که حجم زیادی لیکوئیدیشن در یک سطح قیمت رخ می‌دهد.
 *      این داده برای:
 *      - تشخیص محل ضربهٔ نهنگ‌ها
 *      - تشخیص نقاط برگشت قیمت
 *      - تحلیل رفتار بازار در زمان‌های بحرانی
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesLiquidationClusters {

    constructor(threshold = 50000) {
        this.threshold = threshold; // حداقل حجم برای تشکیل خوشه
    }

    handle(exchange, symbol, data) {
        const price = Number(data.o.p);
        const qty   = Number(data.o.q);
        const side  = data.o.S;

        const isCluster = qty >= this.threshold;

        return {
            exchange,
            symbol,
            type: "liquidation_clusters",
            price,
            qty,
            side,
            isCluster,
            threshold: this.threshold,
            ts: data.o.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesLiquidationClusters;
