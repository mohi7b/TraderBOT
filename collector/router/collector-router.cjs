/**
 * ============================================================
 *  File: collector-router.cjs
 *  Path: collector/router/collector-router.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Collector Router for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - دریافت پیام از تمام Collectorها (Realtime / Historical / Macro / Sentiment)
 *      - تشخیص مسیر مناسب برای پیام
 *      - ارسال پیام به EventBusIPC و MessageRouter
 *      - ارسال پیام به MarketCluster / ProcessorCluster / AggregatorCluster
 *      - سازگار با Normalizer، StreamParser، ExchangeMap، SymbolMap
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل برای تمام Collectorها مشترک است.
 *      - هیچ پردازشی انجام نمی‌دهد، فقط مسیریابی می‌کند.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const EventBusIPC = require("../../orchestrator/ipc/eventbus-ipc.cjs");
const MessageRouter = require("../../orchestrator/cluster/message-router.cjs");

// Realtime Aggregators
const RealtimeExchangeAggregator = require("../realtime/aggregator/realtime-exchange-aggregator.cjs");
const RealtimeSymbolAggregator = require("../realtime/aggregator/realtime-symbol-aggregator.cjs");

// Historical Aggregators
const HistoricalExchangeAggregator = require("../historical/aggregator/historical-exchange-aggregator.cjs");
const HistoricalSymbolAggregator = require("../historical/aggregator/historical-symbol-aggregator.cjs");

// Macro Aggregators
const MacroExchangeAggregator = require("../macro/aggregator/macro-exchange-aggregator.cjs");
const MacroSymbolAggregator = require("../macro/aggregator/macro-symbol-aggregator.cjs");

// Sentiment Aggregators
const SentimentExchangeAggregator = require("../sentiment/aggregator/sentiment-exchange-aggregator.cjs");
const SentimentSymbolAggregator = require("../sentiment/aggregator/sentiment-symbol-aggregator.cjs");

class CollectorRouter {

    route({ exchange, symbol, type, data, category }) {

        if (!exchange || !type || !data) return;

        // -----------------------------
        // CATEGORY: REALTIME
        // -----------------------------
        if (category === "realtime") {

            RealtimeExchangeAggregator.add(exchange, symbol, type, data);

            const aggregated = RealtimeSymbolAggregator.build(symbol);

            EventBusIPC.emit("market:aggregated", aggregated);
        }

        // -----------------------------
        // CATEGORY: HISTORICAL
        // -----------------------------
        if (category === "historical") {

            HistoricalExchangeAggregator.add(exchange, symbol, type, data);

            const aggregated = HistoricalSymbolAggregator.build(symbol);

            EventBusIPC.emit("historical:aggregated", aggregated);
        }

        // -----------------------------
        // CATEGORY: MACRO
        // -----------------------------
        if (category === "macro") {

            MacroExchangeAggregator.add(exchange, symbol, type, data);

            const aggregated = MacroSymbolAggregator.build(symbol);

            EventBusIPC.emit("macro:aggregated", aggregated);
        }

        // -----------------------------
        // ⭐ CATEGORY: SENTIMENT
        // -----------------------------
        if (category === "sentiment") {

            SentimentExchangeAggregator.add(exchange, symbol, type, data);

            const aggregated = SentimentSymbolAggregator.build(symbol);

            EventBusIPC.emit("sentiment:aggregated", aggregated);
        }

        // -----------------------------
        // Internal Routing
        // -----------------------------
        MessageRouter.dispatch({
            exchange,
            symbol,
            type,
            data,
            category
        });
    }
}

module.exports = new CollectorRouter();
