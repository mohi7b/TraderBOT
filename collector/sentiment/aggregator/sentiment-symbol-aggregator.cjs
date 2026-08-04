/**
 * ============================================================
 *  File: sentiment-symbol-aggregator.cjs
 *  Path: collector/sentiment/aggregator/sentiment-symbol-aggregator.cjs
 *  Version: 5.0.0 (ENTERPRISE + SENTIMENT)
 *  Description:
 *      Sentiment Symbol Aggregator for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - ساخت خروجی واحد برای یک symbol در داده‌های احساسات بازار
 *      - ترکیب دادهٔ چند منبع (خروجی SentimentExchangeAggregator)
 *      - آماده‌سازی داده برای Stageهای تحلیل احساسات و NLP
 *
 *  Notes:
 *      - فقط مخصوص داده‌های Sentiment است.
 *      - هیچ تحلیل انجام نمی‌دهد، فقط آماده‌سازی می‌کند.
 * ============================================================
 */

const SentimentExchangeAggregator = require("./sentiment-exchange-aggregator.cjs");

class SentimentSymbolAggregator {

    build(symbol) {

        const sources = SentimentExchangeAggregator.get(symbol);

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

module.exports = new SentimentSymbolAggregator();
