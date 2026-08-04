/**
 * ============================================================
 *  File: historical-symbol-aggregator.cjs
 *  Path: collector/historical/aggregator/historical-symbol-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + HISTORICAL)
 *  Description:
 *      Historical Symbol Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - ساخت خروجی واحد برای یک symbol در داده‌های تاریخی
 *      - ترکیب دادهٔ چند صرافی (خروجی HistoricalExchangeAggregator)
 *      - آماده‌سازی داده برای Stageهای تحلیل و مدل‌های Trend
 *
 *  Notes:
 *      - فقط مخصوص داده‌های REST تاریخی است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط آماده‌سازی می‌کند.
 * ============================================================
 */

const HistoricalExchangeAggregator = require("./historical-exchange-aggregator.cjs");

class HistoricalSymbolAggregator {

    build(symbol) {

        const exchanges = HistoricalExchangeAggregator.get(symbol);

        return {
            symbol,
            timestamp: Date.now(),
            exchanges,
            meta: {
                exchangeCount: Object.keys(exchanges).length
            }
        };
    }
}

module.exports = new HistoricalSymbolAggregator();
