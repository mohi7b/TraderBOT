/* ============================================================
 * File: state-tree.cjs
 * Path: orchestrator/core/state-tree.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Central state registry for all workers and all stages
 *   - Stores last output of each stage (fetch → execute)
 *   - Stores heartbeat, latency, errors, health status
 *   - Provides unified access for orchestrator + health-monitor
 *   - Supports reset per symbol or per stage
 *
 * Relations:
 *   - Used by: orchestrator, event-router, health-monitor, workers
 *   - Provides: update(), updateError(), updateHeartbeat(), get(), reset()
 * ============================================================ */

class StateTree {

    constructor() {
        this.state = {}; // { BTCUSDT: { fetch: {...}, normalize: {...}, ... } }
    }

    /* ============================================================
     * Initialize symbol state
     * ============================================================ */
    initSymbol(symbol) {
        this.state[symbol] = {
            fetch: null,
            normalize: null,
            aggregate: null,
            metrics: null,
            indicators: null,
            strategy: null,
            risk: null,
            execute: null,

            heartbeat: null,
            latency: null,
            error: null,
            health: "unknown"
        };
    }

    /* ============================================================
     * Update stage data
     * ============================================================ */
    update(symbol, stage, data) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol][stage] = data;
    }

    /* ============================================================
     * Update error
     * ============================================================ */
    updateError(symbol, error) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol].error = error;
    }

    /* ============================================================
     * Update heartbeat
     * ============================================================ */
    updateHeartbeat(symbol) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol].heartbeat = Date.now();
    }

    /* ============================================================
     * Update latency
     * ============================================================ */
    updateLatency(symbol, ms) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol].latency = ms;
    }

    /* ============================================================
     * Update health status
     * ============================================================ */
    updateHealth(symbol, status) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol].health = status;
    }

    /* ============================================================
     * Get full symbol state
     * ============================================================ */
    get(symbol) {
        return this.state[symbol] || null;
    }

    /* ============================================================
     * Get specific stage state
     * ============================================================ */
    getStage(symbol, stage) {
        return this.state[symbol]?.[stage] || null;
    }

    /* ============================================================
     * Reset full symbol state
     * ============================================================ */
    reset(symbol) {
        this.initSymbol(symbol);
    }

    /* ============================================================
     * Reset specific stage
     * ============================================================ */
    resetStage(symbol, stage) {
        if (!this.state[symbol]) this.initSymbol(symbol);
        this.state[symbol][stage] = null;
    }
}

module.exports = StateTree;
