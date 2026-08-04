/**
 * ============================================================
 *  File: oi_aggregator.cjs
 *  Path: collector/realtime/futures/aggregator/oi_aggregator.cjs
 *  Version: 5.1.0 (ENTERPRISE)
 *
 *  Description:
 *      Aggregates Open Interest data from multiple processors:
 *      - Raw OI
 *      - OI Delta
 *      - OI Trend
 *
 *      خروجی این فایل برای:
 *      - مدل‌های ML
 *      - تحلیل‌های پیشرفته
 *      - بخش استراتژی‌ها
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesOIAggregator {

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
            type: "openInterest_aggregate",
            oi: this.latest[symbol].openInterest?.oi || null,
            delta: this.latest[symbol].openInterest_delta?.delta || null,
            trend: this.latest[symbol].openInterest_trend?.trend || null,
            ts: Date.now(),
            raw: this.latest[symbol]
        };
    }
}

module.exports = FuturesOIAggregator;
