/**
 * ============================================================
 *  File: state-tree.cjs
 *  Path: orchestrator/core/state-tree.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 * ============================================================
 */

class StateTree {

    constructor() {
        this.tree = {};
    }

    ensureSymbol(symbol) {
        if (!this.tree[symbol]) {
            this.tree[symbol] = {
                collectors: {},
                processors: {},
                engines: {}
            };
        }
    }

    createNode() {
        return {
            status: "initialized",
            health: "unknown",
            lastUpdate: null,
            metrics: {},
            errors: []
        };
    }

    register(symbol, category, moduleName) {
        this.ensureSymbol(symbol);

        if (!this.tree[symbol][category]) {
            this.tree[symbol][category] = {};
        }

        this.tree[symbol][category][moduleName] = this.createNode();
    }

    get(symbol, category, moduleName) {
        try {
            return this.tree[symbol][category][moduleName];
        } catch {
            return null;
        }
    }

    updateStatus(symbol, category, moduleName, status) {
        const node = this.get(symbol, category, moduleName);
        if (node) {
            node.status = status;
            node.lastUpdate = Date.now();
        }
    }

    updateHealth(symbol, category, moduleName, health) {
        const node = this.get(symbol, category, moduleName);
        if (node) {
            node.health = health;
            node.lastUpdate = Date.now();
        }
    }

    updateMetrics(symbol, category, moduleName, metrics) {
        const node = this.get(symbol, category, moduleName);
        if (node) {
            node.metrics = { ...node.metrics, ...metrics };
            node.lastUpdate = Date.now();
        }
    }

    addError(symbol, category, moduleName, error) {
        const node = this.get(symbol, category, moduleName);
        if (node) {
            node.errors.push({ error, time: Date.now() });
        }
    }

    resetNode(symbol, category, moduleName) {
        const node = this.get(symbol, category, moduleName);
        if (node) {
            node.status = "reset";
            node.health = "unknown";
            node.metrics = {};
            node.errors = [];
            node.lastUpdate = Date.now();
        }
    }

    dump() {
        return JSON.parse(JSON.stringify(this.tree));
    }

    async init() {
        return true;
    }
}

module.exports = StateTree;
