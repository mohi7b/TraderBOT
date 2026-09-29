/* ============================================================
 * File: collector/crypto/derivatives/venues/okx.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   OKX SWAP adapter for the derivatives collector.
 *
 * Endpoints (verified live 2026-09-26, all HTTP 200):
 *   OI      v5/public/open-interest                  → oi (contracts), oiCcy (base),
 *                                                      oiUsd (USD), ts
 *   funding v5/public/funding-rate                   → fundingRate, nextFundingRate
 *                                                      (predicted), fundingTime,
 *                                                      nextFundingTime, ts
 *   LSR     v5/rubik/stat/contracts/long-short-account-ratio
 *                                                    → [[ts, ratio], ...] newest first
 *   stream  wss://ws.okx.com:8443/ws/v5/public       channel liquidation-orders
 *
 * Symbol notation: BTCUSDT → BTC-USDT-SWAP (the only venue with dashes).
 *
 * Liquidation side semantics (OKX liquidation-orders):
 *   `side` is the side of the LIQUIDATION ORDER → "sell" means a long
 *   position was closed out.
 *
 * Sizing note: OKX reports liquidation size in CONTRACTS; the base-asset
 * size needs the contract value (ctVal). ctVal is not part of the push
 * message, so CONTRACT_VALUES below carries the exchange's published
 * values for the collected symbols (BTC-USDT-SWAP 0.01, ETH 0.1) and
 * falls back to 1 (i.e. size taken as-is) for anything else.
 * ============================================================ */

const NAME = "okx";
const REST = "https://www.okx.com";
const WS = "wss://ws.okx.com:8443/ws/v5/public";

const CONTRACT_VALUES = Object.freeze({ BTC: 0.01, ETH: 0.1 });

const CAPABILITIES = Object.freeze({
    openInterest: true,
    funding: true,
    predictedFunding: true,
    longShortRatio: true,
    liquidations: true
});

function baseAssetOf(symbol) {
    return String(symbol).toUpperCase().replace(/(USDT|USDC|USD)$/, "");
}

/** BTCUSDT → BTC-USDT-SWAP */
function symbolFor(symbol) {
    const upper = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const quote = upper.endsWith("USDC") ? "USDC" : "USDT";
    const base = upper.slice(0, upper.length - quote.length);
    return `${base}-${quote}-SWAP`;
}

function contractValueOf(symbol) {
    return CONTRACT_VALUES[baseAssetOf(symbol)] || 1;
}

/* OKX puts the payload in data[] and the status in code. */
function unwrap(body, source) {
    if (!body || typeof body !== "object") return null;
    if (String(body.code) !== "0") {
        throw new Error(`okx ${source} code=${body.code} ${body.msg || ""}`.trim());
    }
    return Array.isArray(body.data) ? body.data : [];
}

function requests(symbol, { period = "5m" } = {}) {
    const venueSymbol = symbolFor(symbol);
    const ccy = baseAssetOf(symbol);
    return {
        openInterest: { url: `${REST}/api/v5/public/open-interest?instId=${venueSymbol}` },
        funding: { url: `${REST}/api/v5/public/funding-rate?instId=${venueSymbol}` },
        longShortRatio: {
            url: `${REST}/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${ccy}&period=${period}`
        }
    };
}

function parseOpenInterest(body) {
    const [row] = unwrap(body, "open-interest") || [];
    if (!row) return null;
    return {
        oiContracts: row.oi,
        oiBase: row.oiCcy,
        oiUsd: row.oiUsd,
        timestamp: row.ts
    };
}

function parseFunding(body) {
    const [row] = unwrap(body, "funding-rate") || [];
    if (!row) return null;
    return {
        rate: row.fundingRate,
        predictedRate: row.nextFundingRate === "" ? null : row.nextFundingRate,
        nextFundingTime: row.nextFundingTime,
        intervalHours: 8,
        timestamp: row.ts
    };
}

function parseLongShortRatio(body) {
    const rows = unwrap(body, "rubik") || [];
    const [newest] = rows;
    if (!newest) return null;
    return { ratio: newest[1], timestamp: newest[0] };
}

function parseLiquidation(message) {
    const row = message && Array.isArray(message.data) ? message.data[0] : null;
    const detail = row && Array.isArray(row.details) ? row.details[0] : null;
    if (!detail) return null;

    return {
        symbol: detail.instId,
        orderSide: String(detail.side || "").toLowerCase() || null,
        liquidatedSide: String(detail.side || "").toLowerCase() === "sell" ? "long" : "short",
        price: detail.bkPx,
        qty: detail.sz,
        contractValue: contractValueOf(detail.instId),
        timestamp: detail.ts
    };
}

module.exports = {
    name: NAME,
    capabilities: CAPABILITIES,
    symbolFor,
    contractValueOf,
    requests,
    parse: { openInterest: parseOpenInterest, funding: parseFunding, longShortRatio: parseLongShortRatio },
    liquidation: {
        url: WS,
        subscribe: () => ({
            op: "subscribe",
            args: [{ channel: "liquidation-orders", instType: "SWAP" }]
        }),
        filter: (message, ctx) => !ctx || !ctx.venueSymbol || (message && message.arg && message.arg.instType === "SWAP"),
        parse: parseLiquidation
    }
};
