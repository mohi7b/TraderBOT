/**
 * ============================================================
 *  File: symbols.cjs
 *  Path: orchestrator/config/symbols.cjs
 *  Version: 5.0.0
 *  Description:
 *      Symbol configuration for TraderBOT Enterprise.
 *      Defines active Spot and Futures trading pairs used
 *      across collectors, routers, aggregators, and clusters.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* ============================================================
     *  Spot Symbols (Realtime Binance Spot Test)
     * ============================================================ */
    spot: [
        "BTCUSDT",
        "ETHUSDT",
        "BNBUSDT"
    ],

    /* ============================================================
     *  Futures Symbols (Disabled for Test Mode)
     * ============================================================ */
    futures: []
};
