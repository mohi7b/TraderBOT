const binance = require("./binance.cjs");

// Each entry is a factory `({ httpClient, fetchImpl, timeoutMs }) => { venue, fetchKlines, fetchRange }`,
// matching createCryptoAdapter / createVenueFetchers. binance ships a BinanceHistoricalFetcher class,
// so it is instantiated and its methods bound into the same factory contract.
module.exports = Object.freeze({
    binance: ({ httpClient, fetchImpl, timeoutMs } = {}) => {
        const fetcher = new binance.BinanceHistoricalFetcher({ httpClient, fetchImpl, timeoutMs });
        return Object.freeze({ venue: "binance", fetchKlines: fetcher.fetchKlines.bind(fetcher), fetchRange: fetcher.fetchRange.bind(fetcher) });
    },
    bybit: require("./bybit.cjs"),
    okx: require("./okx.cjs"),
    kucoin: require("./kucoin.cjs"),
    bitget: require("./bitget.cjs"),
});
