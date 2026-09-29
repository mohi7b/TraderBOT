/**
 * ticksize.cjs
 * تشخیص دقیق‌ترین واحد قیمت (tickSize)
 * از داده‌های عمق یا API صرافی
 */

module.exports = {

    /**
     * detectFromDepth
     * تشخیص tickSize از روی داده‌های عمق لحظه‌ای
     *
     * ورودی:
     *  levels: آرایه‌ای از قیمت‌ها (bid یا ask)
     *
     * خروجی:
     *  کوچک‌ترین اختلاف بین قیمت‌ها
     */
    detectFromDepth(levels = []) {
        if (!levels || levels.length < 2) return null;

        const prices = levels
            .map(l => Number(l.price))
            .filter(p => !isNaN(p))
            .sort((a, b) => a - b);

        let minDiff = Infinity;

        for (let i = 1; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0 && diff < minDiff) minDiff = diff;
        }

        return minDiff === Infinity ? null : minDiff;
    },


    /**
     * detectFromAPI
     * تشخیص tickSize از API صرافی (اگر در config موجود باشد)
     *
     * symbolInfo:
     *  {
     *    priceFilter: { tickSize: "0.01" }
     *  }
     */
    detectFromAPI(symbolInfo = {}) {
        try {
            const tick = symbolInfo?.priceFilter?.tickSize;
            if (!tick) return null;
            const num = Number(tick);
            return isNaN(num) ? null : num;
        } catch {
            return null;
        }
    },


    /**
     * resolveTickSize
     * انتخاب بهترین tickSize:
     *  1) ابتدا از API
     *  2) اگر نبود، از داده‌های عمق
     *  3) اگر نبود، مقدار پیش‌فرض
     */
    resolveTickSize({ apiTick, depthTick, fallback = 0.01 }) {
        if (apiTick) return apiTick;
        if (depthTick) return depthTick;
        return fallback;
    }

};
