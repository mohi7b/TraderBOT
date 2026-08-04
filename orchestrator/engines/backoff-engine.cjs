/**
 * ============================================================
 *  File: backoff-engine.cjs
 *  Path: orchestrator/engines/backoff-engine.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 * ============================================================
 */

class BackoffEngine {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.state = orchestrator.state;
        this.log = orchestrator.log;

        this.backoffMap = {};
    }

    createNode() {
        return {
            retries: 0,
            nextDelay: 1000,
            maxDelay: 60000,
            factor: 2,
            jitter: true,
            crashThreshold: 5,
            lastError: null,
            lastAttempt: null
        };
    }

    ensureNode(symbol, category, moduleName) {
        const key = `${symbol}.${category}.${moduleName}`;

        if (!this.backoffMap[key]) {
            this.backoffMap[key] = this.createNode();
        }

        return this.backoffMap[key];
    }

    async crash(symbol, category, moduleName, error) {

        const key = `${symbol}.${category}.${moduleName}`;
        const node = this.ensureNode(symbol, category, moduleName);

        node.retries++;
        node.lastError = error;
        node.lastAttempt = Date.now();

        this.state.addError(symbol, category, moduleName, error);
        this.state.updateStatus(symbol, category, moduleName, "crashed");

        this.log.warn(`Backoff triggered: ${key} (retry #${node.retries})`);

        if (node.retries >= node.crashThreshold) {
            this.log.error(`Crash threshold reached for ${key}. Module disabled.`);
            return;
        }

        let delay = node.nextDelay * node.factor;

        if (node.jitter) {
            delay += Math.floor(Math.random() * 500);
        }

        if (delay > node.maxDelay) {
            delay = node.maxDelay;
        }

        node.nextDelay = delay;

        this.log.warn(`Backoff delay for ${key}: ${delay}ms`);

        setTimeout(() => {
            this.log.info(`Restarting module after backoff: ${key}`);
            this.state.resetNode(symbol, category, moduleName);
            node.retries = 0;
            node.nextDelay = 1000;
        }, delay);
    }

    dump() {
        return JSON.parse(JSON.stringify(this.backoffMap));
    }

    async init() {
        this.log.info("BackoffEngine initialized.");
    }
}

module.exports = BackoffEngine;
