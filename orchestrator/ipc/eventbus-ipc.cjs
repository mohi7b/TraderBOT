/**
 * ============================================================
 *  File: eventbus-ipc.cjs
 *  Path: orchestrator/ipc/eventbus-ipc.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      IPC EventBus for Worker → Master communication.
 *
 *      وظایف:
 *      - ارسال رویدادهای Collector / Processor / Engine به Master
 *      - ساختار پیام استاندارد و قابل‌ردیابی
 *      - سازگار با MessageRouter جدید
 * ============================================================
 */

class EventBusIPC {

    publish(pipe, data) {
        process.send({
            type: "eventbus",
            pipe,
            data
        });
    }
}

module.exports = new EventBusIPC();
