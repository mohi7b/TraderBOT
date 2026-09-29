/**
 * ============================================================
 * Chart Reference — قراردادهای مشترک موتور چارت ماژولار
 * frontend/lib/chart/types.ts
 * ============================================================
 * قانون طلایی: **هیچ ظاهر، رنگ، زوم، سیگنال یا لایه‌ای هاردکد نمی‌شود.**
 * چارت فقط «داده» را می‌گیرد و «ظاهر» از بیرون تزریق می‌شود:
 *
 *     <BaseChart data={...} theme={...} layout={...}
 *                signals={...} layers={...} />
 *
 * هر دامنه (Macro · Markets · Energy · Crypto · Trading · Risk) فقط:
 *   ۱) دادهٔ خود را به `ChartSeriesInput[]` تبدیل می‌کند (adapters.ts)
 *   ۲) یک Preset (تم/چینش/سیگنال/لایه) انتخاب یا می‌سازد
 * ============================================================
 */

// ------------------------------------------------------------------
// ۱) دادهٔ چارت — شکل واحد برای همهٔ دامنه‌ها
// ------------------------------------------------------------------
/** نقطهٔ عددی/زمانی (t = ثانیهٔ UNIX). */
export interface ChartPoint {
  t: number;
  value: number;
  /**
   * رنگ **نقطه‌به‌نقطه** (histogram/bar) — دامنهٔ تاریخی از آن برای پنل حجم
   * استفاده می‌کند (سبز/قرمز بر پایهٔ جهت همان کندل). بی‌اثر روی line/area.
   */
  color?: string;
}

/** کندل (Markets/Crypto/Trading). */
export interface ChartBar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** انواع سری قابل‌رسم. */
export type ChartSeriesType =
  | "line"
  | "area"
  | "histogram"
  | "baseline"
  | "bar"
  | "candlestick";

export type ChartLineStyle = "solid" | "dashed" | "dotted";

/**
 * یک سری ورودی چارت — کاملاً داده‌محور.
 * رنگ: `colorKey` (اسلات تم) · `color` (صریح) · هیچ‌کدام (پالت سری).
 */
export interface ChartSeriesInput {
  id: string;
  label?: string;
  type?: ChartSeriesType;
  points?: ChartPoint[];
  bars?: ChartBar[];
  colorKey?: string;
  color?: string;
  /** ضخامت خط — شامل نیمپلهها (۱٫۵ برای موبایل ✓ · ۲٫۵ برای کلاسهای میانی ✓) */
  lineWidth?: 1 | 1.5 | 2 | 2.5 | 3 | 4;
  lineStyle?: ChartLineStyle;
  dashed?: boolean;
  /**
   * نمایش نقاط داده به‌صورت دایره‌های کوچک روی خط
   * (`true` = شعاع پیش‌فرض · یا `{ radius }`) — چارت سیاست پولی.
   */
  markers?: boolean | { radius?: number };
  priceScaleId?: string;
  /**
   * حاشیهٔ مقیاس **اختصاصی این سری** — فقط وقتی `priceScaleId` مقیاسِ کمکی
   * (نه `right`) باشد اعمال می‌شود. کاربرد: **پنل زیرین** (مثل حجم) که در
   * پایین چارت می‌نشیند و مقیاسش مخفی می‌ماند (دامنهٔ تاریخی · H1).
   */
  scaleMargins?: { top: number; bottom: number };
  visible?: boolean;
  hint?: string;
}

// ------------------------------------------------------------------
// ۲) تم (ظاهر و رنگ‌ها) — کاملاً تزریق‌پذیر
// ------------------------------------------------------------------
export interface ChartPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  grid: string;
  axis: string;
  border: string;
  crosshair: string;

  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;

  series: readonly string[];

  pos: string;
  neg: string;
  warn: string;
  neutral: string;

  /** اسلات‌های نام‌دار: headline · core · annualized3m · target · … */
  slots: Readonly<Record<string, string>>;
}

export interface ChartTheme {
  name: string;
  fontFamily: string;
  fontSize: number;
  palette: ChartPalette;
}

/** تم جزئی برای override. */
export interface ChartThemeOverride {
  name?: string;
  fontFamily?: string;
  fontSize?: number;
  palette?: Partial<ChartPalette>;
  slots?: Record<string, string>;
}

