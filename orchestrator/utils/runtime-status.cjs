function getMarketStatus(symbol) {
    const aggregates = global.marketAggregates instanceof Map ? global.marketAggregates : new Map();
    const indicators = global.marketIndicators instanceof Map ? global.marketIndicators : new Map();
    const charts = global.chartSeries instanceof Map ? global.chartSeries : new Map();
    const chartDefinitions = global.chartDefinitions || [];
    const fundamentals = global.fundamentalAggregates instanceof Map ? global.fundamentalAggregates : new Map();
    const marketHealth = Array.isArray(global.marketHealth) ? global.marketHealth : [];
    const liquidation = Array.isArray(global.liquidationHealth) ? global.liquidationHealth : [];

    return {
        generatedAt: Date.now(),
        aggregate: symbol ? aggregates.get(symbol) || null : Object.fromEntries(aggregates),
        indicators: symbol ? indicators.get(symbol) || null : Object.fromEntries(indicators),
        charts: symbol ? charts.get(symbol) || null : Object.fromEntries(charts),
        chartDefinitions,
        fundamentals: symbol ? fundamentals.get(symbol) || fundamentals.get("GLOBAL") || null : Object.fromEntries(fundamentals),
        marketHealth: symbol ? marketHealth.filter((record) => record.symbol === symbol) : marketHealth,
        liquidation
    };
}

module.exports = { getMarketStatus };