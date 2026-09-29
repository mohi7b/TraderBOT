/**
 * ChartEngine V2 — **رنگِ نمونه‌های تکرارشده** (بازبینی هفتم ✓)
 * frontend/components/base/engine/core/instanceColors.ts
 * ============================================================
 * **چرا؟** کاربر گفت: «وقتی دو/سه اندیکاتور همسان اضافه می‌کنیم، باید در بخش
 * رنگ‌بندی قالب (هر ۵ نسخه) رنگ‌های از پیش تعریف‌شده داشته باشیم تا نمونهٔ دوم و
 * سوم **نه با اولی و نه با همدیگر** هم‌رنگ نشوند» ✓.
 *
 * **قاعده (قفل‌شده):**
 *   · نمونهٔ **اول** هر آیتم ⇒ رنگِ خودِ آیتم ✓ (`colorKey` از رجیستری AL ✓)
 *     ⇒ ظاهر امروزِ چارت **عیناً** حفظ می‌شود ✗ تغییر نمی‌کند ✓.
 *   · نمونه‌های **بعدی** ⇒ حلقهٔ پالت قالب (`series.N` ✓) به‌ترتیب، با پرش از
 *     هر رنگی که **قبلاً در همین تب استفاده شده** ✓ ⇒ تضادِ رنگ ممنوع ✗.
 *   · رنگ‌ها **از قالب** می‌آیند ✓ (این ماژول هیچ رنگ هاردکد ندارد ✗ ✓) و resolver
 *     به‌صورت **تزریق‌شده** می‌آید ✓ ⇒ لایهٔ کتابخانه به لایهٔ تم وابسته نمی‌شود ✓.
 *
 * ⚠️ صفر وابستگی به React/DOM/تم ✗ ⇒ قابل استفاده در SSR (صفحه و چارت) ✓.
 */

export interface InstanceColorItem {
  /** کلید آیتم در کتابخانهٔ ماژول ✓ (مثل `ema`) */
  key: string;
  /** کلید رنگ آیتم — شناسهٔ اسلات/پالت (مثل `emaFast` یا `series.2`) ✓ */
  colorKey: string;
}

/**
 * رنگ هر نمونهٔ هر آیتم را تعیین می‌کند.
 * @param items آیتم‌های ماژول به ترتیب رسم ✓
 * @param countOf تعداد نمونه‌های هر آیتم ✓ (شامل خاموش‌ها ✓ — ترتیب پایدار ✓)
 * @param resolve «حلِ رنگ از قالب تم» ✓ (`resolveSlot` تزریق می‌شود ✓)
 * @returns نگاشت `"key#index"` ⇒ رنگ ✓
 */
export function assignInstanceColors(
  items: readonly InstanceColorItem[],
  countOf: (key: string) => number,
  resolve: (ref: string, fallbackIndex: number) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  /** رنگ‌های مصرف‌شده در همین تب ⇒ تضاد ممنوع ✗ */
  const used = new Set<string>();

  for (const item of items) {
    const count = Math.max(0, countOf(item.key));
    for (let index = 0; index < count; index += 1) {
      /** نمونهٔ اول ⇒ رنگ اصلی خود آیتم ✓ (رفتار امروز ✓) */
      let color = index === 0 ? resolve(item.colorKey, 0) : resolve(`series.${index}`, index);
      /**
       * ⚠️ **باگ واقعیِ همین سنجش ✗:** رنگ آیتم‌های مختلف ممکن است به یک اسلات
       * برسد (مثلاً `SMA = smaSlow = series.1` و نمونهٔ دومِ EMA هم `series.1` ✗)
       * ⇒ اگر رنگ **قبلاً استفاده شده** باشد، در حلقهٔ پالت جلو می‌رویم ✓
       * (هم برای نمونهٔ اول ✓ و هم بعدی‌ها ✓) ⇒ هیچ دو سری‌ای هم‌رنگ نمی‌شود ✓.
       */
      for (let guard = 0; guard < 12 && used.has(color); guard += 1) {
        color = resolve(`series.${(index + guard + 1) % 6}`, index + guard + 1);
      }
      used.add(color);
      out[`${item.key}#${index}`] = color;
    }
  }
  return out;
}

/** آیا دو نگاشت رنگ، تضاد دارند؟ (کمکی برای سنجش/selfTest ✓) */
export function hasDuplicateColors(map: Record<string, string>): boolean {
  const values = Object.values(map);
  return new Set(values).size !== values.length;
}
