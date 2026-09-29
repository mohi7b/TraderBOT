/* ============================================================
 * File: collector/crypto/realtime/service/connection-manager.cjs
 * Section: collector/crypto/realtime/service
 *
 * Role:
 *   Owns every started stream (websocket + REST poller) per symbol.
 *
 *   Legacy behaviour it replaces:
 *     collector/crypto/realtime/aanode/bootstrap.cjs started the same 10 spot /
 *     8 futures connections for a hard-coded symbol list at boot, kept
 *     them in module-local variables and never released them.
 *
 *   Now:
 *     streams are created on demand for a requested symbol, duplicates
 *     are reused, per-stream error counters are visible, and everything
 *     can be released (best-effort) when a symbol stops being watched.
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const createLogger = require("../core/logger.cjs").createLogger;
const { createAdapter } = require("../venue-adapters/index.cjs");

const ACTIVE_STATUSES = new Set(["starting", "running"]);

class ConnectionManager {
    constructor({ handlerFor, logger = createLogger("connections"), maxRecordedErrors = 20 } = {}) {
        if (typeof handlerFor !== "function") {
            throw new TypeError("ConnectionManager requires handlerFor(market) → handler");
        }
        this.handlerFor = handlerFor;
        this.logger = logger;
        this.maxRecordedErrors = Math.max(1, Number(maxRecordedErrors) || 20);
        this.entries = new Map();  // symbol -> { symbol, createdAt, streams: Map<id, record> }
    }

    getOrCreate(symbol) {
        let entry = this.entries.get(symbol);
        if (!entry) {
            entry = { symbol, createdAt: Date.now(), streams: new Map() };
            this.entries.set(symbol, entry);
        }
        return entry;
    }

    has(symbol) {
        return this.entries.has(symbol);
    }

    get symbols() {
        return [...this.entries.keys()];
    }

    /* ------------------------------------------------------------
     * Start
     * ---------------------------------------------------------- */
    async startSymbol(symbol, plan) {
        const entry = this.getOrCreate(symbol);
        const started = [];

        for (const item of plan) {
            const existing = entry.streams.get(item.id);
            if (existing && ACTIVE_STATUSES.has(existing.status)) {
                started.push(existing);
                continue;
            }

            const record = {
                id: item.id,
                exchange: item.exchange,
                market: item.market,
                kind: item.kind,
                intervalMs: item.intervalMs || null,
                status: "starting",
                startedAt: Date.now(),
                readyAt: null,
                stoppedAt: null,
                errorCount: 0,
                lastError: null,
                lastErrorAt: null,
                errors: [],
                closable: null,
                closeMethod: null,
                handle: null
            };
            entry.streams.set(item.id, record);

            try {
                const handle = await createAdapter(item).start({
                    symbol,
                    handler: this.handlerFor(item.market),
                    onCritical: (err) => this.recordCritical(entry, record, err)
                });

                record.handle = handle;
                record.closable = !!handle.closable;
                record.closeMethod = handle.closeMethod;
                record.status = "running";
                record.readyAt = Date.now();
                this.logger.debug(`stream ready ${item.id} (${symbol})`);

            } catch (err) {
                record.status = "error";
                this.recordCritical(entry, record, err);
                this.logger.error(`stream failed ${item.id} (${symbol}) → ${err.message}`);
            }

            started.push(record);
        }

        return started;
    }

    /**
     * Legacy L1 adapters printed every 400/429 straight to the console.
     * Errors are counted and exposed through the status API instead;
     * verbose logging stays behind CONFIG.debugVerbose.
     */
    recordCritical(entry, record, err) {
        const message = (err && (err.message || err.code)) || String(err);
        record.errorCount += 1;
        record.lastError = message;
        record.lastErrorAt = Date.now();
        record.errors.push({ at: record.lastErrorAt, message });
        while (record.errors.length > this.maxRecordedErrors) record.errors.shift();

        if (CONFIG.debugVerbose) {
            this.logger.warn(`stream error ${record.id} (${entry.symbol}) → ${message}`);
        }
    }

    /* ------------------------------------------------------------
     * Inspect
     * ---------------------------------------------------------- */
    serializeRecord(record) {
        return {
            id: record.id,
            exchange: record.exchange,
            market: record.market,
            kind: record.kind,
            intervalMs: record.intervalMs,
            status: record.status,
            startedAt: record.startedAt,
            readyAt: record.readyAt,
            stoppedAt: record.stoppedAt,
            uptimeMs: record.status === "running" ? Date.now() - (record.readyAt || record.startedAt) : 0,
            errorCount: record.errorCount,
            lastError: record.lastError,
            lastErrorAt: record.lastErrorAt,
            closable: record.closable,
            closeMethod: record.closeMethod
        };
    }

    statusForSymbol(symbol) {
        const entry = this.entries.get(symbol);
        if (!entry) return [];
        return [...entry.streams.values()].map((record) => this.serializeRecord(record));
    }

    summary() {
        let running = 0;
        let failed = 0;
        for (const entry of this.entries.values()) {
            for (const record of entry.streams.values()) {
                if (record.status === "running") running += 1;
                if (record.status === "error") failed += 1;
            }
        }
        return { symbols: this.entries.size, streams: running + failed, running, failed };
    }

    /* ------------------------------------------------------------
     * Release
     * ---------------------------------------------------------- */
    release(symbol, reason = "release") {
        const entry = this.entries.get(symbol);
        if (!entry) return 0;

        let stopped = 0;
        for (const record of entry.streams.values()) {
            if (record.handle && typeof record.handle.stop === "function") {
                record.handle.stop(reason);
                stopped += 1;
            }
            record.status = "stopped";
            record.stoppedAt = Date.now();
            record.handle = null;
        }

        entry.streams.clear();
        this.entries.delete(symbol);
        this.logger.debug(`released ${symbol} (${reason}) — ${stopped} stream(s) asked to stop`);
        return stopped;
    }

    releaseAll(reason = "shutdown") {
        const symbols = this.symbols;
        for (const symbol of symbols) this.release(symbol, reason);
        return symbols.length;
    }
}

module.exports = { ConnectionManager, ACTIVE_STATUSES };
