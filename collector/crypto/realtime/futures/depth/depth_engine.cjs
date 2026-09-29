/**
 * depth_engine.cjs
 * هستهٔ اصلی پردازش عمق بازار
 */

const DynamicGrid = require("./dynamic_grid.cjs");
const MasterGrid = require("./master_grid.cjs");
const DepthHistory = require("./depth_history.cjs");
const LiquidityScore = require("./liquidity_score.cjs");
const ticksize = require("./ticksize.cjs");
const depthUtils = require("../../../common/depth-utils.cjs");

class DepthEngine {

    constructor(config = {}) {
        this.percent = config.percent || 0.10;
        this.minQty = config.minQty || 0.0;

        this.tickSize = null;

        this.dynamicGrid = null;
        this.masterGrid = new MasterGrid(config.masterGrid || {});
        this.history = new DepthHistory(config.maxHistory || 5000);
        this.liquidity = new LiquidityScore(config.liquidity || {});
    }

    /**
     * initialize
     * مقداردهی اولیه با قیمت و tickSize
     */
    initialize(price, symbolInfo = null, depthLevels = []) {
        const apiTick = ticksize.detectFromAPI(symbolInfo);
        const depthTick = ticksize.detectFromDepth(depthLevels);

        this.tickSize = ticksize.resolveTickSize({
            apiTick,
            depthTick,
            fallback: 0.01
        });

        this.dynamicGrid = new DynamicGrid({
            percent: this.percent,
            tickSize: this.tickSize
        });

        this.dynamicGrid.initialize(price);
    }

    /**
     * processLevel
     * پردازش یک سطح عمق جدید
     */
    processLevel(level) {
        if (!this.tickSize) return;

        const price = Number(level.price);
        const qty = Number(level.qty);
        const side = level.side;
        const timestamp = level.timestamp || Date.now();

        const normalized = {
            price,
            qty,
            side,
            timestamp
        };

        const shifted = this.dynamicGrid.shiftIfNeeded(price);

        if (!shifted) {
            this.dynamicGrid.insertLevel(normalized);
        }

        this.history.addRecord(normalized);

        const stats = this.history.getStatsForPrice(price);

        const masterLevel = {
            price,
            qty,
            side,
            repeats: stats ? stats.repeats : 1,
            durationMs: stats ? stats.lastSeen - stats.price : 0,
            timestamp
        };

        if (this.masterGrid.shouldStore(masterLevel)) {
            this.masterGrid.updateLevel(masterLevel);
        }

        const score = this.liquidity.calculate(masterLevel, stats);

        return {
            price,
            qty,
            side,
            score,
            dynamicGrid: this.dynamicGrid.getGrid()
        };
    }

    /**
     * processSnapshot
     * پردازش snapshot کامل عمق
     */
    processSnapshot(levels = []) {
        for (const level of levels) {
            this.processLevel(level);
        }
    }

    /**
     * getState
     * خروجی کامل وضعیت عمق
     */
    getState() {
        return {
            tickSize: this.tickSize,
            dynamicGrid: this.dynamicGrid ? this.dynamicGrid.getGrid() : null,
            masterGrid: this.masterGrid.getAll()
        };
    }
}

module.exports = DepthEngine;
