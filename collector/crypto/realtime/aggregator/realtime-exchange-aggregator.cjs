const { normalizeOpenInterest } = require("../../common/open-interest-normalizer.cjs");

class RealtimeExchangeAggregator {
    constructor() {
        this.venues = new Map();
        this.tradeWindowMs = 60 * 1000;
    }

    ingest(packet) {
        const key = `${packet.exchange}:${packet.market}:${packet.symbol}`;
        const previous = this.venues.get(key) || {};
        const payload = packet.payload || {};
        const state = {
            ...previous,
            exchange: packet.exchange,
            market: packet.market,
            symbol: packet.symbol,
            updatedAt: packet.receiveTimestamp || Date.now(),
            source: packet.source,
            quality: {
                sequenceStatus: packet.sequenceStatus || previous.quality?.sequenceStatus || null,
                depthLevels: (payload.bids?.length || 0) + (payload.asks?.length || 0)
            }
        };

        if (Number.isFinite(payload.price)) {
            state.price = payload.price;
            state.priceTimestamp = packet.timestamp;
            state.priceSource = packet.source;
        }
        if (packet.eventType === "trade" && Number.isFinite(payload.price) && Number.isFinite(payload.qty)) {
            state.lastTrade = { price: payload.price, qty: payload.qty, side: payload.side, timestamp: packet.timestamp };
            const trades = [...(previous.trades || []), state.lastTrade];
            state.trades = trades.filter((trade) => trade.timestamp >= packet.timestamp - this.tradeWindowMs);
        }
        if (payload.bids?.length || payload.asks?.length) state.depth = { bids: payload.bids, asks: payload.asks, timestamp: packet.timestamp };
        if (packet.eventType === "candle") state.candle = { ...payload, timestamp: packet.timestamp };
        if (packet.eventType === "funding") state.funding = { rate: payload.rate, timestamp: packet.timestamp };
        if (packet.eventType === "mark_price") state.markPrice = { price: payload.price, timestamp: packet.timestamp };
        if (packet.eventType === "oi") state.oi = { ...normalizeOpenInterest({ exchange: packet.exchange, payload }), timestamp: packet.timestamp };
        if (packet.eventType === "liquidation") state.lastLiquidation = { ...payload, timestamp: packet.timestamp };

        this.venues.set(key, state);
        return state;
    }

    values({ market, symbol } = {}) {
        return [...this.venues.values()].filter((venue) => (!market || venue.market === market) && (!symbol || venue.symbol === symbol));
    }
}

module.exports = RealtimeExchangeAggregator;
