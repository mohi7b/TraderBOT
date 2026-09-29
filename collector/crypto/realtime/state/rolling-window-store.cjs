class RollingWindowStore {
    constructor({ maxAgeMs = 60000, clock = () => Date.now() } = {}) {
        this.maxAgeMs = maxAgeMs;
        this.clock = clock;
        this.values = [];
    }

    push(value, timestamp = this.clock()) {
        this.values.push({ value, timestamp });
        this.prune(timestamp);
        return value;
    }

    prune(now = this.clock()) {
        const cutoff = now - this.maxAgeMs;
        this.values = this.values.filter((entry) => entry.timestamp >= cutoff);
    }

    between(windowMs, now = this.clock()) {
        this.prune(now);
        const cutoff = now - windowMs;
        return this.values.filter((entry) => entry.timestamp >= cutoff).map((entry) => entry.value);
    }

    snapshot(now = this.clock()) {
        this.prune(now);
        return this.values.map((entry) => ({ ...entry }));
    }

    clear() {
        this.values = [];
    }
}

module.exports = RollingWindowStore;
