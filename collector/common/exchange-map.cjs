/**
 * ============================================================
 *  File: exchange-map.cjs
 *  Path: collector/common/exchange-map.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Exchange Map for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - نگاشت نام صرافی‌ها به ساختار استاندارد
 *      - تشخیص نوع صرافی (spot / futures)
 *      - مسیر فایل‌های Collector (Realtime / Historical / Macro / Sentiment)
 *      - تنظیمات WS و REST برای هر صرافی
 *      - سازگار با CollectorCluster، RealtimeHandler، Routerها، Aggregatorها
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل برای تمام Collectorها مشترک است.
 *      - فقط اطلاعات پایهٔ صرافی‌ها را نگه می‌دارد.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const config = require("../../orchestrator/config.cjs");

class ExchangeMap {

    /**
     * ============================================================
     *  GET EXCHANGE INFO
     * ============================================================
     */
    get(exchangeName) {
        const ex = config.exchanges[exchangeName];

        if (!ex || !ex.enabled) {
            return null;
        }

        return {
            name: exchangeName,
            type: ex.type,              // spot / futures
            ws: this.getWS(exchangeName),
            rest: this.getREST(exchangeName),
            realtimePath: this.getRealtimePath(exchangeName),
            historicalPath: this.getHistoricalPath(exchangeName),
            macroPath: this.getMacroPath(exchangeName),
            sentimentPath: this.getSentimentPath(exchangeName)
        };
    }

    /**
     * ============================================================
     *  WS BASE URL
     * ============================================================
     */
    getWS(exchange) {

        const wsMap = {
            binance_spot:      "wss://stream.binance.com:9443",
            binance_futures:   "wss://fstream.binance.com",
            okx_spot:          "wss://ws.okx.com:8443/ws/v5/public",
            okx_futures:       "wss://ws.okx.com:8443/ws/v5/public",
            kucoin_spot:       "wss://ws-api.kucoin.com/spot",
            bybit_spot:        "wss://stream.bybit.com/v5/public/spot",
            bybit_futures:     "wss://stream.bybit.com/v5/public/linear",
            bitget_spot:       "wss://ws.bitget.com/spot/v1/stream",
            gate_spot:         "wss://api.gateio.ws/ws/v4",
            kraken_spot:       "wss://ws.kraken.com",
            mexc_spot:         "wss://wbs.mexc.com/ws",
            huobi_spot:        "wss://api.huobi.pro/ws"
        };

        return wsMap[exchange] || null;
    }

    /**
     * ============================================================
     *  REST BASE URL
     * ============================================================
     */
    getREST(exchange) {

        const restMap = {
            binance_spot:      "https://api.binance.com",
            binance_futures:   "https://fapi.binance.com",
            okx_spot:          "https://www.okx.com",
            okx_futures:       "https://www.okx.com",
            kucoin_spot:       "https://api.kucoin.com",
            bybit_spot:        "https://api.bybit.com",
            bybit_futures:     "https://api.bybit.com",
            bitget_spot:       "https://api.bitget.com",
            gate_spot:         "https://api.gateio.ws/api/v4",
            kraken_spot:       "https://api.kraken.com",
            mexc_spot:         "https://api.mexc.com",
            huobi_spot:        "https://api.huobi.pro"
        };

        return restMap[exchange] || null;
    }

    /**
     * ============================================================
     *  PATHS FOR COLLECTORS
     * ============================================================
     */

    getRealtimePath(exchange) {
        return `collector/realtime/${this.getTypeFolder(exchange)}/exchanges/${exchange}.cjs`;
    }

    getHistoricalPath(exchange) {
        return `collector/historical/${this.getTypeFolder(exchange)}/exchanges/${exchange}-history.cjs`;
    }

    getMacroPath(exchange) {
        return `collector/macro/${exchange}.cjs`;
    }

    getSentimentPath(exchange) {
        return `collector/sentiment/${exchange}.cjs`;
    }

    /**
     * ============================================================
     *  SPOT / FUTURES FOLDER
     * ============================================================
     */
    getTypeFolder(exchange) {
        const ex = config.exchanges[exchange];
        return ex.type === "spot" ? "spot" : "futures";
    }
}

module.exports = new ExchangeMap();