// ------------------------------------------------------------------
// ۲.۱) ChartThemeSpec — «قالب نویسندگی تم» (پوشهٔ themes/<family>/)
// ------------------------------------------------------------------
/**
 * ورودی رنگ تم — شکل سبک برای نویسندهٔ تم.
 * همه اختیاری‌اند (از `base` ارث می‌برند) و در `themeSpec.ts`
 * به یک `ChartPalette` کامل نرمال‌سازی می‌شوند:
 *
 *   · کلیدهای رنگ شناخته‌شده → پالت
 *   · `series` آرایه → palette.series · `series` آبجکت → اسلات‌ها
 *   · کلیدهای معنایی (headline/core/targetBand/…) → slots تم
 *
 * ⚠️ افزودن «رنگ معنایی جدید» = افزودن یک کلید اختیاری همین‌جا
 *    (تا خطای کامپایل جای خرابیِ بی‌صدا را بگیرد).
 */
export interface ChartThemePaletteInput extends Partial<Omit<ChartPalette, "series" | "slots">> {
  /** آرایهٔ رنگ عمومی چندسری · یا نگاشت معنایی (headline/core/…) */
  series?: readonly string[] | Record<string, string>;
  /** اسلات‌های دلخواه */
  slots?: Record<string, string>;

  // --- رنگ‌های معنایی شناخته‌شده (به اسلات تم گسترش می‌یابند) ---
  headline?: string;
  core?: string;
  annualized3m?: string;
  target?: string;
  targetBand?: string;
  /** خط هدف ثابت (وقتی low == high) — همان رنگ با ترنسپرنسی بیشتر */
  targetLine?: string;
  /**
   * رنگ‌های **متن مقدار بر پایهٔ جهت** (سه حالت: بالا/پایین/افقی) — جدا از
   * نردبان وضعیت؛ تا متن همیشه سبز/قرمز/سفید خالص بماند.
   */
  valueUp?: string;
  valueDown?: string;
  valueFlat?: string;
  recession?: string;
  projection?: string;
  shock?: string;
  eventHigh?: string;
  eventMedium?: string;
  eventLow?: string;
  signalPos?: string;
  signalNeg?: string;
  signalWarn?: string;
  /** سطح «پرخطر» (نارنجی) — برای سیگنال جامع ISS */
  signalRisk?: string;
  signalInfo?: string;
  signalNeutral?: string;
  badgeBg?: string;
  badgeBorder?: string;
}

/**
 * چینش — نسخهٔ «جزئی تودرتو» (بخش ۳).
 * `Partial<ChartLayout>` برای آبجکت‌های تودرتو (priceScale/timeScale/…)
 * کامل‌بودن را الزامی می‌کند؛ این تایپ اجازهٔ override جزئی می‌دهد.
 */
export type ChartLayoutPartial = Partial<
  Omit<ChartLayout, "grid" | "priceScale" | "timeScale" | "crosshair" | "watermark" | "padding" | "series">
> & {
  grid?: Partial<ChartLayout["grid"]>;
  priceScale?: Partial<ChartLayout["priceScale"]>;
  timeScale?: Partial<ChartLayout["timeScale"]>;
  crosshair?: Partial<ChartLayout["crosshair"]>;
  watermark?: Partial<ChartLayout["watermark"]>;
  /** ضخامت سریها — فقط `thickness` لازم است ✓ */
  series?: Partial<ChartLayout["series"]>;
  /** منسوخ — از `priceScale` استفاده کنید. */
  padding?: Partial<ChartLayout["padding"]>;
  /** میانبر: حاشیهٔ مقیاس قیمت ۰..۱ → priceScale.top/bottom */
  scaleMargins?: { top?: number; bottom?: number };
  /**
   * **پنل‌های زیرین** (دامنهٔ تاریخی · H1): نسبت ارتفاع هر پنل به کندل اصلی.
   * مثال: `{ volume: 0.22 }` ⇒ پنل حجم ۲۲٪ ارتفاع چارت اصلی.
   * ⚠️ طرح‌کلی H1 فقط `volume` را لازم دارد (B3) — بسط آن در H2/H3.
   */
  panes?: { volume?: number };
};

