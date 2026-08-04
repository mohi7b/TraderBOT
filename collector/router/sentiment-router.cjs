/**
 * ============================================================
 *  File: sentiment-router.cjs
 *  Path: collector/router/sentiment-router.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Sentiment Router for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - دریافت پیام از SentimentCollector (News, Social, Trends)
 *      - تشخیص مسیر مناسب برای پیام احساسات بازار
 *      - ارسال پیام به CollectorRouter (مرکزی)
 *      - سازگار با EventBusIPC، MessageRouter، ExchangeMap، SymbolMap
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل فقط مخصوص داده‌های احساسات بازار است.
 *      - هیچ پردازشی انجام نمی‌دهد، فقط مسیریابی می‌کند.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const CollectorRouter = require("./collector-router.cjs");
const ExchangeMap = require("../common/exchange-map.cjs");
const SymbolMap = require("../common/symbol-map.cjs");

class SentimentRouter {

    /**
     * ============================================================
     *  ROUTE SENTIMENT MESSAGE
     * ============================================================
     */
    route({ exchange, symbol, type, data }) {

        if (!exchange || !type || !data) return;

        // Sentiment data may not have symbol (e.g., global news)
        const finalSymbol = symbol ? SymbolMap.normalize(symbol) : "SENTIMENT";

        // Validate exchange
        const exInfo = ExchangeMap.get(exchange);
        if (!exInfo) return;

        // Build final payload for CollectorRouter
        const payload = {
            exchange,
            symbol: finalSymbol,
            type,
            data
        };

        // Send to central router
        CollectorRouter.route(payload);
    }
}

module.exports = new SentimentRouter();
