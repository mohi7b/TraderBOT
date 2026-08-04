/**
 * ============================================================
 *  File: historical-router.cjs
 *  Path: collector/router/historical-router.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Historical Router for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - دریافت پیام از HistoricalCollector (REST)
 *      - تشخیص مسیر مناسب برای پیام تاریخی
 *      - ارسال پیام به CollectorRouter (مرکزی)
 *      - سازگار با EventBusIPC، MessageRouter، ExchangeMap، SymbolMap
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل فقط مخصوص Historical REST است.
 *      - هیچ پردازشی انجام نمی‌دهد، فقط مسیریابی می‌کند.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const CollectorRouter = require("./collector-router.cjs");
const SymbolMap = require("../common/symbol-map.cjs");
const ExchangeMap = require("../common/exchange-map.cjs");

class HistoricalRouter {

    /**
     * ============================================================
     *  ROUTE HISTORICAL MESSAGE
     * ============================================================
     */
    route({ exchange, symbol, type, data }) {

        if (!exchange || !symbol || !type || !data) return;

        // Validate symbol
        if (!SymbolMap.isValid(symbol)) return;

        // Validate exchange
        const exInfo = ExchangeMap.get(exchange);
        if (!exInfo) return;

        // Build final payload for CollectorRouter
        const payload = {
            exchange,
            symbol,
            type,
            data
        };

        // Send to central router
        CollectorRouter.route(payload);
    }
}

module.exports = new HistoricalRouter();
