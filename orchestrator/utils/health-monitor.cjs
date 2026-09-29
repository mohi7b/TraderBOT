const log = require("./log-manager.cjs");
const debugDashboard = require("./debug-dashboard.cjs");
const { marketDataQuality } = require("../../collector/crypto/common/market-data-quality.cjs");
const LiquidationObserver = require("../../collector/crypto/common/liquidation-observer.cjs");
const { getMarketStatus } = require("./runtime-status.cjs");

module.exports = class HealthMonitor {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        const mode = (global.CONFIG && global.CONFIG.mode) || "debug";

        // ساخت state استاندارد
        this.state = {
            lastTick: Date.now(),
            wsConnected: false,
            packetsPerSecond: 0,
            lastPacketEvent: null,
            lastPacketSymbol: null,
            marketHealth: [],
            liquidation: [],
            mode
        };

        // شمارنده پکت‌ها
        this.packetCounter = 0;
        this.liquidationObserver = new LiquidationObserver({
            exchanges: ["binance", "bybit", "bitget", "kucoin", "okx"],
            capabilities: {
                binance: true,
                bybit: true,
                bitget: true,
                kucoin: false,
                okx: false
            }
        });
        global.getMarketStatus = getMarketStatus;

        global.debugState = global.debugState || {
            enabled: mode === "debug",
            events: [],
            lastBySymbol: {},
            lastByEvent: {},
            counters: {}
        };

        global.debugTrace = (kind, payload = {}) => {
            if (!global.debugState || global.debugState.enabled !== true) return;

            const entry = {
                ts: Date.now(),
                kind,
                ...payload
            };

            global.debugState.events.push(entry);
            if (global.debugState.events.length > 200) {
                global.debugState.events.shift();
            }

            if (payload.symbol) {
                global.debugState.lastBySymbol[payload.symbol] = entry;
            }

            if (payload.event) {
                global.debugState.lastByEvent[payload.event] = entry;
            }

            if (payload.type) {
                global.debugState.counters[payload.type] = (global.debugState.counters[payload.type] || 0) + 1;
            }
        };

        // اتصال به emit سیستم
        global.healthEmit = (packet) => {
            this.packetCounter++;
            this.state.lastPacketEvent = packet.event;
            this.state.lastPacketSymbol = packet.symbol;
            marketDataQuality.record(packet);
            this.liquidationObserver.observe(packet);

            if (global.debugState && global.debugState.enabled) {
                global.debugTrace("health_emit", {
                    symbol: packet.symbol,
                    event: packet.event,
                    type: packet.type || packet.event,
                    packet
                });
            }
        };
    }

    start() {
        log.info("HealthMonitor started");

        if ((global.CONFIG && global.CONFIG.mode) === "debug") {
            log.info("Debug mode enabled → in-memory packet trace active.");
        }

        setInterval(() => {
            this.tick();
        }, 1000);

        if ((global.CONFIG && global.CONFIG.mode) === "debug") {
            setInterval(() => {
                console.log(debugDashboard.renderCompact());
            }, 15000);
        }
    }

    tick() {
        const now = Date.now();

        // محاسبه PPS
        this.state.packetsPerSecond = this.packetCounter;
        this.packetCounter = 0;

        // WS وضعیت
        this.state.wsConnected = global.wsConnected || false;

        // آپدیت lastTick
        this.state.lastTick = now;
        this.state.marketHealth = marketDataQuality.snapshot(now);
        this.state.liquidation = this.liquidationObserver.snapshot(now);
        global.marketHealth = this.state.marketHealth;
        global.liquidationHealth = this.state.liquidation;

        // خروجی
        log.debug("HealthMonitor tick", {
            ws: this.state.wsConnected,
            pps: this.state.packetsPerSecond,
            lastEvent: this.state.lastPacketEvent,
            lastSymbol: this.state.lastPacketSymbol,
            debug: global.debugState && global.debugState.enabled
        });
    }
};
