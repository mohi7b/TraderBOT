/**
 * ============================================================
 *  File: binance_futures.cjs
 *  Path: collector/realtime/futures/exchanges/binance_futures.cjs
 *  Version: 5.0.0
 *
 *  Description:
 *      Metadata definition for Binance USDT-M Futures exchange.
 *      Used by CollectorLoader + ModuleManager to identify
 *      exchange type and root configuration.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

module.exports = {
    name: "binance_futures",
    type: "exchange",
    root: "exchange_root",
    description: "Binance USDT-M Futures Exchange",
    version: "5.0.0"
};
