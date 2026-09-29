/* ============================================================
 * File: collector/crypto/onchain/tests/fixtures.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   Upstream payloads in the shape each provider actually answers with
 *   (trimmed to the fields the parsers read), plus a fake feed client that
 *   routes by URL. No network is touched, so a test can assert what the
 *   collector does with a *known* answer instead of hoping the internet
 *   cooperates.
 *
 *   Every fixture keeps at least one honest hole — a null reserve, a missing
 *   inflow, a null apy, an asset nobody tracks — because the behaviour worth
 *   testing is what happens to a number that is not there.
 * ============================================================ */

/** 2026-09-27T12:00:00Z — one fixed clock for every fixture. */
const AT = Date.UTC(2026, 8, 27, 12, 0, 0);
const DAY = 86_400_000;

/** A 64-hex block hash (only the first 12 characters are ever displayed). */
function hashOf(seed) {
    return seed.toString(16).padStart(64, "0");
}

const BLOCK_A = hashOf(0x9123);
const BLOCK_B = hashOf(0x9124);
const BLOCK_C = hashOf(0x9125);

/* ------------------------------------------------------------
 * DefiLlama — CEX transparency (/cexs)
 * 12 holders are tracked; "BitMart" is deliberately not one of them.
 * ---------------------------------------------------------- */
function cexRows() {
    return [
        { name: "Binance", slug: "binance", coin: "BTC", currentTvl: 128_500_000_000, cleanAssetsTvl: 121_000_000_000, inflows_24h: 210_000_000, inflows_1w: -140_000_000, inflows_1m: 900_000_000, spotVolume: 12_000_000_000, oi: 3_000_000_000, derivVolume: 40_000_000_000, leverage: 0.25, walletsLink: "https://example.invalid/binance" },
        { name: "Coinbase", currentTvl: 42_000_000_000, cleanAssetsTvl: 40_000_000_000, inflows_24h: -80_000_000, inflows_1w: null, inflows_1m: -200_000_000, spotVolume: 3_000_000_000, oi: 1_000_000_000, derivVolume: 5_000_000_000, leverage: null },
        { name: "OKX", currentTvl: null, cleanAssetsTvl: 18_000_000_000, inflows_24h: null, inflows_1w: null, inflows_1m: null, spotVolume: 900_000_000, oi: null, derivVolume: null, leverage: null },
        { name: "BitMart", currentTvl: 4_000_000, cleanAssetsTvl: 4_000_000, inflows_24h: 12_000, inflows_1w: 0, inflows_1m: 0, spotVolume: 1_000, oi: 0, derivVolume: 0, leverage: 0 }
    ];
}

/* ------------------------------------------------------------
 * DefiLlama — stablecoins (/stablecoins?includePrices=false)
 * ---------------------------------------------------------- */
function stablecoinAsset(symbol, name, circulating, prevDay, chains) {
    const chainCirculating = {};
    for (const [chain, [current, day, week]] of Object.entries(chains || {})) {
        chainCirculating[chain] = {
            current: { peggedUSD: current },
            circulatingPrevDay: { peggedUSD: day },
            circulatingPrevWeek: { peggedUSD: week }
        };
    }
    return {
        symbol,
        name,
        pegType: "peggedUSD",
        pegMechanism: "fiat-backed",
        circulating: { peggedUSD: circulating },
        circulatingPrevDay: { peggedUSD: prevDay },
        circulatingPrevWeek: { peggedUSD: prevDay - 500_000_000 },
        circulatingPrevMonth: { peggedUSD: prevDay - 2_000_000_000 },
        chains: Object.keys(chainCirculating),
        chainCirculating
    };
}

function stablecoinRows() {
    return [
        stablecoinAsset("USDT", "Tether", 183_700_000_000, 183_500_000_000, {
            Ethereum: [90_000_000_000, 89_500_000_000, 88_000_000_000],
            Tron: [70_000_000_000, 70_100_000_000, 69_000_000_000],
            /* A chain with no usable number must not inflate the split. */
            Solana: [null, null, null]
        }),
        stablecoinAsset("USDC", "USD Coin", 74_000_000_000, 74_300_000_000, {
            Ethereum: [50_000_000_000, 50_200_000_000, 51_000_000_000]
        }),
        stablecoinAsset("DAI", "Dai", 5_300_000_000, 5_300_000_000, {
            Ethereum: [5_000_000_000, 4_900_000_000, 4_800_000_000]
        }),
        /* Nobody tracks this one: it must be counted as listed, never published. */
        stablecoinAsset("USDX", "Unknown Dollar", 12_000_000, 13_000_000, {})
    ];
}

/* ------------------------------------------------------------
 * DefiLlama — yields (/pools)
 * ---------------------------------------------------------- */