/** چینش تم — همان ChartLayoutPartial (نام صریح برای پوشهٔ تم). */
export type ChartLayoutSpec = ChartLayoutPartial;

/** سیگنال‌های تم — پیش‌فرض دامنه را تکمیل می‌کند (props دامنه برنده است). */
export type ChartSignalsSpec = ChartSignalsConfig;

/** متادیتای تم (نسخه‌گذاری/آرشیو) — ⚠️ هیچ متن کاربری‌ای این‌جا نیست، فقط کلید i18n. */
export interface ChartThemeManifest {
  /** نام تم — اختیاری (اگر باشد باید با spec.name یکی باشد). */
  name?: string;
  family?: string;
  mode?: "light" | "dark" | "any";
  modes?: readonly string[];
  version: string;
  author?: string;
  created?: string;
  /** کلید i18n توضیح تم (مثل themeNames.inflation_modern.description) */
  description_key?: string;
}

/**
 * **UI تم** (بازبینی ششم) — پارامترهای ظاهریِ **کشو/لجند/لمس** که به چیدمان چارت
 * مربوط نیستند ✗ ولی بخشی از «نسخهٔ نمایشی»اند ✓ (پنج نسخهٔ اسکرینی شهریور ✓).
 * همه اختیاریاند ✓ و نبودشان = رفتار فعلی ✓ (بدون شکست ✗).
 */
export interface ChartThemeUi {
  /** عرض کشو — هر CSS width معتبر (مثلاً `"100%"` · `"22rem"`) */
  drawerWidth?: string;
  /** عرض ریل آیکون تب‌ها (px) */
  railWidth?: number;
  /** کمینهٔ ناحیهٔ لمس/کلیک (px) — ۴۴ برای لمس · ۵۶ برای TV ✓ */
  touchTarget?: number;
  /** ستون‌های کتابخانهٔ آیتم‌ها */
  itemColumns?: 1 | 2;
  /** اندازهٔ قلم لجندِ درون‌چارت (px) */
  legendFontSize?: number;
  /** اندازهٔ قلم UI کشو (px) */
  uiFontSize?: number;
  /** شدت انیمیشن — TV «کم» ✓ */
  motion?: "normal" | "reduced";
}

/**
 * قالب تم — چیزی که در `themes/<family>/index.ts` نوشته می‌شود.
 * قاعدهٔ نام‌گذاری: `<family>_<mode>` (مثل inflation_modern_dark).
 */
export interface ChartThemeSpec {
  name: string;
  family?: string;
  mode?: "light" | "dark" | "any";
  /** نام تم پایه برای ارث‌بری (light/dark/terminal/print/…) */
  base?: string;
  fontFamily?: string;
  fontSize?: number;
  palette?: ChartThemePaletteInput;
  layout?: ChartLayoutSpec;
  signals?: ChartSignalsSpec;
  /** 🆕 پارامترهای ظاهریِ کشو/لجند/لمس (نسخه‌های اسکرینی ✓) */
  ui?: ChartThemeUi;
  meta?: { manifest?: ChartThemeManifest };
}

// ------------------------------------------------------------------
// ۳) چینش، زوم و اسلات‌ها
// ------------------------------------------------------------------
export type ZoomPreset =
  | "1M" | "3M" | "6M" | "1Y" | "2Y" | "3Y" | "3Y6M" | "5Y" | "10Y" | "MAX" | "fit";

export interface ZoomRange {
  from: number | string;
  to?: number | string;
}

