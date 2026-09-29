/* ============================================================
 * File: collector/crypto/realtime/service/index.cjs
 * Section: collector/crypto/realtime/service
 *
 * Role:
 *   Singleton accessor for the RealtimeService, so that the HTTP
 *   server, the ingest handlers and any future consumer all share one
 *   connection pool and one signal store.
 * ============================================================ */

const { RealtimeService, defaultHandlerFor } = require("./realtime-service.cjs");
const { ConnectionManager, ACTIVE_STATUSES } = require("./connection-manager.cjs");
const { buildVenuePlan, summarizePlan, planVenues, planStreamIds } = require("./venue-plan.cjs");

let service = null;

function getService(options = {}) {
    if (!service) service = new RealtimeService(options);
    return service;
}

function setService(next) {
    service = next;
    return service;
}

function resetService() {
    if (service) service.dispose();
    service = null;
}

function hasService() {
    return !!service;
}

module.exports = {
    RealtimeService,
    ConnectionManager,
    ACTIVE_STATUSES,
    buildVenuePlan,
    summarizePlan,
    planVenues,
    planStreamIds,
    defaultHandlerFor,
    getService,
    setService,
    resetService,
    hasService
};
