/**
 * Chart Engine v3 — قرارداد رسمی (`ChartSpec v3`)
 * frontend/lib/chart/spec/types.ts
 * ============================================================
 * **چرا؟** تا پیش از v3، هر چارت دامنه (تورم · سیاست پولی · رشد · شرایط مالی)
 * قرارداد خودش را در کد کامپوننت می‌ساخت: تعداد لایه‌ها، مقیاس‌ها، سیاست
 * «بدون داده»، متن‌های tooltip و نسخهٔ ریاضی **جایی ثبت نمی‌شد**. نتیجه:
 *   · سه قرارداد متفاوت برای نمایش دادهٔ ناموجود (حذف بج · `—` · `N/A`)
 *   · متن tooltip هاردکد در دامنه (نقض «هیچ متن ثابتی در کامپوننت‌ها»)
 *   · ناتوانی در بازتولید یک چارت یا مهاجرت نسخه‌ای امن
 * این فایل قرارداد **واحدی** است که هر چارت باید بتواند به آن تبدیل شود و
 * ولیدیتور (`validate.ts`) صحتش را بررسی کند.
 *
 * ⚠️ قواعد کلیدی:
 *   · `specVersion` = نسخهٔ **قرارداد** (متن این فایل‌ها)
 *   · `mathVersion` = نسخهٔ **ریاضی/آستانه‌ها** (تغییر وزن‌ها ⇒ این عوض شود)
 *   · `themeVersion` = نسخهٔ ظاهر (تم)
 *   · سری با `role: "derived"` **اجباراً** `provenance` دارد (منشأ داده)
 * ============================================================
 */

/** نسخهٔ قرارداد — با هر تغییر ناسازگار در این فایل‌ها بالا می‌رود. */
export const CHART_SPEC_VERSION = "3.0" as const;

/**
 * سیاست «بدون داده» — سه قرارداد تاریخی پروژه که در v3 **صریح** می‌شوند:
 *  · `hide` = بج سیگنال رسم نمی‌شود (رفتار چارت تورمی برای سیگنال‌های کتابخانه)
 *  · `dash` = بج با مقدار `—` (رفتار چارت رشد: PMI/NOW)
 *  · `na`   = بج با مقدار `N/A` (رفتار چارت شرایط مالی — و درخواست کاربر)
 */
export type MissingPolicy = "hide" | "dash" | "na";

/** جای سری در چارت. */
export type SeriesRole = "main" | "secondary" | "derived" | "forecast";

/** موقعیت/نوع مقیاس قیمت. */
export interface ScaleSpec {
  id: string;
  /** `right` = محور دیدنی · `overlay` = مقیاس کمکی مخفی (مثل 10Y در کنار FCI) */
  position: "right" | "overlay";
  mode: "normal" | "percent" | "log";
  visible: boolean;
  /** حاشیهٔ بالاکف/پایین‌کف (۰..۰٫۵) */
  scaleMargins?: { top: number; bottom: number };
}

/** توصیف یک سری (بدون داده — داده در زمان اجرا می‌آید). */
export interface SeriesSpec {
  id: string;
  role: SeriesRole;
  /** کلید i18n برچسب (legend) */
  labelKey: string;
  /** اسلات رنگ در تم (`palette.slots.<colorKey>`) */
  colorKey: string;
  scaleId?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  dashed?: boolean;
  /** نقاط داده (در v3 پیش‌فرض خاموش — فقط خط) */
  markers?: boolean;
}

/** منشأ داده — برای هر سری مشتق/تولیدشده اجباری است. */
export interface Provenance {
  /** شناسهٔ سری‌های منبع (canon یا series_id) */
  sourceSeriesIds: string[];
  /** شناسهٔ فرمول (مثل `fci.composite`, `realRate.policyMinusCpi`) */
  formulaId: string;
  /** اگر UCL/AI ساخته: مدل و هش پرامت (برای حسابرسی) */
  model?: string;
  promptHash?: string;
  createdAt?: string;
}

/** وضعیت دادهٔ یک سری/سیگنال در این رندر. */
export interface SeriesStatus {
  kind: "ok" | "missing" | "stale";
  /** کلید i18n توضیح (مثل `signals.yld.noData`) */
  noteKey?: string;
  noteParams?: Record<string, string | number>;
}

/** توصیف سیگنالها (دامنه‌محور مثل PAS/GAS/FAS یا کتابخانه‌ای مثل ISS). */
export interface SignalsSpec {
  /** شناسه‌های کتابخانهٔ موتور (اختیاری) */
  ids?: string[];
  /** سیگنالهای دامنه (اسم‌دار: pas/gas/fas/real/…) */
  customIds?: string[];
  max: number;
  /** شکست خط بعد از این شناسه‌ها (پیش‌فرض: هیچ = یک خط) */
  breakAfter?: string[];
}

/** مشخصات کامل چارت نسخهٔ ۳. */
export interface ChartSpecV3 {
  /** کلید پایدار چارت مثل `macro.financial.USA` */
  key: string;
  specVersion: string;
  /** نسخهٔ ریاضی/آستانه‌ها (تغییر وزن FCI یا آستانه‌ها ⇒ نسخهٔ نو) */
  mathVersion: string;
  themeVersion: string;
  theme: string;
  /** سیاست پیش‌فرض «بدون داده» این چارت */
  missing: MissingPolicy;
  scales: ScaleSpec[];
  series: SeriesSpec[];
  signals: SignalsSpec;
  /** شناسهٔ لایه‌های روی بوم (باند هدف، رویداد، …) */
  layerIds?: string[];
  layout: {
    zoom: string;
    futureMargin: number;
    /** `bars` = میله‌محور (فصلی ۴ / ماهانه ۱۲) — تا اشتباه گذشته تکرار نشود */
    futureMarginUnit: "bars" | "months";
    signalsSlot: string;
  };
  /** منشأ سری‌های مشتق‌شدهٔ این چارت */
  provenance: Provenance[];
  /** وضعیت دادهٔ سری‌ها (در زمان رندر پر می‌شود) */
  status?: SeriesStatus[];
}

/** نتیجهٔ ولیدیشن (خطاها مانع رندر نیستند ولی در لاگ/تست دیده می‌شوند). */
export interface SpecValidation {
  errors: string[];
  warnings: string[];
}