export type ChartSlotName =
  | "none"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface ChartLayout {
  zoom: ZoomPreset | ZoomRange;
  legend: ChartSlotName;
  signals: ChartSlotName;
  tooltip: "crosshair" | "fixed" | "none";
  grid: { vert: boolean; horz: boolean };
  /**
   * ⚠️ منسوخ و بی‌اثر: حاشیهٔ عمودی مقیاس از `priceScale.top/bottom`
   *    می‌آید (نگاشت مستقیم به scaleMargins در LWC).
   *    فقط برای سازگاری عقب‌رو نگه داشته شده است.
   */
  padding: { top: number; bottom: number };
  /**
   * فضای خالی سمت **راست** نمودار (بر حسب «تعداد دوره»).
   * هدف: خوانایی برچسب‌های محور/توضیحات و دیدن ۳ تا ۶ دورهٔ آینده
   * (پیش‌بینی/فرافکنی). ۰ = بدون فضا.
   */
  futureMargin: number;
  priceScale: {
    /**
     * 🟩 **مرحلهٔ ۲۱** — `false` ✗ ⇒ **هیچ autofit ای روی محور قیمت نیست** ✓
     * (خواستهٔ کاربر ✓). نبودِ مقدار ⇒ رفتار پیشین (`true`) ✓ ⇒ چارت‌های ماکرو
     * دست‌نخورده می‌مانند ✓ (باند هدف باید در دید بماند ✓).
     */
    autoScale?: boolean;
    visible: boolean;
    top: number;
    bottom: number;
    mode: "normal" | "logarithmic" | "percentage";
  };
  timeScale: {
    visible: boolean;
    timeVisible: boolean;
    secondsVisible: boolean;
    rightOffset: number;
    barSpacing: number;
    minBarSpacing: number;
  };
  crosshair: { mode: "normal" | "magnet" | "hidden"; dashed: boolean };
  watermark: { visible: boolean; text?: string };

  // ------------------------------------------------------------------
  // 🆕 بازبینی ششم — پارامترهای نمایشیِ **نسخههای اسکرینی تم** ✓
  // ⛔ همه «افزودنی»اند ✗ و مقدار پیشفرضشان = رفتار امروز ✓ (هیچ شکستی ✗).
  // ------------------------------------------------------------------
  /**
   * **لنگر زوم** — سوئی که پنجرهٔ نمایش به آن قفل می‌شود.
   * `last` = آخرین کندل موجود (پیشفرض ✓ · قرارداد هر ۵ نسخهٔ اسکرینی ✓)
   * `first` = ابتدای داده.
   */
  anchor: "last" | "first";
  /** **ضخامت سریهای overlay** (EMA/SMA/…) — از تم می‌آید ✓ (نه هاردکد در دامنه ✗) */
  series: { thickness: 1 | 1.5 | 2 | 2.5 | 3 | 4 };
  /** سقف ردیف‌های لجندِ درونچارت (`0` = مخفی ✓) */
  legendRows: number;
  /** هدر فریم چارت: کامل · خلاصه (بدون ردیف متا ✓) · مخفی */
  header: "full" | "compact" | "hidden";
  /** سقف `devicePixelRatio` — بودجهٔ پیکسل روی موبایل/TV ✓ */
  dprCap: number;
  /**
   * 🆕 **ارتفاع چارت = کسرِ ارتفاع مفید viewport** (۰..۱) ✓ (نسخه‌های اسکرینی ✓).
   *   · `1` ⇒ تمام ارتفاع ✓ (موبایل) · `1/3` ⇒ یک‌سوم ✓ (مانیتور) · `1/4` ⇒ TV ✓.
   *   · در کلاینت با clamp اعمال می‌شود (کف ۲۸۰ و سقف ۷۲۰px ✓) و نبود ⇒ ارتفاع
   *     ثابت فعلی ✓ (رفتار امروز دست‌نخورده ✗).
   */
  chartViewportRatio?: number;
}


// ------------------------------------------------------------------
// ۴) سیگنال‌ها
// ------------------------------------------------------------------
export type SignalTone = "pos" | "neg" | "warn" | "risk" | "info" | "neutral";

/**
 * قرارداد جهتِ دامنه — کدام سو «مطلوب» است.
 * - `up-is-good` (پیش‌فرض، عمومی): افزایش = مطلوب (pos) · کاهش = نامطلوب (neg)
 * - `up-is-bad` (تورم، بیکاری…): افزایش = نامطلوب (neg) · کاهش = مطلوب (pos)
 */
export type SignalBias = "up-is-good" | "up-is-bad";

