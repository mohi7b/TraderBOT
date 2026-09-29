/* ============================================================
 * File: collector/crypto/realtime/core/module-state.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Per-symbol state container for analysis modules and services.
 *
 *   Problem it solves:
 *     A large number of L2 modules keep their rolling state in
 *     module-scope variables (e.g. `let previous = null;`), which means
 *     running two symbols through the same module silently mixes their
 *     state. This container provides a namespaced, per-symbol store:
 *
 *         state.update("price-delta", symbol, (prev) => ..., () => seed)
 *
 *   Nothing is rewritten automatically: modules keep their legacy
 *   signature `({ symbol, data, emit })`. Refactored modules (and any
 *   new module) can opt in by reading `ctx.state` / `ctx.store`, which
 *   the pipeline always provides.
 *
 *   `ttlMs > 0` enables lazy expiry on read and sweeping.
 * ============================================================ */

class ModuleState {
    constructor({ ttlMs = 0, namespace = "default" } = {}) {
        this.ttlMs = Number(ttlMs) > 0 ? Number(ttlMs) : 0;
        this.defaultNamespace = namespace;
        this.blocks = new Map();  // "namespace::symbol" -> { value, updatedAt, namespace, symbol }
    }

    key(namespace, symbol) {
        return `${namespace || this.defaultNamespace}::${symbol || "unknown"}`;
    }

    /** Returns the stored value, creating it with `factory()` when absent. */
    get(namespace, symbol, factory = null) {
        const key = this.key(namespace, symbol);
        let block = this.blocks.get(key);

        if (block && this.isExpired(block)) {
            this.blocks.delete(key);
            block = null;
        }

        if (!block) {
            if (typeof factory !== "function") return null;
            block = {
                namespace: namespace || this.defaultNamespace,
                symbol: symbol || "unknown",
                value: factory(),
                updatedAt: Date.now()
            };
            this.blocks.set(key, block);
        }

        return block.value;
    }

    set(namespace, symbol, value) {
        const key = this.key(namespace, symbol);
        this.blocks.set(key, {
            namespace: namespace || this.defaultNamespace,
            symbol: symbol || "unknown",
            value,
            updatedAt: Date.now()
        });
        return value;
    }

    /** Read-modify-write helper with an optional seed factory. */
    update(namespace, symbol, updater, factory = null) {
        const current = this.get(namespace, symbol, factory);
        const next = updater(current);
        return this.set(namespace, symbol, next);
    }

    has(namespace, symbol) {
        return this.blocks.has(this.key(namespace, symbol));
    }

    delete(namespace, symbol) {
        return this.blocks.delete(this.key(namespace, symbol));
    }

    isExpired(block, now = Date.now()) {
        return this.ttlMs > 0 && now - block.updatedAt > this.ttlMs;
    }

    sweep(now = Date.now()) {
        let removed = 0;
        for (const [key, block] of this.blocks) {
            if (this.isExpired(block, now)) {
                this.blocks.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    /** Debug/inspection view; values are summarised to stay lightweight. */
    snapshot() {
        const result = {};
        for (const [key, block] of this.blocks) {
            result[key] = {
                namespace: block.namespace,
                symbol: block.symbol,
                updatedAt: block.updatedAt,
                type: Array.isArray(block.value) ? `array(${block.value.length})` : typeof block.value
            };
        }
        return result;
    }

    clear(namespace) {
        if (!namespace) {
            const size = this.blocks.size;
            this.blocks.clear();
            return size;
        }
        let removed = 0;
        for (const [key, block] of this.blocks) {
            if (block.namespace === namespace) {
                this.blocks.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    get size() {
        return this.blocks.size;
    }
}

module.exports = { ModuleState };
