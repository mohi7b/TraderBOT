/**
 * ============================================================
 *  File: exchange-aggregator.cjs
 *  Path: collector/realtime/aggregator/exchange-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + REALTIME)
 *  Description:
 *      Realtime Exchange Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - تجمیع دادهٔ یک symbol از چند صرافی در ریل‌تایم
 *      - ذخیرهٔ آخرین پیام هر صرافی
 *      - آماده‌سازی داده برای SymbolAggregator
 *
 *  Notes:
 *      - فقط مخصوص WS ریل‌تایم است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط تجمیع می‌کند.
 * ============================================================
 */

class RealtimeExchangeAggregator {

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

module.exports = new RealtimeExchangeAggregator();
