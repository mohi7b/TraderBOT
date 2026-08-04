/**
 * ============================================================
 *  File: realtime-router.cjs
 *  Path: collector/router/realtime-router.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Realtime Router for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - دریافت پیام از RealtimeHandler
 *      - تشخیص مسیر مناسب برای پیام ریل‌تایم
 *      - ارسال پیام به CollectorRouter (مرکزی)
 *      - سازگار با EventBusIPC، MessageRouter، ExchangeMap، SymbolMap
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل فقط مخصوص ریل‌تایم است.
 *      - هیچ پردازشی انجام نمی‌دهد، فقط مسیریابی می‌کند.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const CollectorRouter = require("./collector-router.cjs");
const StreamParser = require("../common/stream-parser.cjs");
const SymbolMap = require("../common/symbol-map.cjs");
const ExchangeMap = require("../common/exchange-map.cjs");

class RealtimeRouter {

    /**
     * ============================================================
     *  ROUTE REALTIME MESSAGE
     * ============================================================
     */
    route(msg) {
        if (!msg || !msg.stream || !msg.data) return;

        // Parse stream → symbol + type + exchange
        const parsed = StreamParser.parse(msg.stream);

        const { symbol, type, exchange } = parsed;

        if (!symbol || !type || !exchange) return;

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
            data: msg.data
        };

        // Send to central router
        CollectorRouter.route(payload);
    }
}

module.exports = new RealtimeRouter();
