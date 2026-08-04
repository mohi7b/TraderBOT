/**
 * -------------------------------------------------------------
 *  File: depth.worker.cjs
 *  Module: Depth Processing Engine
 *  Layer: Worker (Per Market/Symbol)
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/workers/
 *
 *  Description:
 *      ورکر مستقل برای پردازش عمق هر symbol/exchange.
 *      دریافت snapshot، پردازش، محاسبهٔ depth metrics،
 *      و ارسال خروجی به depth.router.
 *
 *  Notes:
 *      - هر ورکر کاملاً مستقل و موازی اجرا می‌شود.
 *      - هیچ وابستگی به ورکرهای دیگر ندارد.
 *      - ultra-light و مناسب VPS دو‌هسته‌ای.
 *      - در صورت crash، توسط DepthManager ری‌استارت می‌شود.
 *
 *  Dependencies:
 *      - depth.router.cjs
 *      - log-ipc.cjs
 *
 * -------------------------------------------------------------
 */

/**
 * -------------------------------------------------------------
 *  File: depth.worker.cjs
 * -------------------------------------------------------------
 */

const router = require("../depth.router.cjs");
const { log } = require("../../../ipc/log-ipc.cjs");

class DepthWorker {
    constructor(market, symbol) {
        this.market = market;
        this.symbol = symbol;

        this.queue = [];
        this.processing = false;

        this.state = {
            lastMid: null,
            lastSnapshotTime: null,
            lastDepth: null,
        };

        log.info(`[DepthWorker] Initialized worker for ${market}:${symbol}`);
    }

    enqueue(snapshot) {
        this.queue.push(snapshot);
        if (!this.processing) this.processQueue();
    }

    async processQueue() {
        this.processing = true;

        while (this.queue.length > 0) {
            const snapshot = this.queue.shift();

            try {
                const result = this.computeDepth(snapshot);

                router.route(
                    this.market,
                    this.symbol,
                    "orderbook",
                    "depth",
                    result
                );

            } catch (err) {
                log.error(`[DepthWorker] Error in ${this.market}:${this.symbol}`, err);
            }
        }

        this.processing = false;
    }

    computeDepth(snapshot) {
        const bids = snapshot.bids || [];
        const asks = snapshot.asks || [];

        const bestBid = bids[0]?.price || 0;
        const bestAsk = asks[0]?.price || 0;
        const mid = (bestBid + bestAsk) / 2;

        const bidLiquidity = bids.slice(0, 10).reduce((sum, x) => sum + x.quantity, 0);
        const askLiquidity = asks.slice(0, 10).reduce((sum, x) => sum + x.quantity, 0);

        const imbalance = (bidLiquidity - askLiquidity) / (bidLiquidity + askLiquidity || 1);

        const pressure = bestBid - bestAsk;

        const result = {
            market: this.market,
            symbol: this.symbol,
            mid,
            bidLiquidity,
            askLiquidity,
            imbalance,
            pressure,
            ts: Date.now()
        };

        this.state.lastMid = mid;
        this.state.lastDepth = result;
        this.state.lastSnapshotTime = snapshot.eventTime || Date.now();

        return result;
    }

    shutdown() {
        this.queue = [];
        this.processing = false;
        log.warn(`[DepthWorker] Shutdown worker for ${this.market}:${this.symbol}`);
    }
}

module.exports = DepthWorker;
