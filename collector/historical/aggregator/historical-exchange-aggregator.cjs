/**
 * ============================================================
 *  File: historical-exchange-aggregator.cjs
 *  Path: collector/historical/aggregator/historical-exchange-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + HISTORICAL)
 *  Description:
 *      Historical Exchange Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - تجمیع دادهٔ تاریخی یک symbol از چند صرافی
 *      - ذخیرهٔ آخرین دادهٔ REST هر صرافی
 *      - آماده‌سازی داده برای HistoricalSymbolAggregator
 *
 *  Notes:
 *      - فقط مخصوص داده‌های REST تاریخی است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط تجمیع می‌کند.
 * ============================================================
 */

class HistoricalExchangeAggregator {

    constructor() {
        this.store = {}; 
        // ساختار:
        // {
        //   BTCUSDT: {
        //       binance_spot: { type, data, timestamp },
        //       okx_spot: { type, data, timestamp }
        //   }
        // }
    }

    add(exchange, symbol, type, data) {

        if (!this.store[symbol]) {
            this.store[symbol] = {};
        }

        this.store[symbol][exchange] = {
            type,
            data,
            timestamp: Date.now()
        };
    }

    get(symbol) {
        return this.store[symbol] || {};
    }
}

module.exports = new HistoricalExchangeAggregator();
