/**
 * depth_router.cjs
 * اتصال WebSocket به Depth Engine
 */

const DepthEngine = require("./depth_engine.cjs");

class DepthRouter {

    constructor(config = {}) {
        this.engine = new DepthEngine(config);
        this.initialized = false;
    }

    /**
     * initialize
     * مقداردهی اولیه با snapshot یا قیمت اولیه
     */
    initialize({ price, symbolInfo = null, snapshot = [] }) {
        this.engine.initialize(price, symbolInfo, snapshot);

        if (snapshot && snapshot.length > 0) {
            this.engine.processSnapshot(snapshot);
        }

        this.initialized = true;
    }

    /**
     * handleMessage
     * پردازش پیام‌های WS
     */
    handleMessage(msg) {
        if (!this.initialized) {
            if (msg.type === "snapshot") {
                const price = msg.price || (msg.levels?.[0]?.price);
                this.initialize({
                    price,
                    symbolInfo: msg.symbolInfo || null,
                    snapshot: msg.levels || []
                });
                return { initialized: true };
            }
            return null;
        }

        if (msg.type === "update") {
            return this.engine.processLevel(msg.level);
        }

        if (msg.type === "snapshot") {
            this.engine.processSnapshot(msg.levels || []);
            return { snapshotProcessed: true };
        }

        return null;
    }

    /**
     * getState
     * خروجی کامل وضعیت عمق
     */
    getState() {
        return this.engine.getState();
    }
}

module.exports = DepthRouter;
