/**
 * ============================================================
 *  File: event-router.cjs
 *  Path: orchestrator/core/event-router.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Lightweight event router for TraderBOT Orchestrator.
 *      - Collector → Processor → Engine → Dashboard
 *      - Supports filters, throttles, debounces
 * ============================================================
 */

/**
 * ============================================================
 *  File: event-router.cjs
 *  Path: orchestrator/core/event-router.cjs
 *  Version: 5.1.0 (UPDATED WITH DEPTH ROUTING)
 * ============================================================
 */

class EventRouter {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.routes = {};
        this.filters = {};
        this.throttles = {};
        this.debounces = {};

        // 🔥 اضافه‌شده: مسیر خروجی Depth
        this.register("depth.output", (event) => {
            this.routeDepthToProcessors(event);
        });
    }

    register(key, handler) {
        this.routes[key] = handler;
    }

    setFilter(key, fn) {
        this.filters[key] = fn;
    }

    setThrottle(key, ms) {
        this.throttles[key] = { ms, last: 0 };
    }

    setDebounce(key, ms) {
        this.debounces[key] = { ms, timer: null };
    }

    route(key, event) {

        const handler = this.routes[key];
        if (!handler) return;

        if (this.filters[key] && !this.filters[key](event)) return;

        if (this.throttles[key]) {
            const now = Date.now();
            const t = this.throttles[key];
            if (now - t.last < t.ms) return;
            t.last = now;
        }

        if (this.debounces[key]) {
            const d = this.debounces[key];
            clearTimeout(d.timer);
            d.timer = setTimeout(() => handler(event), d.ms);
            return;
        }

        handler(event);
    }

    /**
     * ============================================================
     *  🔥 اتصال خروجی Depth به Processorها
     * ============================================================
     */
    routeDepthToProcessors(event) {
        const { symbol } = event;

        const processors = this.orchestrator.moduleManager.getProcessors(symbol);
        if (!processors || processors.length === 0) return;

        for (const processor of processors) {
            if (typeof processor.handleDepth === "function") {
                try {
                    processor.handleDepth(event);
                } catch (err) {
                    this.orchestrator.log.error(
                        `Processor depth error → ${symbol}.${processor.name}`,
                        err
                    );
                }
            }
        }
    }

    dump() {
        return {
            routes: this.routes,
            filters: this.filters,
            throttles: this.throttles,
            debounces: this.debounces
        };
    }

    async init() {
        return true;
    }
}

module.exports = EventRouter;
