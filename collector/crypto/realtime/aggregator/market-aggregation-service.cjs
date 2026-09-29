const { createCanonicalMarketPacket } = require("../../common/canonical-market-packet.cjs");
const RealtimeExchangeAggregator = require("./realtime-exchange-aggregator.cjs");
const RealtimeSymbolAggregator = require("./realtime-symbol-aggregator.cjs");
const marketIndicators = require("./market-indicator-service.cjs");
const { chartDataService } = require("./chart-data-service.cjs");
const VenueStateStore = require("../state/venue-state-store.cjs");
const SymbolStateStore = require("../state/symbol-state-store.cjs");

class MarketAggregationService {
    constructor() {
        this.exchange = new RealtimeExchangeAggregator();
        this.symbol = new RealtimeSymbolAggregator();
        this.venueState = new VenueStateStore();
        this.symbolState = new SymbolStateStore();
        this.aggregates = new Map();
    }

    ingest(input) {
        const packet = createCanonicalMarketPacket(input);
        const venue = this.exchange.ingest(packet);
        this.venueState.upsert({
            exchange: packet.exchange,
            market: packet.market,
            symbol: packet.symbol
        }, venue);
        const aggregate = this.symbol.aggregate(packet.symbol, this.exchange.values({ symbol: packet.symbol }));
        this.symbolState.upsert(packet.symbol, aggregate);
        this.aggregates.set(packet.symbol, aggregate);
        global.marketAggregates = this.aggregates;
        global.marketVenueState = this.venueState;
        global.marketSymbolState = this.symbolState;
        const indicators = marketIndicators.ingest(aggregate);
        const chart = chartDataService.ingest(aggregate, indicators);
        return { packet, aggregate, indicators, chart };
    }

    get(symbol) {
        return this.aggregates.get(symbol) || null;
    }
}

module.exports = new MarketAggregationService();
