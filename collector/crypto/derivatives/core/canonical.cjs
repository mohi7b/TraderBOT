/* ============================================================
 * File: collector/crypto/derivatives/core/canonical.cjs
 * Section: collector/crypto/derivatives/core
 * Version: 1.0.0
 *
 * Role:
 *   Canonical samples of the derivatives layer. Every venue adapter
 *   (binance/bybit/okx/kucoin/bitget) returns these EXACT shapes, so
 *   everything above the adapters — collector state, analytics-engine,
 *   tests — is venue-agnostic.
 *
 * Numeric contract (phase-2 DoD: "high numeric accuracy"):
 *   - a field is either a finite number or null, never NaN/undefined
 *   - openInterest carries the three representations the project
 *     already distinguishes in open-interest-normalizer.cjs:
 *       oiContracts (contracts/coins as reported by the venue)
 *       oiBase      (base asset, e.g. BTC)
 *       oiUsd       (notional)
 *   - funding.rate is a decimal per funding interval (0.0001 = 0.01%)
 * ============================================================ */

function finite(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
    const parsed = finite(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

function timestamp(value) {
    const parsed = finite(value);
    if (parsed === null) return null;
    /* Some venues answer in seconds (OKX rubik); normalise to ms. */
    return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed);
}

function pick(...values) {
    for (const value of values) {
        const parsed = finite(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

/* ------------------------------------------------------------
 * open_interest
 * ---------------------------------------------------------- */
function openInterestSample(input = {}, ctx = {}) {
    const oiContracts = pick(input.oiContracts, input.contracts, input.openInterest);
    const oiBase = pick(input.oiBase, input.coins, input.holdingAmount);
    const markPrice = positive(pick(input.markPrice, ctx.markPrice));
    const indexPrice = positive(pick(input.indexPrice, ctx.indexPrice));

    const derivedUsd = (base, price) => (base !== null && price !== null ? base * price : null);
    const oiUsd = pick(
        input.oiUsd,
        input.openInterestValue,
        derivedUsd(oiBase, markPrice),
        derivedUsd(oiBase, indexPrice)
    );

    return {
        exchange: ctx.exchange || input.exchange || null,
        symbol: ctx.symbol || input.symbol || null,
        venueSymbol: ctx.venueSymbol || input.venueSymbol || null,
        oiContracts,
        oiBase,
        oiUsd,
        markPrice,
        indexPrice,
        timestamp: timestamp(pick(input.timestamp, ctx.timestamp))
    };
}

/* ------------------------------------------------------------
 * funding
 * ---------------------------------------------------------- */
function fundingSample(input = {}, ctx = {}) {
    const markPrice = positive(pick(input.markPrice, ctx.markPrice));
    const indexPrice = positive(pick(input.indexPrice, ctx.indexPrice));
    const basis = markPrice !== null && indexPrice !== null ? markPrice - indexPrice : null;

    return {
        exchange: ctx.exchange || input.exchange || null,
        symbol: ctx.symbol || input.symbol || null,
        venueSymbol: ctx.venueSymbol || input.venueSymbol || null,
        rate: pick(input.rate, input.fundingRate),
        predictedRate: pick(input.predictedRate, input.nextFundingRate),
        nextFundingTime: timestamp(pick(input.nextFundingTime, ctx.nextFundingTime)),
        intervalHours: positive(pick(input.intervalHours, ctx.intervalHours)),
        markPrice,
        indexPrice,
        basis,
        timestamp: timestamp(pick(input.timestamp, ctx.timestamp))
    };
}

/* ------------------------------------------------------------
 * long_short_ratio
 * ---------------------------------------------------------- */
function longShortRatioSample(input = {}, ctx = {}) {
    const longAccount = pick(input.longAccount, input.buyRatio, input.longPositionRatio);
    const shortAccount = pick(input.shortAccount, input.sellRatio, input.shortPositionRatio);
    const ratio = pick(
        input.ratio,
        input.longShortRatio,
        input.longShortPositionRatio,
        longAccount !== null && shortAccount !== null && shortAccount !== 0 ? longAccount / shortAccount : null
    );

    return {
        exchange: ctx.exchange || input.exchange || null,
        symbol: ctx.symbol || input.symbol || null,
        venueSymbol: ctx.venueSymbol || input.venueSymbol || null,
        longAccount,
        shortAccount,
        ratio,
        period: ctx.period || input.period || null,
        timestamp: timestamp(pick(input.timestamp, ctx.timestamp))
    };
}

/* ------------------------------------------------------------
 * liquidation (stream)
 * ---------------------------------------------------------- */
function liquidationSample(input = {}, ctx = {}) {
    const price = positive(input.price);
    const qty = positive(input.qty);
    const side = input.side === "long" || input.side === "short" ? input.side : null;

    return {
        exchange: ctx.exchange || input.exchange || null,
        symbol: ctx.symbol || input.symbol || null,
        venueSymbol: ctx.venueSymbol || input.venueSymbol || null,
        side,
        price,
        qty,
        notional: pick(input.notional, price !== null && qty !== null ? price * qty : null),
        timestamp: timestamp(pick(input.timestamp, ctx.timestamp))
    };
}

/* ------------------------------------------------------------
 * Annualisation helper (funding + analytics).
 *   default 8h funding interval → 3 settlements/day → 1095/year
 * ---------------------------------------------------------- */
function annualizeFunding(rate, intervalHours = 8, yearDays = 365) {
    const parsedRate = finite(rate);
    const hours = positive(intervalHours) || 8;
    if (parsedRate === null) return null;
    return parsedRate * (24 / hours) * yearDays;
}

module.exports = {
    finite,
    positive,
    timestamp,
    pick,
    openInterestSample,
    fundingSample,
    longShortRatioSample,
    liquidationSample,
    annualizeFunding
};
