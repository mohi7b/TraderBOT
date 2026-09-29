/**
 * range-utils.cjs
 * مدیریت بازه‌های قیمتی برای Dynamic Grid
 *
 * این فایل مسئول:
 *  - ساخت بازهٔ اولیه حول قیمت فعلی
 *  - بررسی خروج قیمت از بازه
 *  - جابه‌جایی بازه (shift)
 *  - محاسبهٔ بازهٔ جدید بر اساس درصد
 *
 * Dynamic Grid از این توابع برای مدیریت جدول ±۱۰٪ استفاده می‌کند.
 */

module.exports = {

    /**
     * createRange
     * ساخت بازهٔ اولیه حول قیمت فعلی
     *
     * price: قیمت فعلی
     * percent: درصد بازه (مثلاً 0.10 برای ±10٪)
     *
     * خروجی:
     * {
     *   basePrice: قیمت مرکز
     *   range: مقدار بازه (مثلاً 6000 دلار)
     *   minPrice: کمترین قیمت
     *   maxPrice: بیشترین قیمت
     * }
     */
    createRange(price, percent) {
        const range = price * percent;
        return {
            basePrice: price,
            range,
            minPrice: price - range,
            maxPrice: price + range
        };
    },


    /**
     * isOutsideRange
     * بررسی اینکه آیا قیمت خارج از بازهٔ فعلی است یا نه
     *
     * اگر قیمت خارج باشد → Dynamic Grid باید shift شود
     */
    isOutsideRange(price, basePrice, range) {
        return price < (basePrice - range) || price > (basePrice + range);
    },


    /**
     * shiftRange
     * جابه‌جایی بازهٔ داینامیک به مرکز جدید
     *
     * newPrice: قیمت جدیدی که خارج از بازه بوده
     * percent: درصد بازه (مثلاً 0.10)
     *
     * خروجی مشابه createRange است
     */
    shiftRange(newPrice, percent) {
        const range = newPrice * percent;
        return {
            basePrice: newPrice,
            range,
            minPrice: newPrice - range,
            maxPrice: newPrice + range
        };
    },


    /**
     * clampToRange
     * اگر قیمت خارج از بازه باشد، نزدیک‌ترین مقدار داخل بازه را برمی‌گرداند
     * این برای جلوگیری از خطاهای احتمالی در Dynamic Grid مفید است
     */
    clampToRange(price, basePrice, range) {
        if (price < basePrice - range) return basePrice - range;
        if (price > basePrice + range) return basePrice + range;
        return price;
    },


    /**
     * getRangeInfo
     * اطلاعات کامل بازه را برمی‌گرداند
     * این تابع برای دیباگ و مانیتورینگ مفید است
     */
    getRangeInfo(basePrice, range) {
        return {
            basePrice,
            range,
            minPrice: basePrice - range,
            maxPrice: basePrice + range
        };
    }

};
