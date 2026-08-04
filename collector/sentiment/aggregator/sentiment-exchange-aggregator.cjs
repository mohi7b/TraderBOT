/**
 * ============================================================
 *  File: sentiment-exchange-aggregator.cjs
 *  Path: collector/sentiment/aggregator/sentiment-exchange-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + SENTIMENT)
 *  Description:
 *      Sentiment Exchange Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - تجمیع دادهٔ احساسات بازار از چند منبع برای یک symbol یا کل بازار
 *      - ذخیرهٔ آخرین دادهٔ Sentiment هر منبع
 *      - آماده‌سازی داده برای SentimentSymbolAggregator
 *
 *  Notes:
 *      - فقط مخصوص داده‌های Sentiment است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط تجمیع می‌کند.
 * ============================================================
 */

class SentimentExchangeAggregator {

    constructor() {
        this.store = {}; 
        // ساختار:
        // {
        //   BTCUSDT: {
        //       news_api: { type, data, timestamp },
        //       twitter_api: { type, data, timestamp },
        //       trends_api: { type, data, timestamp }
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

module.exports = new SentimentExchangeAggregator();
