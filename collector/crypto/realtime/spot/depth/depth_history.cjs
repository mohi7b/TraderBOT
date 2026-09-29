/**
 * depth_history.cjs
 * ثبت تاریخچهٔ تغییرات عمق برای تحلیل بلندمدت
 */

class DepthHistory {

    constructor(maxRecords = 5000) {
        this.maxRecords = maxRecords;
        this.records = [];
    }

    /**
     * addRecord
     * افزودن یک رکورد جدید به تاریخچه
     */
    addRecord(level) {
        const record = {
            price: level.price,
            qty: level.qty,
            side: level.side,
            timestamp: level.timestamp || Date.now()
        };

        this.records.push(record);

        if (this.records.length > this.maxRecords) {
            this.records.shift();
        }

        return true;
    }

    /**
     * getRecent
     * دریافت آخرین N رکورد
     */
    getRecent(n = 100) {
        return this.records.slice(-n);
    }

    /**
     * getByPrice
     * دریافت تمام رکوردهای مربوط به یک قیمت خاص
     */
    getByPrice(price) {
        return this.records.filter(r => r.price === price);
    }

    /**
     * getStatsForPrice
     * محاسبهٔ آمار مربوط به یک قیمت:
     *  - تعداد دفعات دیده شدن
     *  - میانگین حجم
     *  - آخرین timestamp
     */
    getStatsForPrice(price) {
        const list = this.getByPrice(price);
        if (list.length === 0) return null;

        const repeats = list.length;
        const avgQty = list.reduce((sum, r) => sum + r.qty, 0) / repeats;
        const lastSeen = list[list.length - 1].timestamp;

        return { price, repeats, avgQty, lastSeen };
    }

    /**
     * clear
     * پاک‌سازی کامل تاریخچه
     */
    clear() {
        this.records = [];
    }
}

module.exports = DepthHistory;
