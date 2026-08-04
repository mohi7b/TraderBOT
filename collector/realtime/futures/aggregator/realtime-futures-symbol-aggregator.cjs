/**
 * ============================================================
 *  File: realtime-futures-symbol-aggregator.cjs
 *  Path: collector/realtime/futures/aggregator/realtime-futures-symbol-aggregator.cjs
 *  Version: 5.7.0 (ENTERPRISE)
 *
 *  Description:
 *      Symbol-level aggregator for Binance Futures.
 *
 *      این فایل تمام داده‌های یک symbol را تجمیع می‌کند:
 *      - price
 *      - price_delta
 *      - price_speed
 *      - price_trend
 *
 *      - mark_price
 *      - mark_price_delta
 *      - mark_price_volatility
 *      - mark_price_trend
 *
 *      - funding
 *      - funding_delta
 *      - funding_trend
 *      - funding_pressure
 *
 *      - oi
 *      - oi_delta
 *      - oi_trend
 *
 *      - depth (raw)
 *      - depth_absorption
 *      - depth_agg
 *      - depth_speed
 *      - depth_pressure
 *      - depth_liquidity
 *      - depth_imbalance
 *      - depth_levels
 *      - depth_heatmap
 *      - depth_normalizer
 *      - depth_clusters
 *
 *      - liquidation
 *      - liquidation_clusters
 *      - liquidation_heatmap
 *      - liquidation_pressure
 *
 *      خروجی این فایل:
 *      - برای استراتژی‌ها
 *      - برای مدل‌های ML
 *      - برای ذخیره‌سازی
 *      - برای داشبورد
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class RealtimeFuturesSymbolAggregator {

    constructor() {
        this.latest = {};
    }

    update(symbol, event) {
        if (!this.latest[symbol]) {
            this.latest[symbol] = {};
        }

        this.latest[symbol][event.type] = event;

        return {
            symbol,
            type: "futures_symbol_aggregate",
            ts: Date.now(),
            data: this.latest[symbol]
        };
    }
}

module.exports = RealtimeFuturesSymbolAggregator;
