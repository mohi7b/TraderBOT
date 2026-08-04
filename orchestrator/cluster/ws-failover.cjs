/**
 * ============================================================
 *  File: ws-failover.cjs
 *  Path: orchestrator/cluster/ws-failover.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Smart WebSocket Failover Engine for TraderBOT Cluster.
 *      - Primary / Backup WS switching
 *      - Auto reconnect
 *      - EventBus + IPC integration
 *      - Debug mode support
 * ============================================================
 */

const WebSocket = require("ws");
const context   = require("./worker-context.cjs");

class WSFailover {

    constructor() {
        this.ws = null;
        this.primary = null;
        this.backup = null;
        this.onEvent = null;

        this.debug = context.system.mode === "debug";
    }

    start(wsConfig, onEvent) {

        if (!wsConfig || !wsConfig.primary) {
            throw new Error("WSFailover: wsConfig.primary is missing");
        }

        this.primary = wsConfig.primary;
        this.backup  = wsConfig.backup || wsConfig.primary;

        this.onEvent = onEvent;

        if (this.debug) {
            context.info(`WSFailover starting → primary=${this.primary} backup=${this.backup}`);
        }

        this.connect(this.primary);
    }

    connect(url) {

        if (this.debug) {
            context.info(`WSFailover connecting → ${url}`);
        }

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            context.info(`🟢 WS connected → ${url}`);
        });

        this.ws.on("message", (msg) => {
            try {
                const data = JSON.parse(msg);

                // ارسال پیام به CollectorCluster یا ProcessorCluster
                this.onEvent(data);

                // ارسال پیام به EventBus IPC
                context.eventbus.publish("ws:data", data);

            } catch (err) {
                context.error(`WSFailover JSON Error: ${err.message}`);
            }
        });

        this.ws.on("close", () => {
            context.error("⚠ WS closed — reconnecting...");
            setTimeout(() => this.connect(this.backup), 2000);
        });

        this.ws.on("error", (err) => {
            context.error(`❌ WSFailover Error: ${err.message}`);
        });
    }
}

module.exports = new WSFailover();
