function median(values) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedian(entries) {
    const usable = entries.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0).sort((left, right) => left.value - right.value);
    if (!usable.length) return null;
    const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
    let accumulated = 0;
    for (const entry of usable) {
        accumulated += entry.weight;
        if (accumulated >= totalWeight / 2) return entry.value;
    }
    return usable[usable.length - 1].value;
}

const DEPTH_BUCKETS_BPS = [5, 10, 25, 50];

function tradeMetrics(trades, now, windowMs) {
    const active = trades.filter((trade) => trade.timestamp >= now - windowMs);
    const buyVolume = active.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.qty, 0);
    const sellVolume = active.filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + trade.qty, 0);
    const totalVolume = buyVolume + sellVolume;
    const vwap = active.reduce((sum, trade) => sum + trade.price * trade.qty, 0) / totalVolume;
    return {
        buyVolume,
        sellVolume,
        deltaVolume: buyVolume - sellVolume,
        imbalance: totalVolume ? (buyVolume - sellVolume) / totalVolume : 0,
        vwap: Number.isFinite(vwap) ? vwap : null,
        tradeCount: active.length
    };
}

function aggregateCandle(trades, now, windowMs = 60000) {
    const active = trades.filter((trade) => trade.timestamp >= now - windowMs).sort((left, right) => left.timestamp - right.timestamp);
    if (!active.length) return null;

    return {
        interval: "1m",
        openTime: Math.floor(now / windowMs) * windowMs,
        open: active[0].price,
        high: Math.max(...active.map((trade) => trade.price)),
        low: Math.min(...active.map((trade) => trade.price)),
        close: active[active.length - 1].price,
        volume: active.reduce((sum, trade) => sum + trade.qty, 0),
        tradeCount: active.length
    };
}

function bucketDepth(bids, asks, midPrice) {
    const buckets = Object.fromEntries(DEPTH_BUCKETS_BPS.map((bucket) => [bucket, { bidLiquidity: 0, askLiquidity: 0, imbalance: 0 }]));
    if (!Number.isFinite(midPrice) || midPrice <= 0) return buckets;

    for (const [price, qty] of bids) {
        const distanceBps = (midPrice - price) / midPrice * 10000;
        for (const bucket of DEPTH_BUCKETS_BPS) if (distanceBps >= 0 && distanceBps <= bucket) buckets[bucket].bidLiquidity += qty;
    }
    for (const [price, qty] of asks) {
        const distanceBps = (price - midPrice) / midPrice * 10000;
        for (const bucket of DEPTH_BUCKETS_BPS) if (distanceBps >= 0 && distanceBps <= bucket) buckets[bucket].askLiquidity += qty;
    }
    for (const bucket of DEPTH_BUCKETS_BPS) {
        const value = buckets[bucket];
        const total = value.bidLiquidity + value.askLiquidity;
        value.imbalance = total ? (value.bidLiquidity - value.askLiquidity) / total : 0;
    }
    return buckets;
}

class RealtimeSymbolAggregator {
    aggregate(symbol, venues) {
        const now = Date.now();
        const buildMarket = (market) => {
            const marketVenues = venues.filter((venue) => venue.market === market);
            const healthyVenues = marketVenues.filter((venue) => venue.quality?.sequenceStatus !== "invalid" && now - venue.updatedAt <= 30000);
            const prices = healthyVenues.map((venue) => venue.price);
            const weightedPrices = healthyVenues.map((venue) => ({ value: venue.price, weight: venue.priceSource === "rest" ? 0.5 : 1 }));
            const markPrices = healthyVenues.map((venue) => venue.markPrice?.price);
            const fundingRates = healthyVenues.map((venue) => venue.funding?.rate);
            const oiUsdValues = healthyVenues.map((venue) => venue.oi?.oiUsd).filter(Number.isFinite);
            const bids = healthyVenues.flatMap((venue) => venue.depth?.bids || []);
            const asks = healthyVenues.flatMap((venue) => venue.depth?.asks || []);
            const trades = healthyVenues.flatMap((venue) => venue.trades || []);
            const bestBid = bids.length ? Math.max(...bids.map(([price]) => price)) : null;
            const bestAsk = asks.length ? Math.min(...asks.map(([price]) => price)) : null;
            const midPrice = Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? (bestBid + bestAsk) / 2 : median(prices);

            return {
                venues: Object.fromEntries(marketVenues.map((venue) => [venue.exchange, venue])),
                aggregate: {
                    price: { median: median(prices), weightedMedian: weightedMedian(weightedPrices) },
                    markPrice: { median: median(markPrices) },
                    funding: { averageRate: fundingRates.filter(Number.isFinite).reduce((sum, rate, _, values) => sum + rate / values.length, 0) || null },
                    oi: {
                        totalUsd: oiUsdValues.length ? oiUsdValues.reduce((sum, value) => sum + value, 0) : null,
                        normalizedVenues: oiUsdValues.length,
                        rawByVenue: Object.fromEntries(marketVenues.filter((venue) => venue.oi).map((venue) => [venue.exchange, venue.oi]))
                    },
                    depth: {
                        bestBid,
                        bestAsk,
                        bidLiquidity: bids.reduce((sum, [, qty]) => sum + qty, 0),
                        askLiquidity: asks.reduce((sum, [, qty]) => sum + qty, 0),
                        bucketsBps: bucketDepth(bids, asks, midPrice)
                    },
                    trades: {
                        "1s": tradeMetrics(trades, now, 1000),
                        "5s": tradeMetrics(trades, now, 5000),
                        "1m": tradeMetrics(trades, now, 60000)
                    },
                    candle: { "1m": aggregateCandle(trades, now) },
                    venuesHealthy: healthyVenues.length,
                    venuesExcluded: marketVenues.length - healthyVenues.length
                }
            };
        };

        const spot = buildMarket("spot");
        const futures = buildMarket("futures");
        const spotPrice = spot.aggregate.price.median;
        const futuresPrice = futures.aggregate.price.median;
        const basis = Number.isFinite(spotPrice) && Number.isFinite(futuresPrice) ? futuresPrice - spotPrice : null;

        return {
            symbol,
            updatedAt: Date.now(),
            spot,
            futures,
            crossMarket: {
                basis,
                basisBps: basis !== null && spotPrice ? basis / spotPrice * 10000 : null
            }
        };
    }
}

module.exports = RealtimeSymbolAggregator;
