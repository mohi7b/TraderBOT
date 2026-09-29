/* ============================================================
 * File: orchestrator.cjs
 * Section: orchestrator/core
 * Role:
 *   Main orchestrator controller
 *
 * Version: 2.0.0
 * ============================================================ */

const log = require("../utils/log-manager.cjs");
const Worker = require("../workers/Worker.cjs");

class Orchestrator {
    constructor() {
        this.worker = new Worker();
        this.state = {};
        global.orchestrator = this;

        log.info("Orchestrator initialized");
    }

    start() {
        log.info("Orchestrator starting...");
        this.worker.start();

        if (this.healthMonitor) {
            this.healthMonitor.start();
        }
    }

    route(packet) {
        log.debug("Orchestrator routing packet", packet);
        this.worker.handle(packet);
    }
}

module.exports = Orchestrator;
