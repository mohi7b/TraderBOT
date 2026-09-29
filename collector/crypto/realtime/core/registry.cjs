/* ============================================================
 * File: collector/crypto/realtime/core/registry.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Data-driven registry of L2 analysis modules.
 *
 *   Before the refactor the execution order and the activation
 *   conditions lived inside two big hand-written handlers
 *   (aanode/spot-handler.cjs, aanode/futures-handler.cjs) as:
 *
 *       if (data.price) { price(packet); priceDelta(packet); ... }
 *
 *   Now every module is declared once as a descriptor:
 *
 *       {
 *         id: "futures.price.delta",
 *         market: "futures",
 *         group: "price",
 *         priority: 102,                       // execution order
 *         when: ctx => !!ctx.data.price,       // was the `if (...)`
 *         healthEvent: null,                   // group marker (emit once)
 *         run: ctx => module(ctx)              // ctx = { symbol, data, emit, ... }
 *       }
 *
 *   `priority` ascending == legacy textual order. Ties keep registration
 *   order, which is why `order` is recorded here.
 * ============================================================ */

class ModuleRegistry {
    constructor() {
        this.entries = [];
        this.byId = new Map();
        this.order = 0;
    }

    register(descriptor) {
        if (!descriptor || typeof descriptor !== "object") {
            throw new TypeError("ModuleRegistry.register expects a descriptor object");
        }
        const { id, market, run } = descriptor;
        if (!id || typeof id !== "string") {
            throw new TypeError("ModuleRegistry descriptor requires a string `id`");
        }
        if (!market || typeof market !== "string") {
            throw new TypeError(`ModuleRegistry descriptor "${id}" requires a string \`market\``);
        }
        if (typeof run !== "function") {
            throw new TypeError(`ModuleRegistry descriptor "${id}" requires a run(ctx) function`);
        }
        if (this.byId.has(id)) {
            throw new Error(`ModuleRegistry duplicate module id "${id}"`);
        }
        if (descriptor.when !== undefined && descriptor.when !== null && typeof descriptor.when !== "function") {
            throw new TypeError(`ModuleRegistry descriptor "${id}" \`when\` must be a function`);
        }

        const entry = Object.freeze({
            id,
            market,
            group: descriptor.group || "default",
            priority: Number.isFinite(descriptor.priority) ? descriptor.priority : 0,
            when: descriptor.when || null,
            healthEvent: descriptor.healthEvent || null,
            description: descriptor.description || "",
            run,
            order: this.order++
        });

        this.entries.push(entry);
        this.byId.set(id, entry);
        return entry;
    }

    registerAll(descriptors) {
        for (const descriptor of descriptors || []) this.register(descriptor);
        return this;
    }

    get(id) {
        return this.byId.get(id) || null;
    }

    /** Ordered list for one market, including market-agnostic ("*") modules. */
    forMarket(market) {
        return this.entries
            .filter((entry) => entry.market === market || entry.market === "*")
            .sort((a, b) => (a.priority - b.priority) || (a.order - b.order));
    }

    markets() {
        return [...new Set(this.entries.map((entry) => entry.market))];
    }

    describe() {
        return this.entries
            .slice()
            .sort((a, b) => (a.priority - b.priority) || (a.order - b.order))
            .map((entry) => ({
                id: entry.id,
                market: entry.market,
                group: entry.group,
                priority: entry.priority,
                guarded: !!entry.when,
                healthEvent: entry.healthEvent ? describeHealthEvent(entry.healthEvent) : null
            }));
    }

    get size() {
        return this.entries.length;
    }
}

function describeHealthEvent(healthEvent) {
    if (typeof healthEvent === "string") return healthEvent;
    if (healthEvent && typeof healthEvent === "object") return healthEvent.event || "custom";
    if (typeof healthEvent === "function") return "function";
    return "unknown";
}

module.exports = { ModuleRegistry };
