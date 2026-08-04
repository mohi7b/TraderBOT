/**
 * ============================================================
 *  File: macro-exchange-aggregator.cjs
 *  Path: collector/macro/aggregator/macro-exchange-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + MACRO)
 *  Description:
 *      Macro Exchange Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - تجمیع دادهٔ ماکرو از چند منبع برای یک شاخص یا symbol
 *      - ذخیرهٔ آخرین دادهٔ Macro هر منبع
 *      - آماده‌سازی داده برای MacroSymbolAggregator
 *
 *  Notes:
 *      - فقط مخصوص داده‌های Macro است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط تجمیع می‌کند.
 * ============================================================
 */

class MacroExchangeAggregator {

    constructor() {
        this.store = {}; 
        // ساختار:
        // {
        //   MACRO: {
        //       cpi_source1: { type, data, timestamp },
        //       cpi_source2: { type, data, timestamp }
        //   }
        // }
    }

    add(source, symbol, type, data) {

        if (!this.store[symbol]) {
            this.store[symbol] = {};
        }

        this.store[symbol][source] = {
            type,
            data,
            timestamp: Date.now()
        };
    }

    get(symbol) {
        return this.store[symbol] || {};
    }
}

module.exports = new MacroExchangeAggregator();
