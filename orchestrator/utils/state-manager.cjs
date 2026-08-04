/**
 * ============================================================
 *  File: state-manager.cjs
 *  Path: orchestrator/utils/state-manager.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      State Manager for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - Health Monitoring برای Collector / Processor / Engine
 *      - Crash Detection + BackoffEngine Trigger
 *      - Heartbeat System
 *
 *      نکته:
 *      - ساختار جدید فقط از symbol / collectors / processors / engines استفاده می‌کند.
 * ============================================================
 */

class StateManager {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules = orchestrator.modules;
        this.state   = orchestrator.state;
        this.backoff = orchestrator.backoff;
        this.log     = orchestrator.log;

        this.heartbeatInterval = 3000;
        this.stallThreshold    = 5000;
    }

    async init() {
        this.log.info("StateManager initialized.");
        this.startHeartbeat();
    }

    startHeartbeat() {
        setInterval(() => this.checkAllModules(), this.heartbeatInterval);
    }

    /**
     * ============================================================
     *  Check all modules
     * ============================================================
     */
    checkAllModules() {

        const symbols = Object.keys(this.modules.tree);

        for (const symbol of symbols) {

            const categories = Object.keys(this.modules.tree[symbol]);

            for (const cat of categories) {

                const mods = Object.keys(this.modules.tree[symbol][cat]);

                for (const mod of mods) {
                    this.checkModule(symbol, cat, mod);
                }
            }
        }
    }

    /**
     * ============================================================
     *  Check a single module
     * ============================================================
     */
    checkModule(symbol, category, moduleName) {

        const node = this.state.get(symbol, category, moduleName);
        if (!node) return;

        const key = `${symbol}.${category}.${moduleName}`;
        const now = Date.now();

        // Stalled
        if (node.lastUpdate && now - node.lastUpdate > this.stallThreshold) {
            this.state.updateHealth(symbol, category, moduleName, "stalled");
            this.log.warn(`Module stalled → ${key}`);
        }

        // Crashed
        if (node.errors.length > 0) {
            this.state.updateHealth(symbol, category, moduleName, "crashed");
            this.log.error(`Module crashed → ${key}`);

            const lastError = node.errors[node.errors.length - 1];
            this.backoff.crash(symbol, category, moduleName, lastError.error);
        }

        // Killed
        if (node.status === "killed") {
            this.state.updateHealth(symbol, category, moduleName, "offline");
        }

        // Healthy
        if (node.status === "active") {
            this.state.updateHealth(symbol, category, moduleName, "online");
        }
    }

    /**
     * ============================================================
     *  System health summary
     * ============================================================
     */
    summary() {

        const result = {
            active: 0,
            stalled: 0,
            crashed: 0,
            killed: 0,
            offline: 0
        };

        const symbols = Object.keys(this.state.tree);

        for (const symbol of symbols) {

            const categories = Object.keys(this.state.tree[symbol]);

            for (const cat of categories) {

                const mods = Object.keys(this.state.tree[symbol][cat]);

                for (const mod of mods) {

                    const node = this.state.tree[symbol][cat][mod];

                    switch (node.health) {
                        case "online":  result.active++;  break;
                        case "stalled": result.stalled++; break;
                        case "crashed": result.crashed++; break;
                        case "offline": result.offline++; break;
                    }

                    if (node.status === "killed") {
                        result.killed++;
                    }
                }
            }
        }

        return result;
    }

    dump() {
        return {
            state: this.state.dump(),
            summary: this.summary()
        };
    }
}

module.exports = StateManager;
