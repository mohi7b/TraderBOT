/* ============================================================
 * File: Worker.cjs
 * Section: orchestrator/workers
 * Role:
 *   Executes event routing
 * ============================================================ */

const log = require("../utils/log-manager.cjs");
const eventRouter = require("../core/event-router.cjs");

module.exports = class Worker {
    start() {
        log.info("Worker started");
    }

    handle(packet) {
        log.debug("Worker handling packet", packet);
        eventRouter.route(packet);   // ✔ نسخه صحیح
    }
};
