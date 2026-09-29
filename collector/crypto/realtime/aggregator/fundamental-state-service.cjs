const FundamentalStateStore = require("../state/fundamental-state-store.cjs");
const FundamentalAggregator = require("./fundamental-aggregator.cjs");

class FundamentalStateService {
    constructor() {
        this.store = new FundamentalStateStore();
        this.aggregator = new FundamentalAggregator();
        this.aggregates = new Map();
    }

    ingest(input) {
        const event = this.store.ingest(input);
        if (!event) return null;
        const aggregate = this.aggregator.aggregate(event.symbol || "GLOBAL", this.store.values({ symbol: event.symbol || undefined }));
        const key = event.symbol || "GLOBAL";
        this.aggregates.set(key, aggregate);
        global.fundamentalAggregates = this.aggregates;
        return { event, aggregate };
    }

    get(symbol) {
        return this.aggregates.get(symbol) || this.aggregates.get("GLOBAL") || null;
    }

    snapshot() {
        return this.store.snapshot();
    }
}

module.exports = new FundamentalStateService();
