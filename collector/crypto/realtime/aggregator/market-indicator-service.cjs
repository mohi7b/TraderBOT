const RollingWindowStore = require("../state/rolling-window-store.cjs");
const { ema, sma, returns } = require("../../common/analysis/indicators/base/price/price-indicators.cjs");
const { spreadBps, depthImbalance } = require("../../common/analysis/indicators/base/orderbook/orderbook-indicators.cjs");

class MarketIndicatorService {
    constructor() {
        this.previous = new Map();
        this.indicators = new Map();
        this.priceHistory = new Map();
    }

    ingest(aggregate) {
        const previous = this.previous.get(aggregate.symbol) || null;
        const spot = aggregate.spot.aggregate;
        const futures = aggregate.futures.aggregate;
        const basis = aggregate.crossMarket.basis;
        const oiUsd = futures.oi.totalUsd;
        const oiDeltaUsd = Number.isFinite(oiUsd) && Number.isFinite(previous?.oiUsd) ? oiUsd - previous.oiUsd : null;
        const basisTrend = Number.isFinite(basis) && Number.isFinite(previous?.basis) ? basis - previous.basis : null;
        const spotFlow = spot.trades["1m"];
        const futuresFlow = futures.trades["1m"];
        const price = spot.price?.median || futures.price?.median;
        const history = this.priceHistory.get(aggregate.symbol) || new RollingWindowStore({ maxAgeMs: 15 * 60 * 1000 });
        if (Number.isFinite(price)) history.push(price, aggregate.updatedAt);
        this.priceHistory.set(aggregate.symbol, history);
        const prices = history.between(15 * 60 * 1000, aggregate.updatedAt);
        const bestBid = spot.depth?.bestBid;
        const bestAsk = spot.depth?.bestAsk;
        const divergence = spotFlow.deltaVolume && futuresFlow.deltaVolume
            ? Math.sign(spotFlow.deltaVolume) !== Math.sign(futuresFlow.deltaVolume)
            : false;

        const indicators = {
            symbol: aggregate.symbol,
            updatedAt: Date.now(),
            orderFlow: {
                spotCvd1m: spotFlow.deltaVolume,
                futuresCvd1m: futuresFlow.deltaVolume,
                divergence
            },
            basis: {
                value: basis,
                bps: aggregate.crossMarket.basisBps,
                trend: basisTrend
            },
            fundingOi: {
                fundingRate: futures.funding.averageRate,
                oiUsd,
                oiDeltaUsd
            },
            liquidity: {
                spotImbalance5Bps: spot.depth?.bucketsBps?.[5]?.imbalance ?? 0,
                futuresImbalance5Bps: futures.depth?.bucketsBps?.[5]?.imbalance ?? 0,
                spotSpreadBps: spreadBps(bestBid, bestAsk),
                spotDepthImbalance: depthImbalance(spot.depth?.bidLiquidity, spot.depth?.askLiquidity)
            },
            technical: {
                sma20: sma(prices, 20),
                ema9: ema(prices, 9),
                ema21: ema(prices, 21),
                return1: returns(prices, 1)
            }
        };

        this.previous.set(aggregate.symbol, { basis, oiUsd });
        this.indicators.set(aggregate.symbol, indicators);
        global.marketIndicators = this.indicators;
        return indicators;
    }

    get(symbol) {
        return this.indicators.get(symbol) || null;
    }
}

module.exports = new MarketIndicatorService();
