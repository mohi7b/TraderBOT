/**
 * ============================================================
 *  File: router-ipc.cjs
 *  Path: orchestrator/ipc/router-ipc.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      IPC Router for Worker → Master routing.
 *
 *      وظایف:
 *      - ارسال پیام‌های پردازش‌شده به Master
 *      - سازگار با MessageRouter جدید
 * ============================================================
 */

class RouterIPC {

    send(msg) {
        process.send({
            type: "router",
            payload: msg
        });
    }
}

module.exports = new RouterIPC();
