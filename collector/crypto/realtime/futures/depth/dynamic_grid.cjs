/**
 * dynamic_grid.cjs
 * جدول داینامیک ± درصد حول قیمت فعلی
 * شامل ساخت جدول، جابه‌جایی، و قرار دادن حجم در خانهٔ صحیح
 */

const priceUtils = require("../../../common/price-utils.cjs");
const rangeUtils = require("../../../common/range-utils.cjs");

class DynamicGrid {

    constructor({ percent = 0.10, tickSize = 0.01 }) {
        this.percent = percent;
        this.tickSize = tickSize;

        this.basePrice = null;
        this.range = null;
        this.minPrice = null;
        this.maxPrice = null;

        this.grid = [];
        this.size = 0;
    }

    /**
     * initialize
     * ساخت جدول اولیه بر اساس قیمت فعلی
     */
    initialize(price) {
        const r = rangeUtils.createRange(price, this.percent);

        this.basePrice = r.basePrice;
        this.range = r.range;
        this.minPrice = r.minPrice;
        this.maxPrice = r.maxPrice;

        this.size = Math.floor((this.maxPrice - this.minPrice) / this.tickSize) + 1;
        this.grid = new Array(this.size).fill(null);
    }

    /**
     * shiftIfNeeded
     * اگر قیمت خارج از بازه باشد، جدول را جابه‌جا می‌کند
     */
    shiftIfNeeded(price) {
        if (!rangeUtils.isOutsideRange(price, this.basePrice, this.range)) return false;

        const r = rangeUtils.shiftRange(price, this.percent);

        this.basePrice = r.basePrice;
        this.range = r.range;
        this.minPrice = r.minPrice;
        this.maxPrice = r.maxPrice;

        this.size = Math.floor((this.maxPrice - this.minPrice) / this.tickSize) + 1;
        this.grid = new Array(this.size).fill(null);

        return true;
    }

    /**
     * insertLevel
     * قرار دادن یک سطح عمق در خانهٔ صحیح
     */
    insertLevel(level) {
        const price = priceUtils.normalizePrice(level.price, this.tickSize);

        if (rangeUtils.isOutsideRange(price, this.basePrice, this.range)) return false;

        const index = priceUtils.priceToIndex(price, this.basePrice, this.range, this.tickSize);
        if (index < 0 || index >= this.size) return false;

        this.grid[index] = {
            price,
            qty: level.qty,
            side: level.side,
            timestamp: level.timestamp
        };

        return true;
    }

    /**
     * getGrid
     * خروجی کامل جدول داینامیک
     */
    getGrid() {
        return {
            basePrice: this.basePrice,
            range: this.range,
            minPrice: this.minPrice,
            maxPrice: this.maxPrice,
            tickSize: this.tickSize,
            size: this.size,
            grid: this.grid
        };
    }
}

module.exports = DynamicGrid;
