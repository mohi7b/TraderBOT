/* ============================================================
 * File: collector/crypto/derivatives/venues/kucoin.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   KuCoin Futures (USDT-M) adapter for the derivatives collector.
 *
 * Endpoints (verified live 2026-09-26, all HTTP 200):
 *   OI/funding/price  api-futures.kucoin.com/api/v1/contracts/<SYMBOL>
 *                     → openInterest (contracts), multiplier, markPrice,
 *                       indexPrice, fundingFeeRate, predictedFundingFeeRate,
 *                       fundingRateGranularity
 *   funding detail    api-futures.kucoin.com/api/v1/funding-rate/<SYMBOL>/current
 *                     → value, fundingTime, lastTimeFundingRate
 *
 * Symbol notation: BTCUSDT → XBTUSDTM (KuCoin quotes BTC as XBT and
 * suffixes perpetual contracts with M). api.kucoin.com answers 404 for
 * these symbols — the futures REST host is api-futures.kucoin.com.
 *
 * Capability gaps (deliberate, they are venue-side):
 *   - no public long/short account ratio  → longShortRatio: false
 *   - no public liquidation stream        → liquidations: false
 *   Both are reported in the collector's health snapshot instead of
 *   being silently treated as "no data".
 *
 * oiBase = openInterest(contracts) × multiplier, oiUsd = oiBase × markPrice.
 * ============================================================ */

const NAME = "kucoin";
const REST = "https://api-futures.kucoin.com";

const CAPABILITIES = Object.freeze({
    openInterest: true,
    funding: true,
    predictedFunding: true,
    longShortRatio: false,
    liquidations: false
});

/** BTCUSDT → XBTUSDTM */
function symbolFor(symbol) {
    const upper = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const quote = upper.endsWith("USDC") ? "USDC" : "USDT";
    const base = upper.slice(0, upper.length - quote.length);
    const venueBase = base === "BTC" ? "XBT" : base;
    return `${venueBase}${quote}M`;
}

function unwrap(body, source) {
    if (!body || typeof body !== "object") return null;
    if (String(body.code) !== "200000") {
        throw new Error(`kucoin ${source} code=${body.code} ${body.msg || ""}`.trim());
    }
    return body.data || null;
}

function requests(symbol) {
    const venueSymbol = symbolFor(symbol);
    return {
        openInterest: { url: `${REST}/api/v1/contracts/${venueSymbol}` },
        funding: { url: `${REST}/api/v1/funding-rate/${venueSymbol}/current` },
        longShortRatio: null
    };
}

/** Contracts endpoint carries OI + prices + funding in one payload. */
function parseOpenInterest(body) {
    const data = unwrap(body, "contracts");
    if (!data) return null;

    const multiplier = Number(data.multiplier);
    const contracts = Number(data.openInterest);

    return {
        oiContracts: Number.isFinite(contracts) ? contracts : null,
        oiBase: Number.isFinite(contracts) && Number.isFinite(multiplier) ? contracts * multiplier : null,
        markPrice: data.markPrice,
        indexPrice: data.indexPrice,
        timestamp: Date.now()
    };
}

function parseContract(body) {
    return unwrap(body, "contracts");
}

function parseFunding(body) {
    const data = unwrap(body, "funding-rate");
    if (!data) return null;

    const granularityMs = Number(data.granularity);
    return {
        rate: data.value,
        nextFundingTime: data.fundingTime,
        intervalHours: Number.isFinite(granularityMs) && granularityMs > 0 ? granularityMs / 3_600_000 : 8,
        timestamp: data.timePoint
    };
}

module.exports = {
    name: NAME,
    capabilities: CAPABILITIES,
    symbolFor,
    requests,
    parse: {
        openInterest: parseOpenInterest,
        funding: parseFunding,
        contract: parseContract,
        longShortRatio: () => null
    },
    liquidation: null
};
