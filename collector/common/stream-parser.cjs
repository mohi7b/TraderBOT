/**
 * ============================================================
 *  File: stream-parser.cjs
 *  Path: collector/common/stream-parser.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Stream Parser for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - استخراج symbol از stream
 *      - استخراج نوع پیام (depth, trade, ticker, kline)
 *      - تشخیص exchange از ساختار stream
 *      - سازگار با تمام صرافی‌ها (Binance, OKX, Kucoin, Bybit, ...)
 *      - سازگار با Realtime / Historical / Macro / Sentiment
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل برای تمام Collectorها مشترک است.
 *      - فقط stream را تجزیه می‌کند، پردازش نمی‌کند.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

class StreamParser {

    /**
     * ============================================================
     *  PARSE STREAM → { symbol, type, exchange }
     * ============================================================
     */
    parse(stream) {
        if (!stream || typeof stream !== "string") {
            return { symbol: null, type: null, exchange: null };
        }

        const lower = stream.toLowerCase();

        return {
            symbol: this.extractSymbol(lower),
            type: this.extractType(lower),
            exchange: this.detectExchange(lower)
        };
    }

    /**
     * ============================================================
     *  EXTRACT SYMBOL
     * ============================================================
     */
    extractSymbol(stream) {
        try {
            const symbol = stream.split("@")[0];
            return symbol.toUpperCase();
        } catch {
            return null;
        }
    }

    /**
     * ============================================================
     *  EXTRACT TYPE
     * ============================================================
     */
    extractType(stream) {
        try {
            const type = stream.split("@")[1];
            return type || null;
        } catch {
            return null;
        }
    }

    /**
     * ============================================================
     *  DETECT EXCHANGE FROM STREAM FORMAT
     * ============================================================
     */
    detectExchange(stream) {

        // Binance format: btcusdt@depth
        if (stream.includes("@")) return "binance";

        // OKX format: books5, tickers, trades
        if (stream.includes("books") || stream.includes("tickers")) return "okx";

        // Kucoin format: market/ticker:BTC-USDT
        if (stream.includes("market/")) return "kucoin";

        // Bybit format: orderbook.1.BTCUSDT
        if (stream.includes("orderbook.")) return "bybit";

        // Bitget format: spot/ticker
        if (stream.includes("spot/")) return "bitget";

        // Gate.io format: spot.orderbook
        if (stream.includes("orderbook")) return "gate";

        // Kraken format: book-100
        if (stream.includes("book-")) return "kraken";

        return "unknown";
    }
}

module.exports = new StreamParser();
