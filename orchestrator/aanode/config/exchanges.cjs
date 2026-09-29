/* ============================================================
 * File: exchanges.cjs
 * Section: orchestrator/aanode/config
 * Role:
 *   Delegating shim (see Version 2.0.0 below).
 *
 *   The exchange activation matrix is now owned by the Realtime section:
 *
 *     collector/crypto/realtime/config/exchanges.cjs
 *
 *   That file is a strict superset of the previous implementation here
 *   (EXCHANGE_ORDER, symbols, ws, getEnabledMarkets, getEnabledExchanges,
 *   buildExchangePlan), so every existing caller keeps working unchanged:
 *
 *     - collector/aanode/config/collector.cjs
 *     - test/exchange-plan.test.cjs
 *     - test/configured-market-e2e.test.cjs
 *
 *   Edit the matrix in collector/crypto/realtime/config/exchanges.cjs only, so
 *   there is exactly one place to enable/disable an exchange or market.
 * ============================================================ */

module.exports = require("../../../collector/crypto/realtime/config/exchanges.cjs");