export interface ChartSignal {
  id: string;
  /** متن برچسب (همراستا با بقیهٔ سیگنال‌ها) */
  label: string;
  /** متن نمایشی (مثلاً "▲ up" یا "↘↘ 39%") */
  display: string;
  value?: number | null;
  tone: SignalTone;
  /** توضیح کامل (tooltip) — **متن آماده**؛ در v3 ترجیح: `hintKey` */
  hint?: string;
  /**
   * کلید i18n توضیح (`macro.signals.<id>.hint`) — جایگزین `hint` در v3.
   * ⚠️ طبق قرارداد پروژه هیچ متن ثابتی نباید در دامنه باشد؛ موتور این کلید را
   *    با `hintText` (از صفحه/next-intl) به متن ترجمه‌شده تبدیل می‌کند.
   */
  hintKey?: string;
  /** پارامترهای ICU برای ترجمهٔ `hintKey` */
  hintParams?: Record<string, string | number>;
  /** ضخامت/وزن بصری ۱..۳ (فشار) — روی «مقدار» به font-weight نگاشت می‌شود */
  weight?: 1 | 2 | 3;
  /**
   * رنگ متن «مقدار» وقتی با رنگ وضعیت (`tone`) متفاوت است — مثلاً ISS:
   * پس‌زمینه = وضعیت تورمی (۴ سطح) ولی متن مقدار = منطق جهتی (۳ سطح).
   */
  valueTone?: SignalTone;
  /** پس‌زمینهٔ بج از رنگ وضعیت (`tone`) ساخته شود (حالهٔ رنگی) */
  fill?: boolean;
}

/** ورودی محاسبهٔ سیگنال — داده‌محور و دامنه‌آگنوستیک. */
export interface SignalContext {
  series: ChartSeriesInput[];
  /** سری اصلی (اولین سری قابل‌رسم) */
  primary?: ChartSeriesInput;
  /** سری دوم (مثلاً Core در برابر Headline) */
  secondary?: ChartSeriesInput;
  /** هدف تورمی (اختیاری) — برای سنجش «فاصله از هدف» در سیگنال‌های جامع */
  target?: { low: number | null; high: number | null } | null;
  /** قرارداد جهت دامنه (پیش‌فرض `up-is-good`) — برای تورم `up-is-bad` */
  bias?: SignalBias;
}

export interface ChartSignalsConfig {
  /** شناسه‌های سیگنال از کتابخانهٔ داخلی (signals.ts) */
  ids?: string[];
  /** سیگنال‌های آماده از دامنه */
  custom?: ChartSignal[];
  /** محل نمایش (override روی layout.signals) */
  slot?: ChartSlotName;
  /** حداکثر تعداد نمایش */
  max?: number;
  /** استایل پنل/بج‌های سیگنال (پیش‌فرض موتور یا از تم) */
  style?: ChartSignalsStyle;
  /**
   * سیگنال‌هایی که **بعد از** آن‌ها پنل به خط بعد می‌رود (شکست خط اجباری).
   * کاربرد: بج اصلی (مثل PAS) تنها در خط اول و سیگنال‌های فرعی زیر آن.
   */
  breakAfter?: string[];
  /**
   * **بج عریض (دامنهٔ تاریخی · H1)**: آخرین بج پنل سیگنال‌ها (بج «هشدار») با عرض
   * **مضربی** و پس‌زمینه/لبه/متن اختصاصی رسم می‌شود.
   * مثال: `{ factor: 2, background: "slot:warningBg", border: "slot:warningBorder", text: "slot:warningText" }`
   * ⚠️ نبودن این کلید = رفتار فعلی چهار چارت ماکرو، **بدون هیچ تغییر**. */
  wideLast?: { factor?: number; background?: string; border?: string; text?: string };
  /** هدف تورمی — در `SignalContext` تزریق می‌شود تا سیگنال‌ها از آن استفاده کنند */
  target?: { low: number | null; high: number | null } | null;
  /** قرارداد جهت دامنه (پیش‌فرض `up-is-good`) — تورم: `up-is-bad` */
  bias?: SignalBias;
}

/**
 * استایل سیگنال‌ها — قابل تزریق (نه هاردکد در موتور).
 * `background`/`border` رنگ صریح یا ارجاع اسلات می‌پذیرند: "slot:badgeBg".
 */
