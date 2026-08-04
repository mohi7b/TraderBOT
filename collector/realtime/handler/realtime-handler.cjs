/**
 * ============================================================
 *  File: realtime-handler.cjs
 *  Path: collector/realtime/handler/realtime-handler.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Realtime Handler for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - دریافت پیام خام WS از WSFailover
 *      - تشخیص نوع پیام (depth, trade, price, kline)
 *      - استخراج symbol از stream
 *      - استانداردسازی پیام (Normalized Data Layer)
 *      - ارسال پیام به:
 *          • MarketCluster (price/trades/candles)
 *          • ProcessorCluster (orderbook processors)
 *          • SymbolAggregator (multi-exchange aggregation)
 *      - سازگار با EventBusIPC، MessageRouter، ClusterManager
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل فقط پیام‌های WS را مدیریت می‌کند.
 *      - CollectorCluster فقط جمع‌آوری‌کننده است.
 *      - پردازش در Stageهای بالاتر انجام می‌شود.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const EventBusIPC = require("../../../orchestrator/ipc/eventbus-ipc.cjs");
const MessageRouter = require("../../../orchestrator/cluster/message-router.cjs");
const Normalizer = require("../../data-normalizer.cjs"); // فایل جدید که می‌سازیم
const config = require("../../../orchestrator/config.cjs");

class RealtimeHandler {

    /**
     * ============================================================
     *  HANDLE RAW WS MESSAGE
     * ============================================================
     */
    handle(msg) {
        if (!msg || !msg.stream || !msg.data) return;

        const { stream, data } = msg;

        const symbol = this.extractSymbol(stream);
        const type = this.extractType(stream);

        if (!symbol || !type) return;

        // Normalize message → Stage 2
        const normalized = Normalizer.normalize(symbol, type, data);

        // Dispatch to pipeline
        this.dispatch(symbol, type, normalized);
    }

    /**
     * ============================================================
     *  EXTRACT SYMBOL FROM STREAM
     * ============================================================
     */
    extractSymbol(stream) {
        try {
            return stream.split("@")[0].toUpperCase();
        } catch {
            return null;
        }
    }

    /**
     * ============================================================
     *  EXTRACT TYPE FROM STREAM
     * ============================================================
     */
    extractType(stream) {
        try {
            return stream.split("@")[1];
        } catch {
            return null;
        }
    }

    /**
     * ============================================================
     *  DISPATCH TO PIPELINE STAGES
     * ============================================================
     */
    dispatch(symbol, type, normalized) {

        // -----------------------------
        // Stage 1 → MarketCluster
        // -----------------------------
        if (type === "trade" || type === "ticker" || type === "kline") {
            EventBusIPC.emit("market:realtime", { symbol, type, data: normalized });
        }

        // -----------------------------
        // Stage 1 → ProcessorCluster (Orderbook)
        // -----------------------------
        if (type === "depth" || type === "depthUpdate") {
            EventBusIPC.emit("orderbook:realtime", { symbol, type, data: normalized });
        }

        // -----------------------------
        // Stage 7–13 → SymbolAggregator
        // -----------------------------
        EventBusIPC.emit("aggregator:realtime", { symbol, type, data: normalized });

        // -----------------------------
        // Debug Mode
        // -----------------------------
        if (config.system.mode !== "run") {
            console.log(`🔍 [DEBUG] ${symbol} → ${type}`);
        }
    }
}

module.exports = new RealtimeHandler();
