class BinanceOrderBookSynchronizer {
    constructor({ snapshotUrl, onSnapshot, onUpdate, onStateChange, fetchImpl = fetch, maxBuffer = 2000 }) {
        this.snapshotUrl = snapshotUrl;
        this.onSnapshot = onSnapshot || (() => {});
        this.onUpdate = onUpdate || (() => {});
        this.onStateChange = onStateChange || (() => {});
        this.fetchImpl = fetchImpl;
        this.maxBuffer = maxBuffer;
        this.generation = 0;
        this.resetState();
    }

    resetState() {
        this.bids = new Map();
        this.asks = new Map();
        this.buffer = [];
        this.lastUpdateId = null;
        this.snapshotLastUpdateId = null;
        this.status = "syncing";
        this.loading = false;
        this.awaitingFirstDiff = true;
    }

    start() {
        this.generation += 1;
        const generation = this.generation;
        this.resetState();
        this.status = "syncing";
        this.onStateChange(this.status);
        return this.loadSnapshot(generation);
    }

    push(event) {
        if (!this.isValidEvent(event)) return false;

        if (this.status !== "healthy") {
            this.buffer.push(event);
            if (this.buffer.length > this.maxBuffer) this.buffer.shift();
            return false;
        }

        const isInitial = this.awaitingFirstDiff;
        if (isInitial) {
            if (event.u < this.snapshotLastUpdateId + 1) return false;
            if (event.U > this.snapshotLastUpdateId + 1) {
                this.status = "invalid";
                this.onStateChange(this.status, new Error("Initial orderbook diff does not overlap snapshot"));
                this.start();
                return false;
            }
        }

        const accepted = this.applyValidated(event, isInitial);
        if (!accepted) {
            this.status = "invalid";
            this.onStateChange(this.status, new Error("Orderbook sequence chain broken"));
            this.start();
        }
        return accepted;
    }

    async loadSnapshot(generation) {
        if (this.loading) return;
        this.loading = true;

        try {
            const response = await this.fetchImpl(this.snapshotUrl, {
                signal: AbortSignal.timeout(4000)
            });

            if (!response.ok) throw new Error(`Orderbook snapshot HTTP ${response.status}`);
            const snapshot = await response.json();
            if (generation !== this.generation) return;

            const lastUpdateId = Number(snapshot.lastUpdateId);
            if (!Number.isFinite(lastUpdateId)) throw new Error("Invalid orderbook snapshot sequence");

            this.bids = this.toMap(snapshot.bids);
            this.asks = this.toMap(snapshot.asks);
            this.lastUpdateId = lastUpdateId;
            this.snapshotLastUpdateId = lastUpdateId;
            this.awaitingFirstDiff = true;
            this.onSnapshot(this.snapshotPayload(snapshot));

            const buffered = this.buffer;
            this.buffer = [];
            const first = buffered.find(event =>
                event.U <= this.lastUpdateId + 1 && event.u >= this.lastUpdateId + 1
            );

            if (first) {
                const firstIndex = buffered.indexOf(first);
                const pending = buffered.slice(firstIndex);
                this.status = "syncing";
                for (const [index, event] of pending.entries()) {
                    if (!this.applyValidated(event, index === 0)) {
                        this.start();
                        return;
                    }
                }
            } else {
                this.status = "invalid";
                this.onStateChange(this.status, new Error("No buffered Binance diff overlaps snapshot"));
                await this.start();
                return;
            }

            if (generation === this.generation && !this.awaitingFirstDiff) {
                this.status = "healthy";
                this.onStateChange(this.status);
            }
        } catch (error) {
            if (generation === this.generation) {
                this.status = "invalid";
                this.onStateChange(this.status, error);
            }
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }

    applyValidated(event, isInitial = false) {
        if (this.lastUpdateId == null) return false;
        if (event.u <= this.lastUpdateId) return true;
        if (!isInitial && event.pu !== this.lastUpdateId) return false;

        this.applyLevels(this.bids, event.b);
        this.applyLevels(this.asks, event.a);
        this.lastUpdateId = event.u;
        this.awaitingFirstDiff = false;
        this.onUpdate({
            bids: this.toOrderedList(this.bids, "desc"),
            asks: this.toOrderedList(this.asks, "asc"),
            firstUpdateId: event.U,
            lastUpdateId: event.u,
            previousUpdateId: event.pu,
            eventTimestamp: event.E
        });
        return true;
    }

    applyLevels(target, levels) {
        for (const level of levels || []) {
            const price = Number(level[0]);
            const quantity = Number(level[1]);
            if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
            if (quantity === 0) target.delete(price);
            else if (quantity > 0) target.set(price, quantity);
        }
    }

    toMap(levels) {
        const target = new Map();
        this.applyLevels(target, levels);
        return target;
    }

    toOrderedList(book, direction) {
        return [...book.entries()]
            .sort((left, right) => direction === "desc" ? right[0] - left[0] : left[0] - right[0])
            .map(([price, qty]) => ({ price, qty }));
    }

    snapshotPayload(snapshot) {
        return {
            bids: this.toOrderedList(this.bids, "desc"),
            asks: this.toOrderedList(this.asks, "asc"),
            lastUpdateId: this.lastUpdateId,
            eventTimestamp: Number(snapshot.E) || Date.now()
        };
    }

    isValidEvent(event) {
        return event && Number.isFinite(Number(event.U)) &&
            Number.isFinite(Number(event.u)) && Number.isFinite(Number(event.pu));
    }

    getState() {
        return {
            status: this.status,
            lastUpdateId: this.lastUpdateId,
            snapshotLastUpdateId: this.snapshotLastUpdateId,
            bidCount: this.bids.size,
            askCount: this.asks.size
        };
    }
}

module.exports = BinanceOrderBookSynchronizer;
