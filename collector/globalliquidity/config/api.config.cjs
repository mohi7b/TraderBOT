module.exports = {
    equity: {
        priceVolume: "https://api.twelvedata.com/time_series",
        etfFlows: "https://api.businessquant.com/etf-flows"
    },

    bonds: {
        yields: "https://api.stlouisfed.org/fred/series/observations",
        etfFlows: "https://api.businessquant.com/bond-etf-flows"
    },

    commodities: {
        prices: "https://www.alphavantage.co/query",
        energyInventory: "https://api.eia.gov/series/"
    },

    fx: {
        pairs: "https://api.twelvedata.com/forex",
        dxy: "https://api.stlouisfed.org/fred/series/observations"
    },

    crypto: {
        marketData: "https://api.coingecko.com/api/v3",
        exchangeFlows: "https://api.cryptocompare.com/data/exchange"
    },

    macro: {
        rates: "https://api.stlouisfed.org/fred/series/observations",
        vix: "https://api.stlouisfed.org/fred/series/observations"
    },

    defaults: {
        timeout: 8000,
        retry: 3
    }
};
