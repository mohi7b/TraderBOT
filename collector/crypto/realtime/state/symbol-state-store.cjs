class SymbolStateStore {
    constructor() {
        this.states = new Map();
    }

    upsert(symbol, patch = {}) {
        const previous = this.states.get(symbol) || { symbol };
        const state = { ...previous, ...patch, symbol, updatedAt: patch.updatedAt || Date.now() };
        this.states.set(symbol, state);
        return state;
    }

    get(symbol) {
        return this.states.get(symbol) || null;
    }

    values() {
        return [...this.states.values()];
    }

    clear() {
        this.states.clear();
    }
}

module.exports = SymbolStateStore;
