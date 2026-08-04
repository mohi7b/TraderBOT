/**
 * ============================================================
 *  File: modules.cjs
 *  Path: orchestrator/config/modules.cjs
 *  Version: 5.0.0
 *  Description:
 *      Module activation map for TraderBOT Enterprise.
 *      Controls ON/OFF state of collectors, routers, aggregators,
 *      engines, and processing layers. Used for test modes and
 *      selective pipeline activation.
 *
 *      In TEST MODE only realtime Binance Spot is enabled.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* ============================================================
     *  Realtime Modules (Only Binance Spot Enabled)
     * ============================================================ */
    realtime: {
        binance: {
            spot: true,
            futures: false
        },
        okx: false,
        bybit: false,
        bitget: false,
        kucoin: false,
        gate: false,
        mexc: false,
        coinbase: false,
        kraken: false,
        huobi: false
    },

    /* ============================================================
     *  Historical / Macro / Sentiment (Disabled for Test Mode)
     * ============================================================ */
    historical: false,
    macro: false,
    sentiment: false,

    /* ============================================================
     *  Processing Engines (Disabled for Test Mode)
     * ============================================================ */
    engines: {
        math: false,
        complex: false,
        indicators: false,
        prediction: false,
        strategies: false,
        composite: false,
        decision: false,
        killswitch: false,
        execution: false,
        feedback: false,
        learning: false
    },

    /* ============================================================
     *  Cluster Modules (Disabled for Test Mode)
     * ============================================================ */
    clusters: {
        market: false,
        processor: false,
        collector: false,
        aggregator: false,
        analysis: false,
        prediction: false,
        logic: false
    }
};
