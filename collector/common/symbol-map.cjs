/**
 * ============================================================
 *  File: symbol-map.cjs
 *  Path: collector/common/symbol-map.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Symbol Map for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - نگاشت symbolهای فعال از config
 *      - تشخیص Spot / Futures
 *      - تبدیل symbol به فرمت استاندارد
 *      - پشتیبانی از multi-symbol و multi-exchange
 *      - سازگار با CollectorCluster، RealtimeHandler، Routerها، Aggregatorها
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل برای تمام Collectorها مشترک است.
 *      - فقط اطلاعات پایهٔ symbolها را نگه می‌دارد.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

const config = require("../../orchestrator/config.cjs");

class SymbolMap {

    /**
     * ============================================================
     *  GET ALL SYMBOLS (SPOT + FUTURES)
     * ============================================================
     */
    getAll() {
        return {
            spot: this.getSpot(),
            futures: this.getFutures()
        };
    }

    /**
     * ============================================================
     *  GET SPOT SYMBOLS
     * ============================================================
     */
    getSpot() {
        return config.symbols.spot || [];
    }

    /**
     * ============================================================
     *  GET FUTURES SYMBOLS
     * ============================================================
     */
    getFutures() {
        return config.symbols.futures || [];
    }

    /**
     * ============================================================
     *  GET SYMBOLS FOR EXCHANGE (SPOT / FUTURES)
     * ============================================================
     */
    getForExchange(exchangeName) {
        const ex = config.exchanges[exchangeName];

        if (!ex || !ex.enabled) return [];

        return ex.type === "spot"
            ? this.getSpot()
            : this.getFutures();
    }

    /**
     * ============================================================
     *  NORMALIZE SYMBOL FORMAT
     * ============================================================
     */
    normalize(symbol) {
        if (!symbol) return null;

        return symbol
            .replace("-", "")     // BTC-USDT → BTCUSDT
            .replace("_", "")     // BTC_USDT → BTCUSDT
            .replace("/", "")     // BTC/USDT → BTCUSDT
            .toUpperCase();
    }

    /**
     * ============================================================
     *  CHECK IF SYMBOL IS VALID
     * ============================================================
     */
    isValid(symbol) {
        const normalized = this.normalize(symbol);

        return (
            this.getSpot().includes(normalized) ||
            this.getFutures().includes(normalized)
        );
    }

    /**
     * ============================================================
     *  DETECT SYMBOL TYPE (SPOT / FUTURES)
     * ============================================================
     */
    detectType(symbol) {
        const normalized = this.normalize(symbol);

        if (this.getSpot().includes(normalized)) return "spot";
        if (this.getFutures().includes(normalized)) return "futures";

        return "unknown";
    }
}

module.exports = new SymbolMap();
