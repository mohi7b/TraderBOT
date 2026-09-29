/**
 * ============================================================
 * LWC Options Builder — ChartTheme + ChartLayout → ChartOptions
 * frontend/lib/chart/lwcOptions.ts
 * ============================================================
 * تفاوت با `lwcTheme.ts` (نسخهٔ قدیمی): این‌جا **هیچ مقداری هاردکد نیست**
 * — نه فرمت‌کنندهٔ قیمت، نه locale، نه barSpacing، نه grid.
 * همه از `theme` و `layout` تزریق می‌شوند.
 * ============================================================
 */
import { CrosshairMode, LineStyle, type ChartOptions, type DeepPartial } from "lightweight-charts";
import type { ChartLayout, ChartTheme } from "./types";

export interface LwcFormatOptions {
  /** فرمت اعداد محور قیمت (پیش‌فرض: بدون درصد) */
  priceFormatter?: (price: number) => string;
  /** locale برای تاریخ/اعداد */
  locale?: string;
  /** متن watermark (برچسب گوشه) */
  watermarkText?: string;
}

/**
 * گسترش بازهٔ مقیاس قیمت تا **باند هدف** همیشه در دید بماند.
 *
 * مشکل قبلی: مقیاس فقط از دادهٔ سری autoscale می‌شد؛ پس هرگاه هدف بیرون از
 * دامنهٔ داده بود (مثلاً تورم چین ‎-۰٫۸..۱٫۳ با هدف ۳٪) لایهٔ باند هدف در
 * بیرون بوم کشیده می‌شد و **دیده نمی‌شد**.
 *
 * قاعده: هدف تا `pad = max(0.5, 1.5 × span)` فراتر از دامنه، در مقیاس گنجانده
 * می‌شود؛ اگر دورتر باشد (مثل تورم ۱۰۰٪ با هدف ۲٪) چارت فشرده نمی‌شود و هدف
 * بیرون می‌ماند (مقدارش در لجند هست).
 */
export function expandRangeForTarget(
  minValue: number,
  maxValue: number,
  target?: { low: number | null; high: number | null } | null,
): { minValue: number; maxValue: number; expanded: boolean } {
  if (!target || (target.low === null && target.high === null)) {
    return { minValue, maxValue, expanded: false };
  }
  const span = Math.max(1e-9, maxValue - minValue);
  const pad = Math.max(0.5, span * 1.5);
  const inside = (v: number) => v >= minValue - pad && v <= maxValue + pad;
  let min = minValue;
  let max = maxValue;
  if (target.low !== null && Number.isFinite(target.low) && inside(target.low)) {
    min = Math.min(min, target.low);
  }
  if (target.high !== null && Number.isFinite(target.high) && inside(target.high)) {
    max = Math.max(max, target.high);
  }
  return { minValue: min, maxValue: max, expanded: min !== minValue || max !== maxValue };
}

const CROSSHAIR_MODE: Record<ChartLayout["crosshair"]["mode"], CrosshairMode> = {
  normal: CrosshairMode.Normal,
  magnet: CrosshairMode.Magnet,
  hidden: CrosshairMode.Hidden,
};

const PRICE_MODE: Record<ChartLayout["priceScale"]["mode"], number> = {
  normal: 0, // PriceScaleMode.Normal
  logarithmic: 1, // PriceScaleMode.Logarithmic
  percentage: 2, // PriceScaleMode.Percentage
};

/**
 * ساخت ChartOptions از تم + چینش (هیچ ظاهری هاردکد نیست).
 */
