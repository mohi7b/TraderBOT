/**
 * ============================================================
 *  File: realtime-futures-exchange-aggregator.cjs
 *  Path: collector/realtime/futures/aggregator/realtime-futures-exchange-aggregator.cjs
 *  Version: 5.7.0 (ENTERPRISE)
 *
 *  Description:
 *      Exchange-level aggregator for Binance Futures.
 *
 *      این فایل تمام symbol های یک صرافی را تجمیع می‌کند:
 *      - BTCUSDT
 *      - ETHUSDT
 *      - BNBUSDT
 *      - …
 *
 *      خروجی این فایل:
 *      - برای تحلیل چند symbol
 *      - برای مدل‌های ML چند دارایی
 *      - برای داشبوردهای چند symbol
 *      - برای سیستم‌های هشدار
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class RealtimeFuturesExchangeAggregator {

    constructor(exchange) {
        this.exchange = exchange;
        this.symbols = {};
    }

    update(symbol, aggregatedEvent) {
        this.symbols[symbol] = aggregatedEvent;

        return {
            exchange: this.exchange,
            type: "futures_exchange_aggregate",
            ts: Date.now(),
            symbols: this.symbols
        };
    }
}

module.exports = RealtimeFuturesExchangeAggregator;
