/**
 * price-utils.cjs
 * ابزارهای تبدیل قیمت به index و برعکس
 * سازگار با tickSize و بازه‌های داینامیک
 *
 * این فایل پایه‌ای‌ترین بخش Depth Engine است.
 * Dynamic Grid و Master Grid هر دو از این توابع استفاده می‌کنند.
 */

module.exports = {

    /**
     * normalizePrice
     * قیمت را با توجه به tickSize نرمال می‌کند.
     * مثال:
     * price = 6000.005 , tickSize = 0.005 → خروجی: 6000.005
     * price = 6000.007 , tickSize = 0.005 → خروجی: 6000.005
     */
    normalizePrice(price, tickSize) {
        return Math.floor(price / tickSize) * tickSize;
    },


    /**
     * priceToIndex
     * تبدیل قیمت به index در Dynamic Grid
     *
     * basePrice: قیمت مرکز جدول
     * tickSize: دقت قیمت
     * range: بازهٔ داینامیک (مثلاً ±۱۰٪)
     *
     * مثال:
     * basePrice = 60000
     * tickSize = 0.1
     * price = 60010
     *
     * index = (price - (basePrice - range)) / tickSize
     */
    priceToIndex(price, basePrice, range, tickSize) {
        const minPrice = basePrice - range;
        return Math.floor((price - minPrice) / tickSize);
    },


    /**
     * indexToPrice
     * تبدیل index به قیمت در Dynamic Grid
     */
    indexToPrice(index, basePrice, range, tickSize) {
        const minPrice = basePrice - range;
        return minPrice + (index * tickSize);
    },


    /**
     * isPriceInsideRange
     * بررسی اینکه آیا قیمت داخل بازهٔ داینامیک هست یا نه
     */
    isPriceInsideRange(price, basePrice, range) {
        return price >= (basePrice - range) && price <= (basePrice + range);
    },


    /**
     * clampPriceToRange
     * اگر قیمت خارج از بازه باشد، مقدار نزدیک‌ترین قیمت داخل بازه را برمی‌گرداند.
     * این برای جلوگیری از خطاهای احتمالی در Dynamic Grid مفید است.
     */
    clampPriceToRange(price, basePrice, range) {
        if (price < basePrice - range) return basePrice - range;
        if (price > basePrice + range) return basePrice + range;
        return price;
    }

};
