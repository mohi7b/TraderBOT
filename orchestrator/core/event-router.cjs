/* ============================================================
 * File: event-router.cjs
 * Section: orchestrator/core
 * Role:
 *   Routes packets to system-handler
 *
 * Version: 2.0.0
 * ============================================================ */

const log = require("../utils/log-manager.cjs");
const systemHandler = require("./system-handler.cjs");

module.exports = {
    route(packet) {
        log.debug("EventRouter routing packet", packet);
        systemHandler(packet);
    }
};