function pool(symbol, project, chain, apyBase, apyReward, tvlUsd) {
    return {
        chain,
        project,
        symbol,
        pool: `${project}-${symbol}-${tvlUsd}`,
        stablecoin: true,
        apyBase,
        apyReward,
        apy: apyBase === null ? null : apyBase + (apyReward || 0),
        tvlUsd,
        exposure: "single",
        ilRisk: "no",
        apyPct7D: 0.12,
        apyMean30d: apyBase === null ? null : apyBase - 0.3,
        volumeUsd7d: tvlUsd / 10
    };
}

function poolRows() {
    return [
        pool("USDT", "aave-v3", "Ethereum", 4.2, 1.9, 900_000_000),
        pool("USDT", "compound-v3", "Ethereum", 3.8, 0, 400_000_000),
        pool("USDT", "morpho-blue", "Base", 6.5, 0.4, 60_000_000),
        /* A pool with no apy at all: the medians must survive it. */
        pool("USDT", "spark", "Ethereum", null, null, 25_000_000),
        pool("USDC", "aave-v3", "Ethereum", 3.1, 0, 700_000_000),
        pool("USDC", "curve-dex", "Arbitrum", 2.4, 1.1, 40_000_000),
        /* Another asset's pool: parsed, then matched to nothing. */
        pool("FRAX", "frax", "Ethereum", 8.0, 2.0, 10_000_000),
        /* A non-stablecoin pool: the provider parser must drop it. */
        { ...pool("USDT", "sushi", "Ethereum", 9.9, 0, 5_000_000), stablecoin: false },
        /* A pool without an id: dropped before it reaches a subsystem. */
        { ...pool("USDT", "unknown-dex", "Ethereum", 9.9, 0, 5_000_000), pool: null }
    ];
}

/* ------------------------------------------------------------
 * mempool.space — the queue, the block list, one block's transfers
 * ---------------------------------------------------------- */
function mempoolPayload() {
    return {
        count: 43_212,
        vsize: 22_450_000,
        total_fee: 46_000_000,
        fee_histogram: [[1.05, 4_000_000], [2.1, 8_000_000], [12.4, 100_000]]
    };
}

function blockRow(id, height, txCount, minutesAgo, extras = {}) {
    return {
        id,
        height,
        version: 0x20000000,
        timestamp: Math.round(AT / 1000) - minutesAgo * 60,
        tx_count: txCount,
        size: 1_400_000,
        weight: 3_900_000,
        stale: false,
        extras: { medianFee: 3, reward: 312_500_000, totalFees: 12_000_000, ...extras }
    };
}

function blockRows() {
    /* Newest first, as the provider answers. */
    const oldest = blockRow(BLOCK_A, 912_300, 3_002, 23, { medianFee: 2 });
    oldest.stale = true;
    return [
        blockRow(BLOCK_C, 912_302, 4_117, 3, { medianFee: 4 }),
        blockRow(BLOCK_B, 912_301, 2_874, 13),
        oldest
    ];
}

/** One transaction, expressed in outputs (and a fee that is not part of them). */
function transactionRow(txid, valueSats, { feeSats = 1_500, outputs = 2 } = {}) {
    const share = Math.floor(valueSats / outputs);
    const vout = Array.from({ length: outputs }, (_, index) => ({ n: index, value: index === outputs - 1 ? valueSats - share * (outputs - 1) : share }));
    return {
        txid,
        fee: feeSats,
        size: 480,
        weight: 1_600,
        vin: [{ txid: hashOf(0xa1), vout: 0 }, { txid: hashOf(0xa2), vout: 1 }],
        vout,
        status: { confirmed: true, block_height: 912_302 }
    };
}

/** Four transfers: two above the 1 BTC whale threshold, two below it. */
function transactionRows() {
    return [
        transactionRow(hashOf(0xb1), 250_000_000, { feeSats: 42_000 }),
        transactionRow(hashOf(0xb2), 120_000_000),
        transactionRow(hashOf(0xb3), 40_000_000),
        /* A transaction whose outputs are unreadable: valueSats null, kept out. */
        { ...transactionRow(hashOf(0xb4), 5_000_000), vout: null }
    ];
}

/* ------------------------------------------------------------
 * Blockchain.com charts — a daily series, two points are used
 * ---------------------------------------------------------- */
function chartSeries(points) {
    return { status: "ok", period: "day", unit: "BTC", values: points };
}

function supplySeries() {
    return chartSeries([
        { x: Math.round((AT - 2 * DAY) / 1000), y: 19_899_000 },
        { x: Math.round((AT - DAY) / 1000), y: 19_899_800 },
        { x: Math.round(AT / 1000), y: 19_900_112.5 }
    ]);
}

function txVolumeSeries() {
    return chartSeries([
        { x: Math.round((AT - 2 * DAY) / 1000), y: 4_100_000_000 },
        { x: Math.round((AT - DAY) / 1000), y: 4_500_000_000 },
        { x: Math.round(AT / 1000), y: 3_600_000_000 }
    ]);
}

