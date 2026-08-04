/**
 * ============================================================
 *  File: candles.cjs
 *  Path: collector/realtime/futures/market/candles.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures kline (candlestick) data.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesCandles {
    handle(exchange, symbol, data) {
        const k = data.k;

        return {
            exchange,
            symbol,
            type: "kline",
            interval: k.i,
            open: k.o,
            high: k.h,
            low: k.l,
            close: k.c,
            volume: k.v,
            ts: k.T,
            raw: data
        };
    }
}

module.exports = FuturesCandles;
