/**
 * ============================================================
 *  File: symbol-aggregator.cjs
 *  Path: collector/realtime/aggregator/symbol-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + REALTIME)
 *  Description:
 *      Realtime Symbol Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - ساخت خروجی واحد برای یک symbol در ریل‌تایم
 *      - ترکیب دادهٔ چند صرافی (خروجی ExchangeAggregator)
 *      - آماده‌سازی داده برای Stageهای تحلیل و پیش‌بینی
 *
 *  Notes:
 *      - فقط مخصوص WS ریل‌تایم است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط آماده‌سازی می‌کند.
 * ============================================================
 */

const ExchangeAggregator = require("./realtime-exchange-aggregator.cjs");

class RealtimeSymbolAggregator {

    build(symbol) {

        const exchanges = ExchangeAggregator.get(symbol);

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

module.exports = new RealtimeSymbolAggregator();
