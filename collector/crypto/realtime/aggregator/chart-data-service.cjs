const { CHARTS } = require("../config/charts.cjs");

const DEFAULT_CONFIG = Object.freeze({
    sampleMs: 1000,
    maxPoints: 900,
    depthBuckets: [5, 25]
});

function finite(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

class ChartDataService {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.series = new Map();
        global.chartDefinitions = CHARTS;
    }

    empty(symbol) {
        return {
            symbol,
            updatedAt: null,
            price: [],
            volumeFlow: [],
            basis: [],
            fundingOi: [],
            liquidity: []
        };
    }

    ingest(aggregate, indicators, now = Date.now()) {
        if (!aggregate?.symbol) return null;
        const current = this.series.get(aggregate.symbol) || this.empty(aggregate.symbol);
        const lastPoint = current.price[current.price.length - 1];
        if (lastPoint && now - lastPoint.time < this.config.sampleMs) return current;

        const spot = aggregate.spot?.aggregate || {};
        const futures = aggregate.futures?.aggregate || {};
        const spotFlow = spot.trades?.["1m"] || {};
        const futuresFlow = futures.trades?.["1m"] || {};
        const point = { time: now };

        current.price.push({
            ...point,
            spot: finite(spot.price?.weightedMedian ?? spot.price?.median),
            futures: finite(futures.price?.weightedMedian ?? futures.price?.median),
            mark: finite(futures.markPrice?.median),
            ema9: finite(indicators?.technical?.ema9),
            ema21: finite(indicators?.technical?.ema21),
            sma20: finite(indicators?.technical?.sma20)
        });
        current.volumeFlow.push({
            ...point,
            spotVwap: finite(spotFlow.vwap),
            futuresVwap: finite(futuresFlow.vwap),
            spotDelta: finite(spotFlow.deltaVolume),
            futuresDelta: finite(futuresFlow.deltaVolume),
            spotImbalance: finite(spotFlow.imbalance),
            futuresImbalance: finite(futuresFlow.imbalance)
        });
        current.basis.push({
            ...point,
            value: finite(aggregate.crossMarket?.basis),
            bps: finite(aggregate.crossMarket?.basisBps),
            trend: finite(indicators?.basis?.trend)
        });
        current.fundingOi.push({
            ...point,
            fundingRate: finite(futures.funding?.averageRate),
            oiUsd: finite(futures.oi?.totalUsd),
            oiDeltaUsd: finite(indicators?.fundingOi?.oiDeltaUsd)
        });
        current.liquidity.push({
            ...point,
            spotSpreadBps: finite(indicators?.liquidity?.spotSpreadBps),
            spotImbalance5Bps: finite(indicators?.liquidity?.spotImbalance5Bps),
            futuresImbalance5Bps: finite(indicators?.liquidity?.futuresImbalance5Bps),
            spotBidLiquidity: finite(spot.depth?.bidLiquidity),
            spotAskLiquidity: finite(spot.depth?.askLiquidity),
            futuresBidLiquidity: finite(futures.depth?.bidLiquidity),
            futuresAskLiquidity: finite(futures.depth?.askLiquidity)
        });

        for (const key of ["price", "volumeFlow", "basis", "fundingOi", "liquidity"]) {
            current[key] = current[key].slice(-this.config.maxPoints);
        }
        current.updatedAt = now;
        this.series.set(aggregate.symbol, current);
        global.chartSeries = this.series;
        return current;
    }

    get(symbol) {
        return this.series.get(symbol) || null;
    }

    snapshot(symbol) {
        return symbol ? this.get(symbol) : Object.fromEntries(this.series);
    }

    definitions() {
        return CHARTS;
    }

    clear(symbol) {
        if (symbol) this.series.delete(symbol);
        else this.series.clear();
    }
}

module.exports = { ChartDataService, chartDataService: new ChartDataService(), DEFAULT_CONFIG };
