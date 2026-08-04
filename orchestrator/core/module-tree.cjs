/**
 * ============================================================
 *  File: module-tree.cjs
 *  Path: orchestrator/core/module-tree.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Module registry for TraderBOT Orchestrator.
 *      - Registers collectors, processors, engines per symbol
 * ============================================================
 */

class ModuleTree {

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

    registerCollector(symbol, name, instance) {
        this.ensureSymbol(symbol);
        this.tree[symbol].collectors[name] = {
            instance,
            status: "initialized",
            lastUpdate: null,
            errors: []
        };
    }

    registerProcessor(symbol, name, instance) {
        this.ensureSymbol(symbol);
        this.tree[symbol].processors[name] = {
            instance,
            status: "initialized",
            lastUpdate: null,
            errors: []
        };
    }

    registerEngine(symbol, name, instance) {
        this.ensureSymbol(symbol);
        this.tree[symbol].engines[name] = {
            instance,
            status: "initialized",
            lastUpdate: null,
            errors: []
        };
    }

    get(symbol, category, name) {
        try {
            return this.tree[symbol][category][name];
        } catch {
            return null;
        }
    }

    updateStatus(symbol, category, name, status) {
        const mod = this.get(symbol, category, name);
        if (mod) {
            mod.status = status;
            mod.lastUpdate = Date.now();
        }
    }

    addError(symbol, category, name, error) {
        const mod = this.get(symbol, category, name);
        if (mod) {
            mod.errors.push({ error, time: Date.now() });
        }
    }

    dump() {
        return JSON.parse(JSON.stringify(this.tree));
    }

    async init() {
        return true;
    }
}

module.exports = ModuleTree;
