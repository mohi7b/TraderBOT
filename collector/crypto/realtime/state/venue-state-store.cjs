class VenueStateStore {
    constructor() {
        this.states = new Map();
    }

    key({ exchange, market, symbol }) {
        return `${exchange}:${market}:${symbol}`;
    }

    upsert(identity, patch = {}) {
        const key = this.key(identity);
        const previous = this.states.get(key) || { ...identity };
        const state = { ...previous, ...patch, ...identity, updatedAt: patch.updatedAt || Date.now() };
        this.states.set(key, state);
        return state;
    }

    get(identity) {
        return this.states.get(this.key(identity)) || null;
    }

    values({ exchange, market, symbol } = {}) {
        return [...this.states.values()].filter((state) =>
            (!exchange || state.exchange === exchange) &&
            (!market || state.market === market) &&
            (!symbol || state.symbol === symbol)
        );
    }

    clear() {
        this.states.clear();
    }
}

module.exports = VenueStateStore;
