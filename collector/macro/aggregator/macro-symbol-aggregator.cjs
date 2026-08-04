/**
 * ============================================================
 *  File: macro-symbol-aggregator.cjs
 *  Path: collector/macro/aggregator/macro-symbol-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + MACRO)
 *  Description:
 *      Macro Symbol Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - ساخت خروجی واحد برای یک شاخص یا symbol در داده‌های ماکرو
 *      - ترکیب دادهٔ چند منبع (خروجی MacroExchangeAggregator)
 *      - آماده‌سازی داده برای Stageهای تحلیل ماکرو
 *
 *  Notes:
 *      - فقط مخصوص داده‌های Macro است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط آماده‌سازی می‌کند.
 * ============================================================
 */

const MacroExchangeAggregator = require("./macro-exchange-aggregator.cjs");

class MacroSymbolAggregator {

    build(symbol) {

        const sources = MacroExchangeAggregator.get(symbol);

        return {
            symbol,
            timestamp: Date.now(),
            sources,
            meta: {
                sourceCount: Object.keys(sources).length
            }
        };
    }
}

module.exports = new MacroSymbolAggregator();
