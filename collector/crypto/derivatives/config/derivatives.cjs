/* ============================================================
 * File: collector/crypto/derivatives/config/derivatives.cjs
 * Section: collector/crypto/derivatives/config
 * Version: 1.0.0
 *
 * Role:
 *   Runtime configuration of the Derivatives collector: which symbols,
 *   which venues, how often REST snapshots are refreshed and how the
 *   liquidation stream behaves.
 *
 *   Every value can be overridden with an env var so the collector can
 *   be tuned without touching code (same convention as
 *   collector/crypto/realtime/config/realtime.cjs).
 * ============================================================ */

function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    return String(value).toLowerCase() !== "false";
}

function list(value, fallback) {
    if (!value) return fallback;
    const parts = String(value)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    return parts.length ? parts : fallback;
}

const DERIVATIVES_CONFIG = {
    version: "1.0.0",

    /* Symbols collected for every enabled venue (unified notation). */
    symbols: list(process.env.DERIVATIVES_SYMBOLS, ["BTCUSDT", "ETHUSDT"]),

    /* Venues, in the canonical order of the project. */
    venues: list(process.env.DERIVATIVES_VENUES, ["binance", "bybit", "okx", "kucoin", "bitget"]),

    /* REST refresh cadence. OI/funding do not need sub-second polling;
     * long-short ratios come in 5m buckets, so they refresh slower. */
    poll: {
        openInterestMs: num(process.env.DERIVATIVES_OI_MS, 15_000),
        fundingMs: num(process.env.DERIVATIVES_FUNDING_MS, 30_000),
        longShortRatioMs: num(process.env.DERIVATIVES_LSR_MS, 120_000),
        period: process.env.DERIVATIVES_LSR_PERIOD || "5m",
        /* Jitter keeps five venues from firing in lock-step (rate limits). */
        jitterMs: num(process.env.DERIVATIVES_JITTER_MS, 750),
        timeoutMs: num(process.env.DERIVATIVES_TIMEOUT_MS, 6_000),
        retries: num(process.env.DERIVATIVES_RETRIES, 1),
        backoffMs: num(process.env.DERIVATIVES_BACKOFF_MS, 400)
    },

    /* Liquidation websocket stream (best effort: only venues with a
     * public liquidation feed are connected). */
    stream: {
        enabled: bool(process.env.DERIVATIVES_STREAM, true),
        timeoutMs: num(process.env.DERIVATIVES_STREAM_TIMEOUT_MS, 8_000),
        reconnectMs: num(process.env.DERIVATIVES_RECONNECT_MS, 5_000),
        maxReconnectMs: num(process.env.DERIVATIVES_MAX_RECONNECT_MS, 60_000),
        /* Drop reconnect attempts for a venue after this many failures so
         * one dead feed cannot spin forever. */
        maxReconnects: num(process.env.DERIVATIVES_MAX_RECONNECTS, 8)
    },

    /* Aggregation windows used when the collector reports health. */
    health: {
        /* A venue is "stale" when it produced no sample for this long. */
        staleMs: num(process.env.DERIVATIVES_STALE_MS, 90_000)
    },

    logLevel: process.env.DERIVATIVES_LOG_LEVEL || "info"
};

module.exports = DERIVATIVES_CONFIG;
