/* ============================================================
 * File: collector/crypto/realtime/config/realtime.cjs
 * Section: collector/crypto/realtime/config
 * Version: 2.0.0
 *
 * Role:
 *   Runtime configuration of the standalone Realtime service.
 *   This is the single source of truth for the realtime section and
 *   replaces the legacy file (collector/crypto/realtime/aanode/config/realtime.cjs)
 *   which was never required anywhere and has been deleted.
 *
 * Scope:
 *   - HTTP server of the standalone service
 *   - aggregation / chart sampling
 *   - signal history retention
 *   - logging
 * ============================================================ */

const REALTIME_CONFIG = {
    /* ------------------------------------------------------------
     * Section version — the single source of truth for
     * collector/realtime. index.cjs, the service and the standalone
     * server all report this value.
     * ---------------------------------------------------------- */
    version: "2.0.0",

    /* ------------------------------------------------------------
     * Standalone HTTP server (node collector/crypto/realtime/server.cjs)
     * ---------------------------------------------------------- */
    server: {
        enabled: process.env.REALTIME_SERVER_ENABLED !== "false",
        host: process.env.REALTIME_HOST || "127.0.0.1",
        port: Number(process.env.REALTIME_PORT) || 4100
    },

    /* ------------------------------------------------------------
     * Markets collected for every requested symbol
     * ---------------------------------------------------------- */
    markets: ["spot", "futures"],

    /* ------------------------------------------------------------
     * Aggregation / chart series
     * ---------------------------------------------------------- */
    sampleMs: 1000,
    maxPoints: 900,
    depthBuckets: [5, 25],

    /* ------------------------------------------------------------
     * L2 signal retention (event bus "latest" + rolling history)
     * ---------------------------------------------------------- */
    signalHistoryMs: 5 * 60 * 1000,
    signalMaxPerChannel: 300,

    /* ------------------------------------------------------------
     * SSE push throttle for GET /stream/:symbol
     * ---------------------------------------------------------- */
    sseThrottleMs: 250,

    /* ------------------------------------------------------------
     * Lifecycle
     *   idleTtlMs = 0  → requested symbols are never auto-released
     * ---------------------------------------------------------- */
    idleTtlMs: Number(process.env.REALTIME_IDLE_TTL_MS) || 0,

    /* ------------------------------------------------------------
     * Legacy bridge
     *   When true, spot ingest still forwards its packet to
     *   global.orchestrator.route() **if** an orchestrator happens to be
     *   running in the same process. The realtime section never requires
     *   anything from the orchestrator; this is a one-way, opt-out hook.
     * ---------------------------------------------------------- */
    legacyOrchestratorBridge: process.env.REALTIME_LEGACY_BRIDGE !== "false",

    /* ------------------------------------------------------------
     * Logging
     * ---------------------------------------------------------- */
    logLevel: process.env.REALTIME_LOG_LEVEL || "info",
    debugVerbose: process.env.REALTIME_DEBUG_VERBOSE === "true"
};

module.exports = REALTIME_CONFIG;
