/* ============================================================
 * File: collector/crypto/derivatives/streams/liquidation-stream.cjs
 * Section: collector/crypto/derivatives/streams
 * Version: 1.0.0
 *
 * Role:
 *   Generic websocket client for the venue liquidation feeds.
 *
 *   The venue adapter owns "what to send on connect" (subscribe) and
 *   "how to read one message" (parse/filter); this class owns the
 *   transport only: connect → subscribe → parse → emit, plus reconnect
 *   with exponential backoff, a hard attempt cap and full failure
 *   isolation (a dead feed can never throw into the collector loop).
 *
 *   Same dependency-injection discipline as core/poller.cjs: the
 *   WebSocket implementation and the clock can be replaced, so the tests
 *   exercise reconnection without a socket.
 * ============================================================ */

class LiquidationStream {
    constructor({
        exchange,
        symbol,
        adapter,
        emit,
        onCritical = null,
        WebSocketImpl = null,
        reconnectMs = 5000,
        maxReconnectMs = 60000,
        maxReconnects = 8,
        timer = setTimeout,
        clear = clearTimeout,
        now = Date.now
    }) {
        this.exchange = exchange;
        this.symbol = symbol;
        this.adapter = adapter;
        this.emit = emit;
        this.onCritical = onCritical || (() => {});
        this.WebSocketImpl = WebSocketImpl;
        this.reconnectMs = Math.max(250, Number(reconnectMs) || 5000);
        this.maxReconnectMs = Math.max(this.reconnectMs, Number(maxReconnectMs) || 60000);
        this.maxReconnects = Math.max(0, Number(maxReconnects) || 0);
        this.timer = timer;
        this.clear = clear;
        this.now = now;

        this.socket = null;
        this.running = false;
        this.reconnects = 0;
        this.handle = null;
        this.venueSymbol = adapter.symbolFor(symbol);
        this.stats = { connects: 0, messages: 0, emitted: 0, errors: 0, lastMessageAt: null, lastError: null, dropped: false };
    }

    resolveWebSocket() {
        if (this.WebSocketImpl) return this.WebSocketImpl;
        try {
            /* eslint-disable-next-line global-require */
            return require("ws");
        } catch (err) {
            throw new Error(`ws is not installed: ${err.message}`);
        }
    }

    start() {
        if (this.running) return this;
        this.running = true;
        this.connect();
        return this;
    }

    stop() {
        this.running = false;
        if (this.handle) this.clear(this.handle);
        this.handle = null;
        if (this.socket) {
            try {
                if (this.socket.removeAllListeners) this.socket.removeAllListeners();
                this.socket.close();
            } catch (err) {
                /* closing a broken socket must never throw */
            }
            this.socket = null;
        }
        return this;
    }

    connect() {
        if (!this.running) return;

        let WebSocketClass;
        try {
            WebSocketClass = this.resolveWebSocket();
        } catch (err) {
            this.fail(err);
            return;
        }

        const url = this.adapter.liquidation.url;
        try {
            this.socket = new WebSocketClass(url);
        } catch (err) {
            this.fail(err);
            return;
        }

        this.stats.connects += 1;
        attach(this.socket, "open", () => this.onOpen());
        attach(this.socket, "message", (raw) => this.onMessage(raw));
        attach(this.socket, "error", (err) => this.fail(err));
        attach(this.socket, "close", () => this.onClose());
    }

    onOpen() {
        this.reconnects = 0;
        this.stats.lastError = null;
        const subscribe = this.adapter.liquidation.subscribe;
        if (typeof subscribe !== "function") return;

        const message = subscribe(this.symbol);
        if (!message) return;

        try {
            this.socket.send(JSON.stringify(message));
        } catch (err) {
            this.fail(err);
        }
    }

    onMessage(raw) {
        this.stats.messages += 1;
        this.stats.lastMessageAt = this.now();

        let parsed = null;
        try {
            parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch (err) {
            this.stats.errors += 1;
            return;
        }

        const ctx = { exchange: this.exchange, symbol: this.symbol, venueSymbol: this.venueSymbol };
        const { filter, parse } = this.adapter.liquidation;

        try {
            /* Ping/pong and subscription acknowledgements are not data. */
            if (typeof filter === "function" && !filter(parsed, ctx)) return;
            const rows = parse(parsed, ctx);
            const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
            for (const row of list) {
                if (!row) continue;
                this.emit(row, parsed);
                this.stats.emitted += 1;
            }
        } catch (err) {
            this.stats.errors += 1;
            this.stats.lastError = err.message;
        }
    }

    onClose() {
        this.socket = null;
        if (!this.running) return;
        this.scheduleReconnect("closed");
    }

    fail(err) {
        this.stats.errors += 1;
        this.stats.lastError = err && err.message ? err.message : String(err);
        this.onCritical({
            type: "LIQUIDATION_STREAM_ERROR",
            exchange: this.exchange,
            symbol: this.symbol,
            message: this.stats.lastError,
            timestamp: this.now()
        });
    }

    scheduleReconnect(reason) {
        if (this.reconnects >= this.maxReconnects) {
            this.stats.dropped = true;
            this.running = false;
            this.onCritical({
                type: "LIQUIDATION_STREAM_DROPPED",
                exchange: this.exchange,
                symbol: this.symbol,
                attempts: this.reconnects,
                reason,
                timestamp: this.now()
            });
            return;
        }

        this.reconnects += 1;
        const delay = Math.min(this.maxReconnectMs, this.reconnectMs * 2 ** (this.reconnects - 1));
        this.handle = this.timer(() => this.connect(), delay);
    }

    snapshot() {
        return {
            exchange: this.exchange,
            symbol: this.symbol,
            venueSymbol: this.venueSymbol,
            running: this.running,
            reconnects: this.reconnects,
            ...this.stats
        };
    }
}

function attach(socket, event, handler) {
    if (socket && typeof socket.on === "function") socket.on(event, handler);
}

module.exports = { LiquidationStream };
