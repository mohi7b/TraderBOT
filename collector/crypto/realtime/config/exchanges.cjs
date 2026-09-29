/* ============================================================
 * File: collector/crypto/realtime/config/exchanges.cjs
 * Section: collector/crypto/realtime/config
 * Version: 2.0.0
 *
 * Role:
 *   Single source of truth for "which exchanges / markets are enabled".
 *   The Realtime section owns this matrix now; the orchestrator
 *   (orchestrator/aanode/config/exchanges.cjs) re-exports this file so
 *   that there is exactly one place to edit.
 *
 * Backward compatibility:
 *   The exported surface (EXCHANGE_ORDER, symbols, ws, getEnabledMarkets,
 *   getEnabledExchanges, buildExchangePlan) is identical to the previous
 *   orchestrator implementation, so existing callers keep working:
 *     - collector/aanode/config/collector.cjs
 *     - test/exchange-plan.test.cjs
 *     - test/configured-market-e2e.test.cjs
 * ============================================================ */

const EXCHANGE_ORDER = ["binance", "bybit", "bitget", "kucoin", "okx"];

const EXCHANGES = {
    symbols: ["BTCUSDT", "ETHUSDT"],
    ws: {
        binance: { futures: true, spot: true },
        bybit: { futures: true, spot: true },
        bitget: { futures: true, spot: true },
        kucoin: { futures: true, spot: true },
        okx: { futures: true, spot: true }
    }
};

/* ------------------------------------------------------------
 * Optional per-symbol overrides.
 * Example:
 *   SYMBOL_OVERRIDES.BTCUSDT = { ws: { kucoin: { spot: false } } }
 * When an override omits a field, the global value is used.
 * ---------------------------------------------------------- */
const SYMBOL_OVERRIDES = {};

/* ------------------------------------------------------------
 * Symbol helpers
 * ---------------------------------------------------------- */
function normalizeSymbol(symbol) {
    if (symbol === null || symbol === undefined) return null;
    const cleaned = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return cleaned.length ? cleaned : null;
}

function getSymbolConfig(symbol) {
    const normalized = normalizeSymbol(symbol);
    return (normalized && SYMBOL_OVERRIDES[normalized]) || {};
}

/* ------------------------------------------------------------
 * Enabled markets
 * ---------------------------------------------------------- */
function getEnabledMarkets(exchangeName, symbol) {
    const override = getSymbolConfig(symbol).ws?.[exchangeName];
    const exchange = { ...(EXCHANGES.ws[exchangeName] || {}), ...(override || {}) };
    return {
        futures: !!exchange.futures,
        spot: !!exchange.spot
    };
}

function getEnabledExchanges(symbol) {
    const override = getSymbolConfig(symbol).ws;
    return EXCHANGE_ORDER.filter((name) => {
        const merged = { ...(EXCHANGES.ws[name] || {}), ...((override && override[name]) || {}) };
        return !!(merged.futures || merged.spot);
    });
}

/* ------------------------------------------------------------
 * Legacy orchestrator-shaped plan (kept for backward compatibility)
 * ---------------------------------------------------------- */
function buildExchangePlan(symbols = EXCHANGES.symbols) {
    const tasks = [];
    for (const exchange of getEnabledExchanges()) {
        for (const symbol of symbols) {
            tasks.push({
                exchange,
                symbol,
                markets: getEnabledMarkets(exchange, symbol),
                stage: "collector"
            });
        }
    }
    return tasks;
}

/* ------------------------------------------------------------
 * Realtime-shaped plan: one entry per (symbol, market, exchange)
 * ---------------------------------------------------------- */
function resolveMarketPlan(symbol, options = {}) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];

    const marketFilter = Array.isArray(options.markets) && options.markets.length
        ? new Set(options.markets)
        : null;
    const exchangeFilter = Array.isArray(options.exchanges) && options.exchanges.length
        ? new Set(options.exchanges)
        : null;

    const plan = [];
    for (const exchange of getEnabledExchanges(normalized)) {
        if (exchangeFilter && !exchangeFilter.has(exchange)) continue;
        const markets = getEnabledMarkets(exchange, normalized);
        for (const market of ["spot", "futures"]) {
            if (marketFilter && !marketFilter.has(market)) continue;
            if (!markets[market]) continue;
            plan.push({ symbol: normalized, exchange, market });
        }
    }
    return plan;
}

module.exports = {
    ...EXCHANGES,
    EXCHANGE_ORDER,
    SYMBOL_OVERRIDES,
    normalizeSymbol,
    getSymbolConfig,
    getEnabledMarkets,
    getEnabledExchanges,
    buildExchangePlan,
    resolveMarketPlan
};
