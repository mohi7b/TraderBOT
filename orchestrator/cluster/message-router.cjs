/**
 * ============================================================
 *  File: message-router.cjs
 *  Path: orchestrator/cluster/message-router.cjs
 *  Version: 2.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Central IPC router for TraderBOT Enterprise ClusterEngine.
 *      - جلوگیری از Broadcast غیرضروری
 *      - جلوگیری از Loop پیام‌ها
 *      - پشتیبانی از event-based routing
 *      - سازگار با config/index.cjs جدید
 * ============================================================
 */

const cluster = require("cluster");
const config = require("../config/index.cjs");

class MessageRouter {

    constructor() {
        this.handlers = {};
        this.debug = (config.system.mode === "debug");
    }

    /**
     * ثبت هندلر برای یک event
     */
    on(event, handler) {
        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
    }

    /**
     * مسیریابی پیام‌ها بین Worker ↔ Master
     */
    route(worker, msg) {
        if (!msg || !msg.event) return;

        const event = msg.event;
        const data = msg.data;

        if (this.debug) {
            console.log(`📨 [Router] Event: ${event} | From Worker ${worker.id}`);
        }

        // اجرای هندلرهای Master-side
        if (this.handlers[event]) {
            this.handlers[event].forEach(h => h(data, worker));
        }

        // اگر پیام Broadcast نیست → فقط Master هندل کند
        if (!msg.broadcast) return;

        // Broadcast به همه Workerها
        for (const id in cluster.workers) {
            if (cluster.workers[id]) {
                cluster.workers[id].send(msg);
            }
        }
    }
}

module.exports = MessageRouter;
