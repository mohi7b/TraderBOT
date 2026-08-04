/**
 * ============================================================
 *  File: exchanges.cjs
 *  Path: orchestrator/config/exchanges.cjs
 *  Version: 5.0.0
 *  Description:
 *      Exchange configuration for TraderBOT Enterprise.
 *      Defines enabled Spot/Futures exchanges and their types.
 *      Used by collectors, routers, clusters, and orchestrator.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* ============================================================
     *  Spot Exchanges (Realtime Test Mode)
     * ============================================================ */
    binance_spot:   { enabled: true,  type: "spot" },
    okx_spot:       { enabled: true, type: "spot" },
    kucoin_spot:    { enabled: true, type: "spot" },
    bybit_spot:     { enabled: true, type: "spot" },
    bitget_spot:    { enabled: true, type: "spot" },
    gate_spot:      { enabled: false, type: "spot" },
    kraken_spot:    { enabled: false, type: "spot" },
    coinbase_spot:  { enabled: false, type: "spot" },
    mexc_spot:      { enabled: false, type: "spot" },
    huobi_spot:     { enabled: false, type: "spot" },

    /* ============================================================
     *  Futures Exchanges (Disabled for Test Mode)
     * ============================================================ */
    binance_futures: { enabled: true, type: "futures" },
    okx_futures:     { enabled: true, type: "futures" },
    bybit_futures:   { enabled: true, type: "futures" },
    bitget_futures:  { enabled: true, type: "futures" },
    kucoin_futures:  { enabled: true, type: "futures" },
    gate_futures:    { enabled: false, type: "futures" },
    mexc_futures:    { enabled: false, type: "futures" },
    phemex_futures:  { enabled: false, type: "futures" },
    kraken_futures:  { enabled: false, type: "futures" },
    bitfinex_futures:{ enabled: false, type: "futures" }
};
