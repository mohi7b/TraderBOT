/**
 * master_grid.cjs
 * جدول بلندمدت نقدینگی (Map)
 */

const depthUtils = require("../../../common/depth-utils.cjs");

class MasterGrid {

    constructor(config = {}) {
        this.grid = new Map();

        this.minQty = config.minQty || 0.0;
        this.minRepeats = config.minRepeats || 2;
        this.minDurationMs = config.minDurationMs || 30000;
    }

    /**
     * updateLevel
     * آپدیت یا ایجاد یک سطح جدید در Master Grid
     */
    updateLevel(level) {
        const priceKey = String(level.price);

        const now = level.timestamp || Date.now();

        if (!this.grid.has(priceKey)) {
            this.grid.set(priceKey, {
                price: level.price,
                qty: level.qty,
                side: level.side,
                repeats: 1,
                firstSeen: now,
                lastSeen: now,
                durationMs: 0
            });
            return true;
        }

        const old = this.grid.get(priceKey);

        const repeats = depthUtils.updateRepeats(old.repeats);
        const durationMs = depthUtils.updateDuration(old.firstSeen, now);

        this.grid.set(priceKey, {
            price: level.price,
            qty: level.qty,
            side: level.side,
            repeats,
            firstSeen: old.firstSeen,
            lastSeen: now,
            durationMs
        });

        return true;
    }

    /**
     * shouldStore
     * بررسی اینکه آیا سطح باید در Master Grid ذخیره شود یا نه
     */
    shouldStore(level) {
        return depthUtils.shouldStoreInMasterGrid(
            {
                qty: level.qty,
                repeats: level.repeats || 1,
                durationMs: level.durationMs || 0
            },
            {
                minQty: this.minQty,
                minRepeats: this.minRepeats,
                minDurationMs: this.minDurationMs
            }
        );
    }

    /**
     * insertIfSignificant
     * فقط قیمت‌های مهم وارد Master Grid می‌شوند
     */
    insertIfSignificant(level) {
        if (!depthUtils.isSignificantVolume(level.qty, this.minQty)) return false;
        return this.updateLevel(level);
    }

    /**
     * getLevel
     * دریافت یک سطح از Master Grid
     */
    getLevel(price) {
        return this.grid.get(String(price)) || null;
    }

    /**
     * getAll
     * خروجی کامل Master Grid
     */
    getAll() {
        return Array.from(this.grid.values());
    }

    /**
     * deleteLevel
     * حذف یک قیمت از Master Grid
     */
    deleteLevel(price) {
        return this.grid.delete(String(price));
    }

    /**
     * clear
     * پاک‌سازی کامل Master Grid
     */
    clear() {
        this.grid.clear();
    }
}

module.exports = MasterGrid;
