/* ============================================================
 * File: collector/crypto/common/notional-thresholds.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Single source of truth for the order-flow size classification.
 *
 *   Why notional: big_trades.cjs used `qty > 5000` and micro_trades.cjs used
 *   `qty < 50`. Quantity is denominated in the BASE asset, so the same number
 *   means 5000 BTC (≈ 300M USDT) or 5000 SHIB (≈ 0.1 USDT) — the classification
 *   was asset dependent and could never be right for more than one symbol.
 *   Everything is notional now (price × qty, quote currency) and per-symbol
 *   overrides are supported.
 *
 * Overrides (optional):
 *   global.CONFIG.orderflow = {
 *       bigNotional: 50000,
 *       microNotional: 100,
 *       symbols: { BTCUSDT: { bigNotional: 250000 } }
 *   }
 *
 * Relations:
 *   - Used by: realtime/spot/orderflow/big_trades.cjs, micro_trades.cjs
 * ============================================================ */

const DEFAULT_THRESHOLDS = Object.freeze({
    bigNotional: 50000,   // quote currency (USDT)
    microNotional: 100
});

function finiteOr(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function overrides() {
    const config = typeof global !== "undefined" && global.CONFIG ? global.CONFIG.orderflow : null;
    return config && typeof config === "object" ? config : {};
}

function thresholdsFor(symbol) {
    const base = { ...DEFAULT_THRESHOLDS, ...overrides() };
    const perSymbol = (base.symbols && base.symbols[String(symbol || "").toUpperCase()]) || {};

    const bigNotional = finiteOr(perSymbol.bigNotional) || finiteOr(base.bigNotional) || DEFAULT_THRESHOLDS.bigNotional;
    const microNotional = finiteOr(perSymbol.microNotional) || finiteOr(base.microNotional) || DEFAULT_THRESHOLDS.microNotional;

    /* a micro trade can never be classified above a whale trade */
    return { bigNotional, microNotional: Math.min(microNotional, bigNotional) };
}

/** Notional of a trade packet: price × qty (`qty` or `tradeQty`). */
function notionalOf(data = {}) {
    const price = finiteOr(data.price);
    const rawQty = data.qty !== undefined && data.qty !== null ? data.qty : data.tradeQty;
    const qty = finiteOr(rawQty);
    if (price === null || qty === null) return null;
    return price * qty;
}

/** @returns {{notional: number|null, kind: "big"|"micro"|"normal"|"unknown", thresholds: object}} */
function classifyNotional(data, symbol) {
    const thresholds = thresholdsFor(symbol);
    const notional = notionalOf(data);

    if (notional === null) return { notional: null, kind: "unknown", thresholds };
    if (notional >= thresholds.bigNotional) return { notional, kind: "big", thresholds };
    if (notional <= thresholds.microNotional) return { notional, kind: "micro", thresholds };
    return { notional, kind: "normal", thresholds };
}

module.exports = { DEFAULT_THRESHOLDS, notionalOf, thresholdsFor, classifyNotional };
