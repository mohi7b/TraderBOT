/* ============================================================
 * File: collector.cjs
 * Section: collector/aanode/config
 * Role:
 *   Collector subsystem configuration.
 *   This is the collector-side source-of-truth for what should be
 *   collected and in which layers for each symbol — and, for the one
 *   source that is not symbol-shaped (liquidity: six markets on one
 *   axis), whether and how it is started.
 * ============================================================ */

const EXCHANGES = require("../../../orchestrator/aanode/config/exchanges.cjs");
const REALTIME = require("../../crypto/realtime/config/realtime.cjs");

const COLLECTOR_CONFIG = {
    realtime: true,
    historical: false,
    macro: false,
    sentiment: false,
    sources: {
        realtime: {
            enabled: true,
            // Derived from collector/crypto/realtime/config/* — the section owns the
            // activation matrix, so the collector plan and the streams the
            // realtime service actually starts cannot drift apart.
            types: [...REALTIME.markets],
            exchanges: [...EXCHANGES.EXCHANGE_ORDER]
        },
        historical: {
            enabled: false,
            types: ["futures", "spot"],
            exchanges: ["binance", "bybit", "bitget", "kucoin", "okx"]
        },
        macro: {
            enabled: false,
            types: ["macro"],
            exchanges: []
        },
        sentiment: {
            enabled: false,
            types: ["social", "news", "trends"],
            exchanges: []
        },
        /* The six markets are not symbol-shaped: one task there is one
         * provider/instrument pair, not one symbol on one venue. This source
         * therefore lists no `types`/`exchanges` — it adds nothing to
         * buildCollectorPlan, which stays the realtime-shaped plan it has
         * always been, and the started collector reports what it planned.
         * The section's own catalog (collector/liquidity_6markets/instruments)
         * owns which markets and instruments exist; the fields below only
         * narrow that, and null means "the section's own default", never
         * "nothing". */
        liquidity: {
            enabled: true,
            markets: null,      /* e.g. ["crypto", "forex"] — null: all six */
            venues: null,       /* e.g. ["yahoo", "fred"] — null: every usable venue */
            instruments: null,  /* e.g. ["BTCUSDT"] — null: every instrument */
            intervalMs: null    /* null: the section's DEFAULT_INTERVAL_MS (pause between sweeps) */
        },
        /* The on-chain subjects are not symbol-shaped either: one task is one
         * provider endpoint about one subject — a chain, a holder, a
         * stablecoin or a fund. Like `liquidity` this source lists no
         * `types`/`exchanges`, so it adds nothing to buildCollectorPlan; the
         * section's own catalog (collector/crypto/onchain/subjects) owns what
         * exists, and the fields below only narrow it — null means "the
         * section's own default", never "nothing". */
        onchain: {
            enabled: true,
            groups: null,       /* narrows the subject catalog by group id (GROUP_IDS) — null: all groups */
            tasks: null,        /* e.g. one taskId — null: every task */
            providers: null,    /* e.g. ["mempool"] — null: every provider that is ready */
            intervalMs: null    /* null: the section's DEFAULT_INTERVAL_MS (pause between polls) */
        }
    }
};

function getEnabledSources() {
    return Object.entries(COLLECTOR_CONFIG.sources)
        .filter(([, source]) => source && source.enabled)
        .map(([name]) => name);
}

function buildCollectorPlan(symbols = EXCHANGES.symbols) {
    const tasks = [];

    for (const sourceName of getEnabledSources()) {
        const source = COLLECTOR_CONFIG.sources[sourceName];
        if (!source || !source.enabled) continue;

        for (const marketType of source.types || []) {
            for (const exchange of source.exchanges || []) {
                for (const symbol of symbols) {
                    tasks.push({
                        source: sourceName,
                        exchange,
                        marketType,
                        symbol,
                        enabled: true,
                        stage: "collector"
                    });
                }
            }
        }
    }

    return tasks;
}

module.exports = {
    ...COLLECTOR_CONFIG,
    getEnabledSources,
    buildCollectorPlan
};
