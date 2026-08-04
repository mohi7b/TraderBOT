/**
 * ============================================================
 *  File: state-ipc.cjs
 *  Path: orchestrator/ipc/state-ipc.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      IPC State Sync for Worker → Master state updates.
 *
 *      وظایف:
 *      - ارسال metrics و errorهای Collector / Processor / Engine
 *      - سازگار با StateTree جدید (symbol / collectors / processors / engines)
 * ============================================================
 */

class StateIPC {

    updateMetrics(symbol, category, moduleName, metrics) {
        process.send({
            type: "state",
            symbol,
            category,
            moduleName,
            metrics
        });
    }

    addError(symbol, category, moduleName, error) {
        process.send({
            type: "state_error",
            symbol,
            category,
            moduleName,
            error: error.message || error
        });
    }
}

module.exports = new StateIPC();
