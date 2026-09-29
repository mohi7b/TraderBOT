const REQUIRED_FUTURES_TYPES = [
    "price",
    "depth",
    "candles",
    "funding",
    "liquidation",
    "markPrice",
    "oi"
];

function ensureDebugState() {
    if (!global.debugState) {
        global.debugState = {
            enabled: false,
            events: [],
            lastBySymbol: {},
            lastByEvent: {},
            counters: {}
        };
    }

    return global.debugState;
}

function summarizeCounters() {
    const state = ensureDebugState();
    const counters = { ...state.counters };
    const keys = Object.keys(counters).sort();
    return keys.reduce((acc, key) => {
        acc[key] = counters[key];
        return acc;
    }, {});
}

function getCoverageStatus() {
    const state = ensureDebugState();
    const counters = summarizeCounters();

    const coverage = REQUIRED_FUTURES_TYPES.reduce((acc, type) => {
        const value = counters[type] || 0;
        acc[type] = {
            seen: value > 0,
            count: value
        };
        return acc;
    }, {});

    const allPresent = REQUIRED_FUTURES_TYPES.every(type => coverage[type].seen);

    return {
        allPresent,
        coverage,
        missing: REQUIRED_FUTURES_TYPES.filter(type => !coverage[type].seen)
    };
}

function getSummary() {
    const state = ensureDebugState();
    const byType = summarizeCounters();
    const marketHealth = Array.isArray(global.marketHealth) ? global.marketHealth : [];
    const marketStatus = marketHealth.reduce((counts, record) => {
        counts[record.status] = (counts[record.status] || 0) + 1;
        return counts;
    }, {});
    const recent = state.events.slice(-10).map(entry => ({
        ts: entry.ts,
        kind: entry.kind,
        symbol: entry.symbol,
        event: entry.event,
        type: entry.type
    }));
    const coverage = getCoverageStatus();

    return {
        enabled: !!state.enabled,
        eventCount: state.events.length,
        counters: byType,
        marketHealth,
        marketStatus,
        liquidation: Array.isArray(global.liquidationHealth) ? global.liquidationHealth : [],
        coverage,
        lastBySymbol: { ...state.lastBySymbol },
        lastByEvent: { ...state.lastByEvent },
        recent,
        snapshotAt: Date.now()
    };
}

function renderCompact() {
    const summary = getSummary();
    const lines = [
        "[DEBUG-DASHBOARD]",
        `enabled=${summary.enabled}`,
        `events=${summary.eventCount}`,
        `coverage=${summary.coverage.allPresent ? 'ALL-7-OK' : `MISSING-${summary.coverage.missing.join(',') || 'NONE'}`}`,
        `counters=${JSON.stringify(summary.counters)}`,
        `marketStatus=${JSON.stringify(summary.marketStatus)}`
    ];

    if (summary.recent.length) {
        lines.push(`recent=${JSON.stringify(summary.recent.slice(-3))}`);
    }

    const symbols = Object.keys(summary.lastBySymbol);
    if (symbols.length) {
        lines.push(`symbols=${symbols.join(",")}`);
    }

    return lines.join(" | ");
}

function printSummary() {
    console.log(renderCompact());
    return getSummary();
}

module.exports = {
    REQUIRED_FUTURES_TYPES,
    ensureDebugState,
    getSummary,
    getCoverageStatus,
    renderCompact,
    printSummary,
    summary: getSummary
};