export interface ChartSignalsStyle {
  /** پنل شفاف (بدون پس‌زمینهٔ سطح) */
  transparent?: boolean;
  /**
   * **بج عریض (دامنهٔ تاریخی · H1)**: آخرین بج پنل سیگنال‌ها (بج «هشدار») با عرض
   * **مضربی** و پس‌زمینه/لبه/متن اختصاصی رسم می‌شود.
   * مثال: `{ factor: 2, background: "slot:warningBg", border: "slot:warningBorder", text: "slot:warningText" }`
   * ⚠️ نبودن این کلید = رفتار فعلی چهار چارت ماکرو، **بدون هیچ تغییر**.
   */
  wideLast?: { factor?: number; background?: string; border?: string; text?: string };
  /** بج‌های هم‌اندازه/تراز (مقدارها زیر هم) */
  uniform?: boolean;
  fontSize?: number;
  /** پس‌زمینهٔ هر بج */
  background?: string;
  /** حاشیهٔ هر بج */
  border?: string;
  /** رنگ متن مقدار */
  textColor?: string;
  /**
   * آلفای «حالهٔ رنگ وضعیت» برای بج‌هایی که `fill: true` دارند
   * (۰..۱ · پیش‌فرض ۰٫۳۵) — هرچه کمتر، پس‌زمینه ملایم‌تر و متن پررنگ‌تر دیده می‌شود.
   */
  statusTint?: number;
  /**
   * آلفای «صفحهٔ زیرین متن مقدار» برای بج‌هایی که `fill: true` دارند
   * (۰..۱ · پیش‌فرض ۰٫۳۵ · ۰ = خاموش) — متن را «جلوتر» می‌آورد تا رنگش
   * با هیوی پس‌زمینه مخلوط نشود و برجسته‌تر دیده شود.
   */
  valuePlate?: number;
}

// ------------------------------------------------------------------
// ۵) لایه‌های بصری (قابل‌فعال/غیرفعال)
// ------------------------------------------------------------------
export interface ChartTimeRange {
  from: number | string;
  to: number | string;
}

export interface TargetBandLayer {
  id: "target-band";
  enabled?: boolean;
  low?: number | null;
  high?: number | null;
  label?: string;
  colorKey?: string;
  drawLines?: boolean;
  fill?: boolean;
}

export interface RecessionLayer {
  id: "recession";
  enabled?: boolean;
  ranges: ChartTimeRange[];
  label?: string;
  colorKey?: string;
}

export interface EventMarkersLayer {
  id: "event-markers";
  enabled?: boolean;
  events: {
    t: number | string;
    label?: string;
    importance?: "low" | "medium" | "high" | "info";
  }[];
  colorKey?: string;
  position?: "aboveBar" | "belowBar" | "inBar";
  paintVerticalLines?: boolean;
}

export interface ProjectionLayer {
  id: "projection";
  enabled?: boolean;
  /** اختیاری — پیش‌فرض: آخرین نقطهٔ دادهٔ سری اول */
  from?: number | string;
  to?: number | string;
  value?: number;
  points?: ChartPoint[];
  colorKey?: string;
  label?: string;
  dashed?: boolean;
  fill?: boolean;
}

export interface ShockIndicatorsLayer {
  id: "shock-indicators";
  enabled?: boolean;
  points: { t: number | string; value: number; tone?: "pos" | "neg" | "warn"; label?: string }[];
  colorKey?: string;
  radius?: number;
}


// ------------------------------------------------------------------
// ۶) زمینهٔ نقاشی لایه‌ها (Overlay canvas)
// ------------------------------------------------------------------
export interface LayerPlotRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// ------------------------------------------------------------------
// نشانگر کراس (دامنهٔ تاریخی · H2)
// ------------------------------------------------------------------
/**
 * یک رویداد کراس برای رسم روی بوم.
 * ⚠️ این لایه **دادهٔ خالص** است (سریالایزپذیر) و نقاشی‌اش در موتور انجام
 * می‌شود: پاس‌دادن تابع `paint` از یک Server Component به Client Component
 * ممنوع است (همان باگ ۵۰۰/Turbopack پروژه).
 */
export interface CrossMarkerPoint {
  /** زمان محور (ثانیه — همان عددی که به LWC داده شده) */
  t: number;
  /** قیمت مرجع جای‌گیری نشانگر (low کندل برای طلایی · high برای مرگ) */
  price: number;
  dir: "golden" | "death";
  /** برچسب کوتاه اختیاری (مثلاً «GC») — فقط اگر `showLabels` روشن باشد */
  label?: string;
}