/* ------------------------------------------------------------
 * Yahoo chart + Nasdaq quote — two words for one share price
 * ---------------------------------------------------------- */
function yahooChart(symbol) {
    const seconds = Math.round(AT / 1000);
    return {
        chart: {
            result: [{
                meta: {
                    currency: "USD",
                    symbol,
                    exchangeName: "NGM",
                    fullExchangeName: "NasdaqGM",
                    instrumentType: "ETF",
                    regularMarketPrice: 47.57,
                    regularMarketTime: seconds,
                    chartPreviousClose: 47.81,
                    dataGranularity: "1d"
                },
                timestamp: [seconds - 86400, seconds],
                indicators: { quote: [{ close: [47.5, 47.57], volume: [980_000, 1_240_000] }] }
            }],
            error: null
        }
    };
}

function nasdaqInfo(symbol) {
    return {
        data: {
            symbol,
            companyName: `${symbol} Trust ETF`,
            exchange: "NASDAQ-GM",
            isNasdaqListed: true,
            primaryData: {
                lastSalePrice: "$47.57",
                netChange: "-0.24",
                percentageChange: "-0.50%",
                deltaIndicator: "decreased",
                lastTradeTimestamp: "Sep 25, 2026"
            }
        },
        message: null,
        status: {}
    };
}
/* ------------------------------------------------------------
 * Routing: one fake client, every endpoint the module knows
 * ---------------------------------------------------------- */
function symbolFromYahoo(url) {
    const parts = url.split("/v8/finance/chart/");
    return decodeURIComponent((parts[1] || "").split("?")[0]);
}

function symbolFromNasdaq(url) {
    const parts = url.split("/api/quote/");
    return decodeURIComponent((parts[1] || "").split("/")[0]);
}

/** url → the payload that endpoint would answer with (null: an unknown url). */
const ROUTES = [
    { matches: (url) => url.includes("api.llama.fi/cexs"), payload: () => ({ cexs: cexRows() }) },
    { matches: (url) => url.includes("stablecoins.llama.fi/stablecoins"), payload: () => ({ peggedAssets: stablecoinRows() }) },
    { matches: (url) => url.includes("yields.llama.fi/pools"), payload: () => ({ status: "success", data: poolRows() }) },
    { matches: (url) => url.includes("/api/mempool"), payload: () => mempoolPayload() },
    { matches: (url) => url.includes("/api/v1/blocks"), payload: () => blockRows() },
    { matches: (url) => url.includes("/txs"), payload: () => transactionRows() },
    { matches: (url) => url.includes("charts/total-bitcoins"), payload: () => supplySeries() },
    { matches: (url) => url.includes("estimated-transaction-volume-usd"), payload: () => txVolumeSeries() },
    { matches: (url) => url.includes("/v8/finance/chart/"), payload: (url) => yahooChart(symbolFromYahoo(url)) },
    { matches: (url) => url.includes("/api/quote/"), payload: (url) => nasdaqInfo(symbolFromNasdaq(url)) }
];

function payloadFor(url) {
    const route = ROUTES.find((entry) => entry.matches(url));
    return route ? route.payload(url) : null;
}

/**
 * A feed client with the real one's surface (get/acquire/stats/reset) and no
 * socket. `fail(providerId, url)` returns a reason to make a request fail;
 * `data` overrides the answer of one url.
 */
function createFakeClient({ fail = null, data = null } = {}) {
    const calls = [];

    async function get(providerId, url) {
        calls.push({ providerId, url });
        if (typeof fail === "function") {
            const reason = fail(providerId, url);
            if (reason) return { ok: false, status: 502, data: null, reason: typeof reason === "string" ? reason : "HTTP 502", url };
        }
        const payload = data && Object.prototype.hasOwnProperty.call(data, url) ? data[url] : payloadFor(url);
        if (payload === null || payload === undefined) return { ok: false, status: 404, data: null, reason: "HTTP 404", url };
        return { ok: true, status: 200, data: payload, url };
    }

    return {
        get,
        calls,
        callsOf: (providerId) => calls.filter((call) => call.providerId === providerId),
        urlsOf: (providerId) => calls.filter((call) => call.providerId === providerId).map((call) => call.url),
        acquire: async () => true,
        stats: () => ({ calls: calls.length, cacheHits: 0, providers: [...new Set(calls.map((call) => call.providerId))] }),
        reset: () => (calls.length = 0)
    };
}

module.exports = {
    AT,
    DAY,
    BLOCK_A,
    BLOCK_B,
    BLOCK_C,
    hashOf,
    cexRows,
    stablecoinAsset,
    stablecoinRows,
    pool,
    poolRows,
    mempoolPayload,
    blockRow,
    blockRows,
    transactionRow,
    transactionRows,
    chartSeries,
    supplySeries,
    txVolumeSeries,
    yahooChart,
    nasdaqInfo,
    symbolFromYahoo,
    symbolFromNasdaq,
    ROUTES,
    payloadFor,
    createFakeClient
};

