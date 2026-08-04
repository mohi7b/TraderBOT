/**
 * ============================================================
 *  File: worker-context.cjs
 *  Path: orchestrator/cluster/worker-context.cjs
 *  Version: 3.0.0 (ENTERPRISE — COMPATIBLE)
 *  Description:
 *      Provides full IPC-safe context for Workers:
 *      - router
 *      - state
 *      - logger
 *      - eventbus
 *      - config
 *      - worker metadata
 * ============================================================
 */


class WorkerContext {

    constructor(exchange, symbol) {
        this.exchange = exchange;
        this.symbol = symbol;

        this.startTime = Date.now();

        // حالت دیباگ
        this.debug = false;
    }

    info(msg) {
        if (this.debug) {
            console.log(`🟦 [${this.exchange}.${this.symbol}] ${msg}`);
        }
    }

    error(msg) {
        console.error(`🟥 [${this.exchange}.${this.symbol}] ${msg}`);
    }
}

module.exports = WorkerContext;