export interface CrossMarkersLayer {
  id: "cross-markers";
  enabled?: boolean;
  points?: CrossMarkerPoint[];
  /** اندازهٔ نشانگر به px (پیش‌فرض ۵) */
  size?: number;
  /** اسلات رنگ کراس طلایی/مرگ (پیش‌فرض `goldenCross`/`deathCross` تم) */
  goldenColorKey?: string;
  deathColorKey?: string;
  /** نمایش برچسب کنار نشانگر (پیش‌فرض خاموش = تمیز) */
  showLabels?: boolean;
}

// ------------------------------------------------------------------
// نشانگر عمومی سیگنال‌ها (AL · فاز A2)
// ------------------------------------------------------------------
/**
 * یک رویداد سیگنال روی چارت — **دادهٔ خالص** (سریالایزپذیر).
 * شکل/رنگ از `tone` می‌آید (اسلات‌های تم) ⇒ دامنه هیچ رنگی تعیین نمی‌کند.
 */
export interface SignalMarkerPoint {
  /** زمان محور (ثانیه) */
  t: number;
  /** قیمت مرجع جای‌گیری (کف/سقف کندل) */
  price: number;
  /** تُن معنایی: رنگ از تم */
  tone: "pos" | "neg" | "warn" | "risk" | "info" | "neutral";
  /** شکل نشانگر (پیش‌فرض `circle`) */
  shape?: "circle" | "triangle-up" | "triangle-down";
  /** برچسب کوتاه اختیاری (فقط اگر `showLabels`) */
  label?: string;
  /**
   * **provisional** = رویداد هنوز تأیید نشده (`confirmedIndex` بعد از آخرین کندل).
   * موتور آن را **کم‌رنگ و خط‌چین** رسم می‌کند تا با رویداد قطعی اشتباه نشود.
   */
  provisional?: boolean;
}

export interface SignalMarkersLayer {
  id: "signal-markers";
  enabled?: boolean;
  points?: SignalMarkerPoint[];
  size?: number;
  showLabels?: boolean;
}

export interface LayerPaintContext {
  /** بوم ۲بعدی (مختصات CSS px؛ dpr از قبل اعمال شده) */
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  theme: ChartTheme;
  layout: ChartLayout;
  /** تبدیل قیمت → y */
  priceToY: (price: number, scaleId?: string) => number | null;
  /** تبدیل زمان (ثانیه) → x */
  timeToX: (t: number) => number | null;
  /** تبدیل x → زمان */
  xToTime: (x: number) => number | null;
  /** ناحیهٔ رسم (بدون محور قیمت/زمان) */
  plot: LayerPlotRect;
  data: ChartSeriesInput[];
  /** حل رنگ از کلید اسلات تم */
  resolveColor: (key?: string, fallbackIndex?: number) => string;
  /** تبدیل زمان ورودی (رشته/عدد) به ثانیه */
  toSec: (t: number | string) => number | null;
  formatValue?: (v: number) => string;
}

// ------------------------------------------------------------------
// ۷) دستهٔ موتور چارت (استفادهٔ پیشرفتهٔ دامنه)
// ------------------------------------------------------------------
export interface BaseChartHandle {
  /** API خام چارت (نوع دقیق در engine) */
  chart: unknown;
  /** اعمال زوم (preset یا بازهٔ صریح) */
  setZoom: (zoom: ZoomPreset | ZoomRange) => void;
  /** نقاشی مجدد لایه‌ها */
  redraw: () => void;
}

export interface CustomLayer {
  id: string;
  enabled?: boolean;
  /** نقاش دلخواه دامنه — دسترسی کامل به بوم و مختصات */
  paint?: (c: LayerPaintContext, layer: CustomLayer) => void;
}

export type ChartLayer =
  | TargetBandLayer
  | RecessionLayer
  | EventMarkersLayer
  | ProjectionLayer
  | ShockIndicatorsLayer
  | CrossMarkersLayer
  | SignalMarkersLayer
  | CustomLayer;

