/**
 * depth-utils.cjs
 * توابع کمکی برای پردازش عمق، فیلتر حجم، تشخیص قیمت‌های مهم،
 * و منطق ورود قیمت‌ها به Master Grid
 */

module.exports = {

    /**
     * isSignificantVolume
     * بررسی اینکه آیا حجم برای ذخیره در Master Grid مهم است یا نه
     *
     * threshold: حداقل حجم قابل‌توجه
     * qty: حجم سفارش
     */
    isSignificantVolume(qty, threshold = 0.0) {
        return qty >= threshold;
    },


    /**
     * shouldStoreInMasterGrid
     * تصمیم‌گیری اینکه آیا یک قیمت باید وارد Master Grid شود یا نه
     *
     * شرایط:
     *  - حجم قابل‌توجه باشد
     *  - یا چند بار تکرار شده باشد
     *  - یا مدت طولانی در عمق مانده باشد
     */
    shouldStoreInMasterGrid({ qty, repeats, durationMs }, config = {}) {
        const {
            minQty = 0.0,
            minRepeats = 2,
            minDurationMs = 30000
        } = config;

        if (qty >= minQty) return true;
        if (repeats >= minRepeats) return true;
        if (durationMs >= minDurationMs) return true;

        return false;
    },


    /**
     * updateRepeats
     * تعداد دفعات دیده شدن یک قیمت را افزایش می‌دهد
     */
    updateRepeats(oldRepeats) {
        return oldRepeats + 1;
    },


    /**
     * updateDuration
     * مدت زمان حضور یک قیمت در عمق را آپدیت می‌کند
     */
    updateDuration(oldTimestamp, newTimestamp) {
        return newTimestamp - oldTimestamp;
    },


    /**
     * mergeDepthLevel
     * ادغام یک سطح عمق جدید با سطح قبلی
     *
     * اگر qty = 0 باشد → حذف
     * اگر qty > 0 باشد → جایگزینی مقدار
     */
    mergeDepthLevel(oldLevel, newLevel) {
        if (!newLevel) return oldLevel;
        if (newLevel.qty === 0) return null;

        return {
            price: newLevel.price,
            qty: newLevel.qty,
            side: newLevel.side,
            timestamp: newLevel.timestamp
        };
    },


    /**
     * isBid
     * بررسی اینکه سطح مربوط به bid است یا ask
     */
    isBid(side) {
        return side === "bid" || side === "b";
    },


    /**
     * isAsk
     */
    isAsk(side) {
        return side === "ask" || side === "a";
    }

};