export function buildChartOptions(
  theme: ChartTheme,
  layout: ChartLayout,
  format: LwcFormatOptions = {},
): DeepPartial<ChartOptions> {
  const p = theme.palette;
  return {
    layout: {
      background: { color: p.background },
      textColor: p.textMuted,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: p.grid, visible: layout.grid.vert },
      horzLines: { color: p.grid, visible: layout.grid.horz },
    },
    rightPriceScale: {
      visible: layout.priceScale.visible,
      /**
       * 🟩 **مرحلهٔ ۲۱ — autofit قابل‌کنترل شد** (خواستهٔ کاربر: «اتو فیت رو کلا بردار» ✗):
       *   · چارت **تاریخی** ⇒ `false` ✗ (`CandleChart` override می‌کند ✓) ⇒ مقیاس قیمت
       *     **هرگز خودش تغییر نمی‌کند** ✗ (فقط اگر کاربر دستی روی محور بکشد/چرخ بزند ✓).
       *   · چارت‌های **ماکرو** ⇒ پیش‌فرض `true` ✓ (رفتارشان عوض نمی‌شود ✗ · باند هدف
       *     در دید می‌ماند ✓).
       */
      autoScale: layout.priceScale.autoScale ?? true,
      borderColor: p.border,
      scaleMargins: { top: layout.priceScale.top, bottom: layout.priceScale.bottom },
      mode: PRICE_MODE[layout.priceScale.mode] as never,
    },
    leftPriceScale: {
      visible: false,
      borderColor: p.border,
    },
    timeScale: {
      visible: layout.timeScale.visible,
      borderColor: p.border,
      timeVisible: layout.timeScale.timeVisible,
      secondsVisible: layout.timeScale.secondsVisible,
      rightOffset: layout.timeScale.rightOffset,
      barSpacing: layout.timeScale.barSpacing,
      minBarSpacing: layout.timeScale.minBarSpacing,
      /**
       * 🟩 **مرحلهٔ ۷ — افزودنِ کندل تازه، محور زمان را حرکت نمی‌دهد** (خواستهٔ کاربر ✓):
       *   آپشن رسمی LWC (`shiftVisibleRangeOnNewBar`) پیش‌فرض **`true`** است ✓:
       *   «Shift the visible range to the right (into the future) by the number of new
       *   bars when new data is added … only applies when the last bar is visible» ✓
       *   ⇒ با هر کندل تازه (پولر ۴۵s ⇒ `router.refresh()` ⇒ `series.update`/`setData` ✓)
       *   — و چون آخرین کندل **دیدنی** است (فضای ۱۰۰px ✓) — پنجره یک میله جلو می‌رفت ✗
       *   (همان «محور زمان خودش عوض می‌شود» ✓).
       *   ⇒ این‌جا **خاموش** می‌شود ✓: «نما ثابت · فقط کندل تازه» ✓ (ر.ک. §۱۳.۱۶ ✓).
       */
      shiftVisibleRangeOnNewBar: false,
      /** جابه‌جایی هنگام پر شدن «جای خالی آینده» هم ممنوع ✓ (فضای ۱۰۰px حفظ ✓) */
      allowShiftVisibleRangeOnWhitespaceReplacement: false,
    },
    crosshair: {
      mode: CROSSHAIR_MODE[layout.crosshair.mode],
      vertLine: {
        color: p.crosshair,
        width: 1,
        style: layout.crosshair.dashed ? LineStyle.Dashed : LineStyle.Solid,
        labelBackgroundColor: p.text,
      },
      horzLine: {
        color: p.crosshair,
        width: 1,
        style: layout.crosshair.dashed ? LineStyle.Dashed : LineStyle.Solid,
        labelBackgroundColor: p.text,
      },
    },
    localization: {
      locale: format.locale ?? "en-US",
      ...(format.priceFormatter ? { priceFormatter: format.priceFormatter } : {}),
    },
    // ⚠️ در LWC v5 گزینهٔ watermark از ChartOptions حذف شده است؛
    //    برچسب گوشهٔ چارت در BaseChart به‌صورت overlay داده می‌شود.
    autoSize: true,
    /**
     * 🟩 **مرحلهٔ ۱۵ — پنِ عمودی (Y) آزاد شد** (شکایت کاربر: «چارت روی محور عمودی قفل است» ✗):
     *   · `vertTouchDrag: false` (پیش‌فرض ما ✗) یعنی کشیدنِ **یک‌انگشتیِ عمودی روی چارت**،
     *     صفحه را اسکرول می‌کرد ✗ نه قیمت را ⇒ همان احساسِ «قفل» ✓.
     *   · حالا `true` ✓ ⇒ روی لمسی، کشیدن عمودی روی چارت **مقیاس قیمت** را جابه‌جا می‌کند ✓
     *     (و صفحه را از بیرون چارت — هدر/فرم/فاصله‌ها ✓ — می‌توان اسکرول کرد ✓).
     *   · با **ماوس**: کشیدن روی بدنه = زمان ✓ · کشیدن روی **محور قیمت (راست)** = قیمت ✓ ·
     *     چرخ ماوس روی محور = زوم عمودی ✓ · **دوبار کلیک روی محور** = بازگشت به خودکار ✓
     *     (`axisDoubleClickReset` پیش‌فرض `true` ✓).
     *   · `handleScale.axisPressedMouseMove` صریح شد ✓ ⇒ هر دو محور (زمان/قیمت) قابل‌کشیدن ✓.
     */
    /**
     * 🟩 **مرحلهٔ ۱۶ — `vertTouchDrag` فقط در حالت موبایل/تبلت** (خواستهٔ صریح ✓):
     *   · روی **موبایل/تبلت** (`shahrivar_mobile`/`shahrivar_tablet` ✓): `true` ✓ ⇒
     *     کشیدن عمودی با انگشت، مقیاس قیمت را پن می‌کند ✓ (به قیمت `vertTouchDrag` صفحهٔ
     *     اسکرول نمی‌شود ✗ — از بیرونِ چارت اسکرول کن ✓).
     *   · روی **دسکتاپ/واید/TV** ✓: `false` ✗ ⇒ صفحه اسکرول‌پذیر می‌ماند ✓ و پنِ عمودی با
     *     **ماوس** از مسیر اختصاصیِ خودمان انجام می‌شود ✓ (`BaseChart` — کشیدن روی بدنه ✓).
     *   · تم خنثیِ SSR (`shahrivar_default` ✗) ⇒ `classOfTheme` = `null` ⇒ `false` ✓
     *     (و روی کلاینت با تم واقعی، مقدار درست اعمال می‌شود ✓).
     */
    /**
     * 🟩 **مرحلهٔ ۲۰ — بازگشت به تنظیمات پیش‌فرضِ اولیه** (خواستهٔ کاربر ✓):
     *   هر دو خط زیر **عیناً** همان مقادیر قبل از آزمایش‌های مرحلهٔ ۱۵–۱۹ هستند ✓
     *   (`vertTouchDrag: false` ✓ · `axisPressedMouseMove: true` ✓) ⇒ رفتار چارت
     *   همان رفتار **اصلیِ LWC** می‌شود ✓:
     *     · کشیدن با ماوس روی بدنه = پنِ **زمان (X)** ✓
     *     · کشیدن روی **محور قیمت** = مقیاس/زوم عمودی ✓ (بومی ✓)
     *     · چرخ ماوس روی محور = زوم عمودی ✓ · pinch (لمسی) = زوم ✓
     *   ⛔ پنِ اختصاصیِ ماوس و «تثبیت Y» **خاموش‌اند** ✗ (`ENABLE_CUSTOM_Y_PAN = false`
     *      در `BaseChart` ✓) ⇒ دیگر هیچ رفتار سفارشی‌ای روی محورها نیست ✓.
     */
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  };
}

/** فرمت‌کننده‌های آمادهٔ محور قیمت (دامنه انتخاب می‌کند). */
export const PRICE_FORMATTERS = {
  percent: (v: number) => `${v.toFixed(2)}%`,
  index: (v: number) => v.toFixed(1),
  number: (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2)),
  currency: (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
  compact: (v: number) =>
    Math.abs(v) >= 1e9
      ? `${(v / 1e9).toFixed(1)}B`
      : Math.abs(v) >= 1e6
        ? `${(v / 1e6).toFixed(1)}M`
        : Math.abs(v) >= 1e3
          ? `${(v / 1e3).toFixed(1)}K`
          : v.toFixed(2),
} as const;

export type PriceFormatName = keyof typeof PRICE_FORMATTERS;
