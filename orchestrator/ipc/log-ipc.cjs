/**
 * ============================================================
 *  File: log-ipc.cjs
 *  Path: orchestrator/ipc/log-ipc.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      IPC Logger for Worker → Master logging.
 *
 *      وظایف:
 *      - ارسال لاگ‌های Worker به Master
 *      - پشتیبانی از سطح‌های info / warn / error
 * ============================================================
 */

class LogIPC {

    info(...msg) {
        process.send({ type: "log", level: "info", msg });
    }

    warn(...msg) {
        process.send({ type: "log", level: "warn", msg });
    }

    error(...msg) {
        process.send({ type: "log", level: "error", msg });
    }
}

module.exports = new LogIPC();
