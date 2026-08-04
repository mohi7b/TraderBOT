/**
 * ============================================================
 *  File: eventbus-ipc.cjs
 *  Path: shared/eventbus-ipc.cjs
 *  Version: 3.0.0
 *  Description:
 *      Enterprise EventBus for TraderBOT Distributed Engine.
 *      - انتقال داده بین ماژول‌ها (Single-Process Mode)
 *      - انتقال داده بین Worker ↔ Master (Cluster IPC Mode)
 *      - مدیریت لاگ‌ها طبق mode: run | debug | debug+
 *      - سبک، Fail-Safe، Hot Reload Compatible
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-15
 *  Last Updated: 2025-02-15
 *
 *  Notes:
 *      - این فایل جایگزین کامل EventBus قبلی است.
 *      - API قبلی حفظ شده: on() و emit()
 *      - در حالت Cluster، emit → IPC و on → IPC Listener
 *      - در حالت Single، رفتار دقیقاً مثل EventBus قبلی است.
 * ============================================================
 */

const cluster = require("cluster");
const config = require("../orchestrator/config.cjs");

class EventBusIPC {
    constructor() {
        this.listeners = {};
        this.isCluster = config.cluster.enabled;
    }

    /* ============================================================
     *  REGISTER LISTENER
     * ============================================================ */
    on(event, fn) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(fn);

        // در حالت کلاستر، پیام‌های Master → Worker را گوش می‌دهیم
        if (this.isCluster && !cluster.isPrimary) {
            process.on("message", msg => {
                if (!msg || !msg.event) return;
                if (msg.event === event) {
                    try {
                        fn(msg.data);
                    } catch (err) {
                        console.log("❌ EventBus IPC Handler Error:", err);
                    }
                }
            });
        }
    }

    /* ============================================================
     *  EMIT EVENT
     * ============================================================ */
    emit(event, data = {}) {
        const mode = config.system.mode;

        /* ---------------- LOG ROUTING ---------------- */
        if (mode === "debug+") {
            console.log(`[${event}]`, data);
        }
        else if (mode === "debug") {
            console.log(`[${event}]`);
        }
        else if (mode === "run") {
            if (event.includes("error") || event.includes("critical") || event.includes("ws")) {
                console.log(`[${event}]`, data);
            }
        }

        /* ---------------- SINGLE-PROCESS MODE ---------------- */
        if (!this.isCluster) {
            if (!this.listeners[event]) return;
            for (const fn of this.listeners[event]) {
                try {
                    fn(data);
                } catch (err) {
                    console.log("❌ EventBus Error:", err);
                }
            }
            return;
        }

        /* ---------------- CLUSTER MODE (IPC) ---------------- */
        try {
            // Worker → Master
            if (!cluster.isPrimary) {
                process.send({ event, data });
                return;
            }

            // Master → Worker (handled by MessageRouter)
            // Master خودش emit نمی‌کند، فقط پیام‌ها را route می‌کند
        } catch (err) {
            console.log("❌ EventBus IPC Emit Error:", err);
        }
    }

    /* ============================================================
     *  DEBUG: LISTEN TO ALL EVENTS
     * ============================================================ */
    onAny(fn) {
        if (!this.isCluster) {
            // Single-process mode
            process.on("message", msg => {
                if (!msg || !msg.event) return;
                fn(msg.event, msg.data);
            });
        } else {
            // Cluster mode
            process.on("message", msg => {
                if (!msg || !msg.event) return;
                fn(msg.event, msg.data);
            });
        }
    }
}

module.exports = new EventBusIPC();
