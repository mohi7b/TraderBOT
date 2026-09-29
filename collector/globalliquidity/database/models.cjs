module.exports = {
    equity: require('./tables/liquidity_equity.table.cjs'),
    bonds: require('./tables/liquidity_bonds.table.cjs'),
    commodities: require('./tables/liquidity_commodities.table.cjs'),
    fx: require('./tables/liquidity_fx.table.cjs'),
    crypto: require('./tables/liquidity_crypto.table.cjs'),
    fundflows: require('./tables/liquidity_fundflows.table.cjs'),
    macro: require('./tables/macro_signals.table.cjs'),
    alerts: require('./tables/liquidity_alerts.table.cjs')
};
