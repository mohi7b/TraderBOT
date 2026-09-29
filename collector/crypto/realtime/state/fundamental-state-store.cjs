const { createFundamentalEvent } = require("../../common/fundamental-event.cjs");

class FundamentalStateStore {
    constructor({ maxEvents = 2000, clock = () => Date.now() } = {}) {
        this.maxEvents = maxEvents;
        this.clock = clock;
        this.events = [];
    }

    ingest(input) {
        const event = input.schemaVersion ? input : createFundamentalEvent(input);
        const duplicate = this.events.some((current) => current.id === event.id);
        if (duplicate) return null;
        this.events.push(event);
        if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
        return event;
    }

    active(now = this.clock()) {
        return this.events.filter((event) => !event.expiresAt || event.expiresAt >= now);
    }

    values({ type, horizon, symbol, region } = {}) {
        return this.active().filter((event) =>
            (!type || event.type === type) &&
            (!horizon || event.horizon === horizon) &&
            (!symbol || !event.symbol || event.symbol === symbol) &&
            (!region || event.region === region)
        );
    }

    snapshot() {
        return this.events.map((event) => ({ ...event }));
    }

    clear() {
        this.events = [];
    }
}

module.exports = FundamentalStateStore;
