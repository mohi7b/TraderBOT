/**
 * CandleChart — چارت کندلی تاریخی (دامنهٔ Historical · H1: BTCUSDT)
 * frontend/components/domain/historical/CandleChart.tsx
 * ============================================================
 * ساختار **عیناً** مثل چارت‌های ماکرو:
 *   ChartFrame (عنوان + ردیف متا + کنترل راست) → BaseChart با تم `shahrivar_hist`.
 *
 * **لایه‌ها:**
 *   ۱) کندل OHLC (`type:"candlestick"`) روی مقیاس راست
 *   ۲) overlayهای EMA21 (سبز فسفری) و SMA50 (آبی) — خط، بدون نقطه،
 *      تهی‌های «دورهٔ گرم‌شدن» **حذف** می‌شوند (هیچ مقدار جعلی رسم نمی‌شود)
 *   ۳) **پنل حجم** روی مقیاس کمکی/مخفی (`hist-volume`) در پایین چارت با
 *      رنگ نقطه‌به‌نقطه (سبز/قرمز بر پایهٔ جهت همان کندل)
 *
 * **سیگنال‌ها (۸ بج در یک خط · B5):** `BTC` اصلی → `TF` → `VENUE` → `CX`
 *   (کراس EMA21/SMA50) → `GAP` → `VOL` → `SPRD` → `WARN` (هشدار، **عرض دوبرابر**).
 *
 * **مرز زمانی (D6):** همهٔ زمان‌ها از `toNyAxisCandles()` می‌آیند ⇒ محور روی
 *   بسته‌شدن نیویورک (۱۶:۰۰ America/New_York) است ولی دادهٔ خام UTC دست‌نخورده
 *   می‌ماند. تبدیل نهایی به **ثانیه** (نیاز LWC) همین‌جا و یک‌بار انجام می‌شود.
 *
 * ⚠️ هیچ رنگ/متن/آستانه‌ای هاردکد نیست: رنگ‌ها از **اسلات‌های تم** و متن‌ها از
 *    `labels` (i18n) می‌آیند. نبود داده = `N/A`، نه عدد ساختگی.
 * ============================================================
 */
import { useMemo, type ReactNode } from "react";
import { BaseChart } from "@/components/base/BaseChart";
import { ChartFrame } from "@/components/base/ChartFrame";
/** P5/4-UI (مورد ۴): لجندِ داخل چارت ⇒ **لینک به Control Center** ✓ (کلاینت ✓) */
import { ChartLegend, type ChartLegendRow } from "./ChartLegend";
import { getThemePreset, getThemeSpec, resolveSlot } from "@/lib/chart/themePresets";
import { CHART_SPEC_VERSION } from "@/lib/chart/spec/version";
import { HISTORICAL_SPEC_VERSION } from "@/lib/chart/spec/historical";
import type { HintTemplates } from "@/lib/chart/spec/hints";
import type { ChartSeriesInput, ChartSignal, SignalTone } from "@/lib/chart/types";
import {
  candleStats,
  detectCross,
  lastCross,
  spreadPct,
} from "@/lib/historical/indicators";
/**
 * **AL (Analysis Layer) — تنها منبع حقیقت اندیکاتورها (D11):**
 * پارامترها از `params.json` و ریاضی از `lib/analysis/indicators/compute/*`.
 * این کامپوننت هیچ فرمولی ندارد؛ فقط خروجی AL را به سری چارت تبدیل می‌کند.
 */
import { buildIndicator, type AxisInput } from "@/lib/analysis/integrations/chart/indicators";
import { paramsFor, paramValue } from "@/lib/analysis/indicators/params.schema";
import { AL_VERSION } from "@/lib/analysis/versioning";
import { collapseAxisCollisions, toNyAxisCandles, type RawCandle } from "@/lib/historical/timeBoundary";
/**
 * **سیگنال‌های AL (A2)** — کراس/جهش حجم/شکست ATR از رجیستری سیگنال می‌آید و
 * به یک لایهٔ مارکر عمومی تبدیل می‌شود (بدون تابع از سرور به کلاینت).
 */
import { buildSignals, signalCountsSummary } from "@/lib/analysis/integrations/chart/signals";
import { computeIndicator } from "@/lib/analysis/indicators/registry";
import type { IndicatorSeries } from "@/lib/analysis/indicators/types";
import { tfWidthMs } from "@/lib/historical/services";
/** C4: متادیتای سرور (نوعی) برای دیاگنوستیک SSR — بدون وابستگی ران‌تایم */
import type { HistoricalMeta } from "@/lib/server/historical";
/** P1.4b — خودآزمون **کامل** هستهٔ V2 (پنج ماژول) در دروازهٔ CI */
import { chartEngineSelfTest } from "@/components/base/engine/core/chartEngine";
/** گارانتی کاملیت تم‌ها (بازبینی هفدهم) — در SSR منتشر می‌شود */
import { themeCompletenessSelfTest } from "@/lib/chart/themeCompleteness";
/** 🆕 بازبینی ششم: وضعیت URL (پریست + نمونه‌ها) برای **رندرِ سری‌های واقعی** ✓ */
import { itemsOf, readInstances } from "@/components/base/engine/core/library";
import { assignInstanceColors } from "@/components/base/engine/core/instanceColors";
import type { ChartState } from "@/components/base/engine/core/profiles";

/**
 * **P1.4b — دروازهٔ خودآزمون هستهٔ V2 (۵ ماژول):** `chartEngineSelfTest` خودآزمون
 * `SeriesRegistry` · `LayerPainter` · `SpecGate` · `InteractionBus` را **ترکیب**
 * می‌کند و بررسی‌های سطح‌پلن `applyPlan` را می‌افزاید (افزایشی ✓ · حذف سری ✓ ·
 * لایهٔ تغییرنیافته skipped ✓ · دروازهٔ قرارداد ⇒ بدون ساخت سری ✗).
 * نتیجه در SSR منتشر می‌شود تا سوئیت‌ها بسنجند ✓ (الگوی `data-al-selftest` ✓).
 */
const ENGINE_SELFTEST_ERRORS = chartEngineSelfTest();
const THEME_SELFTEST_ERRORS = themeCompletenessSelfTest();
const THEME_SELFTEST_ATTR = THEME_SELFTEST_ERRORS.length
  ? `fail:${THEME_SELFTEST_ERRORS.length}`
  : "ok:0";

const ENGINE_SELFTEST_ATTR = ENGINE_SELFTEST_ERRORS.length
  ? `fail:${ENGINE_SELFTEST_ERRORS.length}`
  : "ok:0";

/** تم رسمی این چارت (هم‌خانوادهٔ چارت‌های ماکرو). */
export const HIST_TEMPLATE_THEME = "shahrivar_hist";
/** ارتفاع پیش‌فرض (بلندتر از ماکرو: کندل + پنل حجم). */
/** 🆕 پیش‌فرض ارتفاع (بازبینی دوازدهم ✓): ۳۶۰px — از تم نمی‌آید ✗ (آرگومان صفحه ✓) */
export const HIST_CHART_HEIGHT = 360;
/** شناسهٔ مقیاس **مخفی** پنل حجم (نه `right`) — طبق افزودنی موتور. */
export const HIST_VOLUME_SCALE_ID = "hist-volume";
/** شناسهٔ مقیاس **مخفی** پنل اندیکاتور AL (RSI/MACD · A1). */
export const HIST_PANE_SCALE_ID = "hist-indicator-pane";

/** برچسب «بدون داده» — همان `N/A` یکسان چهار چارت ماکرو. */
const NA = "N/A";

/** متن‌های چارت (از i18n صفحه تزریق می‌شوند — هیچ متن ثابتی در دامنه). */
export interface CandleChartLabels {
  title?: string;
  asOf?: string;
  timeframe?: string;
  venue?: string;
  source?: string;
  legendCandle?: string;
  legendEma?: string;
  legendSma?: string;
  legendVolume?: string;
  /** راهنمای کلیک روی ردیف لجند (از i18n ✓) — متن دکمه/ابزار ✓ */
  legendHint?: string;
  empty?: string;
  error?: string;
  /** برچسب‌های هشت بج سیگنال */
  sigMain?: string;
  sigTf?: string;
  sigVenue?: string;
  sigCross?: string;
  sigGap?: string;
  sigVol?: string;
  sigSpread?: string;
  sigWarn?: string;
  /** مقادیر متنی سیگنال‌ها */
  crossGolden?: string;
  crossDeath?: string;
  crossNone?: string;
  /** هشدار پیش‌فرض وقتی دامنه هشدار خاصی نمی‌دهد ولی داده سالم است */
  warnOk?: string;
  /**
   * قالب‌های ترجمهٔ tooltip سیگنال‌ها (`hist.signals.*.hint` → متن).
   * ⚠️ نوع عمداً `HintTemplates` (همان `Record<string, unknown>` موتور) است، نه
   * `Record<string, string>`: صفحه آبجکت سریالایزپذیر `getMessages()` را پاس
   * می‌دهد و تنگ‌کردن نوع، خطای TS در صفحه می‌سازد (تجربهٔ واقعی همین نشست).
   */
  signalHints?: HintTemplates;
}

/** هشدار دامنه/داده (مثلاً سرویس ناقص، گپ زیاد، کهنگی). */
export interface CandleWarning {
  text: string;
  tone?: SignalTone;
}

export interface CandleChartProps {
  /** کندل‌های خام (ms · UTC) — اصلاح NY داخل همین کامپوننت انجام می‌شود */
  candles: RawCandle[];
  /**
   * **C2 — کندل‌های بسته‌شده (سرور · `data.closed`):** مبنای محاسبهٔ
   * ساختار/سیگنال AL. اگر نیاید (پاسخ شکل قدیمی) ⇒ `candles` استفاده می‌شود
   * ⇒ رفتار قبلی حفظ می‌شود (سازگاری عقب‌رو).
   */
  closed?: RawCandle[];
  /**
   * **C2 — کندل در حال تشکیل (سرور · `data.forming`):** فقط برای رندر
   * provisional و گزارش `data-hist-forming`؛ هرگز مبنای ساختار نیست.
   */
  forming?: RawCandle | null;
  /**
   * **P3-b — پروفایل فعال (از هستهٔ `profiles.ts` · پیش‌فرض `classic` ✓):**
   * فقط برای انتشار در SSR (`data-chart-profile`) و مصرف Control Center ✓.
   */
  profile?: string;
  /**
   * **C4 — متادیتای سرور برای دیاگنوستیک SSR:** پنجرهٔ واقعی (C1) · لنگر ·
   * عقب‌ماندگی · وضعیت کش و زمان پاسخ. هیچ‌کدام در کلاینت محاسبه نمی‌شود.
   * ⚠️ نام `serverMeta` (نه `meta`) چون کامپوننت متغیر داخلی `meta` برای
   *    `ChartFrame` دارد و تداخل نام باعث خطای کامپایل می‌شود.
   */
  serverMeta?: HistoricalMeta | null;
  timeframe: string;
  asset?: string;
  symbol?: string;
  venueLabel?: string;
  locale?: string;
  labels?: CandleChartLabels;
  height?: number;
  /** هشدار بیرونی (از صفحه: سلامت داده/کهنگی) */
  warning?: CandleWarning | null;
  /**
   * پنل اندیکاتور **AL** روی درخواست (`?pane=`) — A1: `rsi` یا `macd`.
   * پیش‌فرض `none` ⇒ همان پنل حجم (ظاهر مصوب کاربر دست‌نخورده).
   */
  pane?: "none" | "rsi" | "macd";
  className?: string;
  right?: ReactNode;
  /**
   * 🆕 **تمِ نسخه‌دار** (بازبینی ششم ✓) — یکی از پنج نسخهٔ اسکرینی خانوادهٔ شهریور
   * (`shahrivar_mobile|tablet|desktop|ultrawide|tv` ✓) یا همان قالب پایه.
   * پیش‌فرض: `HIST_TEMPLATE_THEME` ✓ ⇒ رفتار امروز دست‌نخورده ✓.
   * ⛔ این prop فقط **ظاهر/چیدمان** را عوض می‌کند ✗ — نه پریست و نه داده ✓.
   */
  theme?: string;
  /**
   * 🆕 **وضعیت کامل از URL** (پروفایل + نمونه‌های پارامتری) — از صفحه ✓.
   * با آن، **کلید ON/OFF و پارامترها بلافاصله روی چارت اثر می‌گذارند** ✓
   * (`router.replace` در کشو ⇒ رندر دوبارهٔ سرور ✓). نبود ⇒ فقط کندل ✓.
   */
  chartState?: ChartState | null;
}

/** عدد خوانات با جداکنندهٔ locale (بدون گردکردن گمراه‌کننده). */
function fmt(n: number | null | undefined, locale: string, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

/** شکل فشرده برای سقف/کف ۲۴ کندل (مثل `104.2K`). */
function fmtCompact(n: number | null | undefined, locale: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

/** لحظهٔ UTC به متن خوانا و **قطعی** (بدون اختلاف SSR/کلاینت). */
function fmtUtc(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export function CandleChart({
  candles,
  closed,
  forming,
  serverMeta,
  profile,
  theme: themeProp,
  chartState = null,
  timeframe,
  asset,
  symbol,
  venueLabel,
  locale = "en",
  labels,
  height = HIST_CHART_HEIGHT,
  warning = null,
  pane = "none",
  className,
  right,
}: CandleChartProps) {
  /**
   * 🆕 **تمِ مؤثر** = تمِ نسخه‌دار (prop) یا قالب پایه ✓
   * + پارامترهای نمایشی که **از تم** خوانده می‌شوند (نه هاردکد ✗).
   */
  const themeName = themeProp ?? HIST_TEMPLATE_THEME;
  const theme = getThemePreset(themeName);
  const themeSpec = getThemeSpec(themeName);
  /** ارتفاع پنل حجم — از **layout تم** (نه هاردکد) */
  const volumeRatio = themeSpec?.layout?.panes?.volume ?? 0.22;
  /** 🆕 ضخامت سری‌های overlay (EMA/SMA) — از تم ✓ (پیش‌فرض ۲ = امروز ✓) */
  const seriesThickness = themeSpec?.layout?.series?.thickness ?? 2;
  /** 🆕 سقف ردیف‌های لجند درون‌چارت (`0` = مخفی ✓) */
  const legendRowCap = themeSpec?.layout?.legendRows ?? 8;
  /** 🆕 ارتفاع نهایی = آرگومان صفحه با **کف ۳۶۰px** ✓ (هیچ قاعدهٔ خودکار ✗) */
  /** نگهبان ارتفاع: NaN/undefined ⇒ ۳۶۰px (بازبینی شانزدهم) */
  const finalHeight = Math.max(
    Number.isFinite(height) ? (height as number) : HIST_CHART_HEIGHT,
    HIST_CHART_HEIGHT,
  );
  /** 🆕 حالت هدر: کامل · خلاصه (بدون متا) · مخفی ✓ */
  const headerMode = themeSpec?.layout?.header ?? "full";
  /** 🆕 لنگر/فضای آینده/فاصلهٔ میله — فقط برای **انتشار در SSR** ✓ (موتور از تم می‌خواند ✓) */
  const layoutAnchor = themeSpec?.layout?.anchor ?? "last";
  const layoutFutureMargin = themeSpec?.layout?.futureMargin ?? 0;
  const layoutBarSpacing = themeSpec?.layout?.timeScale?.barSpacing ?? 6;
  const layoutRightOffset = themeSpec?.layout?.timeScale?.rightOffset ?? 2;
  const layoutDprCap = themeSpec?.layout?.dprCap ?? 2;
  /** 🆕 قلم لجند از **UI تم** ✓ (موبایل ۱۱ · TV ۱۴ ✓) */
  const legendFontSize = themeSpec?.ui?.legendFontSize ?? 10;
  /** عرض هر کندل بر حسب ms (از رجیستری تایم‌فریم ✓) */
  const tfWidth = tfWidthMs(timeframe);

  /**
   * D6/TAMC: محور زمان = بسته‌شدن نیویورک · دادهٔ خام UTC دست‌نخورده.
   * ⚠️ `collapseAxisCollisions` **اجباری** است: در لحظهٔ تغییر ساعت دو باکت
   * متوالی به یک زمان NY می‌افتند و LWC با `data must be asc ordered by time`
   * کرش می‌کند (خطای واقعی 2026-09-23 · رفع‌شده در TAMC).
   */
  /**
   * 🟩 **مرحلهٔ ۱۱ — چارت فقط کندل‌های بسته را نشان می‌دهد** (خواستهٔ کاربر ✓):
   *   `closed[]` (سرور · `data.closed` ✓) مبنای سری کندلی است ✓ ⇒ **کندل نیم‌بسته هرگز
   *   روی چارت نمی‌آید** ✗ (آن با بخش **ریل‌تایم** در آینده می‌آید ✓).
   *   اگر پاسخ سرور شکل قدیمی باشد (`closed` نیامده ✗) ⇒ به `candles` برمی‌گردیم ✓
   *   (صفر تغییر رفتار ✓). محور/ساختار/اندیکاتورها هم روی همین مبنا بسته می‌شوند ✓
   *   ⇒ دیگر «۲۵ کندل پنج‌دقیقه‌ای که یکیشان نیم‌بسته است» نداریم ✓.
   */
  const seriesCandles = closed && closed.length > 0 ? closed : candles;
  const axis = useMemo(
    () => collapseAxisCollisions(toNyAxisCandles(seriesCandles, timeframe)),
    [seriesCandles, timeframe],
  );
  const closes = useMemo(() => axis.map((c) => c.close), [axis]);
  /**
   * **ورودی AL:** سری محور (زمان ثانیه + بسته‌شدن + کندل‌ها).
   * همهٔ اندیکاتورها روی **همین** سری محاسبه می‌شوند تا با آنچه رسم می‌شود
   * یکی باشند (شامل ادغام DST).
   */
  const alAxis = useMemo<AxisInput>(
    () => ({
      times: axis.map((c) => Math.floor(c.axisTime / 1000)),
      closes,
      candles: axis.map((c) => ({
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    }),
    [axis, closes],
  );
  /** پارامترها از AL (پیش‌فرض‌های `params.json`) — نه عدد هاردکد در چارت */
  const emaParams = useMemo(() => paramsFor("ema"), []);
  const smaParams = useMemo(() => paramsFor("sma"), []);
  /**
   * **C2 — محور مبنا برای ساختار/سیگنال **و اندیکاتورها** = `closed[]`:**
   *  · چرا: کندل نیم‌کاره می‌تواند کراس/BOS/CHoCH/FVG **و EMA/SMA** را تا
   *    بسته‌شدن جابه‌جا کند (repaint). همهٔ ریاضی روی کندل بسته اجرا می‌شود
   *    (تصمیم صریح کاربر: «اندیکاتورها فقط روی کندل‌های بسته‌شده»).
   *  · پیاده‌سازی با **برش دنبالهٔ همان `alAxis`** ⇒ هم‌شکل و هم‌طول‌سازگار
   *    (هیچ ریسک off-by-one در zip سری‌ها) و اگر `forming` نبود ⇒ no-op.
   *  · ⚠️ این بلوک باید **پیش از نخستین مصرف‌کننده** (اندیکاتورها) باشد.
   */
  const sigAxis = useMemo<AxisInput>(() => {
    /**
     * برش فقط وقتی انجام می‌شود که سرور `closed` داده باشد **و** دقیقاً
     * «همان محور منهای یک کندل آخر» باشد ⇒ برش **قابل‌اثبات**، نه فرضی.
     * (اگر `closed` نیامد یا منطبق نبود ⇒ no-op ⇒ رفتار قبلی.)
     */
    const drop = forming && closed && closed.length === alAxis.times.length - 1 ? 1 : 0;
    if (drop === 0) return alAxis;
    return {
      ...alAxis,
      times: alAxis.times.slice(0, -1),
      closes: alAxis.closes.slice(0, -1),
      /** `candles` در `AxisInput` اختیاری است ⇒ نگهبان تایپ (بدون کرش) */
      candles: alAxis.candles ? alAxis.candles.slice(0, -1) : alAxis.candles,
    };
  }, [alAxis, closed, forming]);
  const emaBuilt = useMemo(
    () => buildIndicator({ id: "ema", params: emaParams, colorKey: "emaFast" }, sigAxis),
    [sigAxis, emaParams],
  );
  const smaBuilt = useMemo(
    () => buildIndicator({ id: "sma", params: smaParams, colorKey: "smaSlow" }, sigAxis),
    [sigAxis, smaParams],
  );
  /** سری‌های سیگنال = **همان** محاسبهٔ AL (بدون تکرار ریاضی) */
  const emaFast = emaBuilt.values;
  const smaSlow = smaBuilt.values;
  const crosses = useMemo(() => detectCross(emaFast, smaSlow), [emaFast, smaSlow]);
  const cross = useMemo(() => lastCross(crosses), [crosses]);
  const crossCount = useMemo(() => crosses.filter((c) => c !== null).length, [crosses]);
  /**
   * **A2 — سیگنال‌های AL:** کراس (از سری‌های EMA/SMA)، جهش حجم و شکست ATR.
   * ATR فقط برای سیگنال محاسبه می‌شود (سری رسم نمی‌شود) و همه چیز از رجیستری
   * سیگنال AL می‌آید ⇒ چارت هیچ منطق سیگنالی ندارد.
   */
  const atrValues = useMemo(() => {
    const res = computeIndicator("atr", { closes, candles: alAxis.candles });
    return res.result as IndicatorSeries;
  }, [closes, alAxis]);
  /** RSI از AL — ورودی سیگنال دایورجنس (سری رسم نمی‌شود؛ فقط تحلیل) */
  const rsiValues = useMemo(() => {
    const res = computeIndicator("rsi", { closes });
    return res.result as IndicatorSeries;
  }, [closes]);
  /* (C2) `sigAxis` پیش از مصرف‌کننده‌ها اعلام می‌شود — بلوک بالا (بالاتر از اندیکاتورها) منتقل شد. */
  const signalsBuilt = useMemo(
    () =>
      buildSignals({
        /** C2: مبنا = `closed[]` (کندل در حال تشکیل وارد ساختار/کراس نمی‌شود) */
        times: sigAxis.times,
        closes: sigAxis.closes,
        candles: sigAxis.candles,
        series: {
          ema21: emaFast,
          sma50: smaSlow,
          atr: atrValues,
          [`rsi${paramValue("rsi", "period")}`]: rsiValues,
        },
        /**
         * **سیاست شلوغی چارت (مصوب 2026-09-23):** فقط ساختارهای مهم روی بوم:
         * کراس Golden/Death · شکست ساختاری (BOS/CHoCH) · FVGهای **پرنشده**.
         * بقیهٔ سیگنال‌ها (حجم/ATR/الگو/دایورجنس) محاسبه و در `data-al-signals`
         * منتشر می‌شوند ولی رسم **نمی‌شوند** تا پنل مدیریت لایه‌ها (کار بعدی)
         * بتواند هر لحظه روشن‌شان کند.
         */
        display: ["cross", "structure", "fvg"],
      }),
    [sigAxis, emaFast, smaSlow, atrValues, rsiValues],
  );
  const chartLayers = useMemo(() => [signalsBuilt.layer], [signalsBuilt]);
  const spread = useMemo(() => spreadPct(emaFast, smaSlow), [emaFast, smaSlow]);
  const stats = useMemo(() => candleStats(candles, tfWidth), [candles, tfWidth]);

  /**
   * پنل AL درخواستی (`?pane=rsi|macd` · A1) — پیش‌فرض هیچ (همان ظاهر فعلی).
   * ⚠️ در هر لحظه فقط **یک** پنل: موتور فعلاً همهٔ مقیاس‌های کمکی را با یک
   * حاشیه می‌چیند؛ استک‌کردن چند پنل کار A2 است.
   */
  /** 🆕 نمونهٔ **روشن**ِ پنلدار از وضعیت (rsi/macd) ⇒ پنل از URL ✓ (آنّی ✓) */
  const statePane = useMemo(
    () =>
      (chartState?.modules.indicators.on ?? true)
        ? itemsOf("indicators").find(
            (sp) => sp.pane && readInstances(chartState?.modules.indicators.params, sp).some((i) => i.on),
          )
        : undefined,
    [chartState],
  );

  const paneBuilt = useMemo(() => {
    /**
     * 🆕 **پنل از وضعیت URL** (بازبینی ششم ✓): اگر نمونه‌ای از `rsi`/`macd`
     * **روشن** باشد ⇒ همان پنل ✓ (کلید ON/OFF آنی ✓)؛ وگرنه `?pane=` سنّتی ✓.
     */
    const id = statePane?.alId ?? (pane === "rsi" || pane === "macd" ? pane : null);
    if (!id) return null;
    return buildIndicator(
      {
        id,
        output: "line",
        paneScaleId: HIST_PANE_SCALE_ID,
        paneHeightRatio: volumeRatio,
        colorKey: statePane?.colorKey ?? "signalInfo",
        label: (statePane?.fallbackLabel ?? pane).toUpperCase(),
      },
      alAxis,
    );
  }, [statePane, pane, alAxis, volumeRatio]);

  /**
   * 🆕 **سری‌های دینامیک از وضعیت URL (بازبینی ششم)** — «کلید ON/OFF آنی» ✓:
   * نمونه‌های **روشنِ** ماژول `indicators` (هر تعداد ✓) با **پارامتر خودشان** از
   * AL محاسبه می‌شوند ⇒ خاموش/روشن‌کردن در کشو **بلافاصله** روی چارت اثر می‌گذارد ✓.
   * ⛔ هیچ داده‌ای ساخته نمی‌شود ✗ (همه از AL ✓) و پیش‌فرضِ پریست `pro` عیناً همان
   *    EMA21/SMA50 امروز است ✓ ⇒ تغییر بصری صفر ✓.
   */
  const dynamicOverlays = useMemo(() => {
    const rows: ChartLegendRow[] = [];
    const out: ChartSeriesInput[] = [];
    /** 🆕 **کلید هدرِ بخش** هم اثر دارد: بخش خاموش ⇒ هیچ سری‌ای رسم نمی‌شود ✗ */
    const moduleOn = chartState?.modules.indicators.on ?? true;
    /** 🆕 رنگ هر نمونه از قالب (نمونهٔ دوم/سوم هم‌رنگ نیستند ✓) */
    const colorMap = assignInstanceColors(
      itemsOf("indicators").map((sp) => ({ key: sp.key, colorKey: sp.colorKey })),
      (key) => {
        const sp = itemsOf("indicators").find((x) => x.key === key);
        return sp ? readInstances(chartState?.modules.indicators.params, sp).length : 0;
      },
      (ref, i) => resolveSlot(theme, ref, i),
    );
    if (!moduleOn) return { series: out, rows };
    for (const spec of itemsOf("indicators")) {
      const insts = readInstances(chartState?.modules.indicators.params, spec);
      insts.forEach((inst, index) => {
        if (!inst.on || !spec.alId || spec.pane) return;
        try {
          const built = buildIndicator(
            { id: spec.alId, params: inst.values, output: "line", colorKey: spec.colorKey },
            sigAxis,
          );
          built.series.forEach((s, si) => {
            const baseId = built.ids[si] ?? spec.fallbackLabel;
            /**
             * ⚠️ **یکتا بودن شناسهٔ سری** (باگ واقعیِ همین سنجش ✗): دو نمونهٔ
             * `ema` با دوره‌های متفاوت، از AL شناسهٔ یکسان می‌گرفتند ⇒ رجیستری
             * سریِ دوم را «به‌روزرسانیِ اولی» می‌دید و یکی از خطوط رسم نمی‌شد ✗.
             * ⇒ شناسهٔ نهایی = شناسهٔ AL + اندیسِ نمونه (نمونهٔ اول بدون پسوند ✓).
             */
            const uid = index > 0 ? `${baseId}_${index}` : baseId;
            /** 🆕 رنگ نمونه: اولی = رنگ آیتم ✓ · دومی/سومی = از پالت قالب (بدون تضاد ✓) */
            const instColor = colorMap[`${spec.key}#${index}`];
            const seriesColor = si === 0 && instColor ? instColor : resolveSlot(theme, spec.colorKey, si);
            out.push({
              ...s,
              id: uid,
              color: seriesColor,
              lineWidth: seriesThickness,
              priceScaleId: "right",
              label: baseId,
            });
            rows.push({
              module: "indicators",
              key: spec.key,
              index,
              label: baseId,
              color: seriesColor,
            });
          });
        } catch {
          /** محاسبهٔ ناموفق ⇒ **هیچ سری ساختگی** ساخته نمی‌شود ✗ (سکوت امن ✓) */
        }
      });
    }
    return { series: out, rows };
  }, [chartState, sigAxis, seriesThickness, theme]);

  /** کندل + overlayهای AL + **یک پنل** (اندیکاتور درخواستی یا حجم) */
  const chartData = useMemo<ChartSeriesInput[]>(() => {
    const toSec = (ms: number) => Math.floor(ms / 1000);
    const bars = axis.map((c) => ({
      t: toSec(c.axisTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const out: ChartSeriesInput[] = [
      {
        id: "candles",
        label: labels?.legendCandle ?? asset ?? symbol ?? "OHLC",
        type: "candlestick",
        bars,
        colorKey: "candleUp",
      },
      /** overlayها: **از وضعیت URL** (نمونه‌های روشن ✓) — هر آیتم/نمونه با پارامتر خودش از AL ✓ */
      ...dynamicOverlays.series,
    ];

    if (paneBuilt) {
      out.push({ ...paneBuilt.series[0]!, label: paneBuilt.ids[0] });
    } else if (axis.some((c) => typeof c.volume === "number")) {
      /** پنل حجم — فقط اگر دادهٔ حجم وجود داشته باشد (هیچ سری ساختگی ساخته نمی‌شود) */
      out.push({
        id: "volume",
        label: labels?.legendVolume ?? "Volume",
        type: "histogram",
        points: axis.map((c) => ({
          t: toSec(c.axisTime),
          value: c.volume ?? 0,
          color: c.close >= c.open ? resolveSlot(theme, "volumeUp") : resolveSlot(theme, "volumeDown"),
        })),
        colorKey: "volumeUp",
        priceScaleId: HIST_VOLUME_SCALE_ID,
        scaleMargins: { top: Math.min(0.9, 1 - volumeRatio), bottom: 0 },
      });
    }
    return out;
  }, [
    axis,
    theme,
    paneBuilt,
    volumeRatio,
    /** 🆕 سری‌های دینامیک از وضعیت URL ✓ (شامل ضخامت تم ✓) */
    dynamicOverlays,
    labels,
    asset,
    symbol,
  ]);

  /**
   * **هشت بج سیگنال در یک خط** (B5): `BTC` اصلی → `TF` → `VENUE` → `CX` →
   * `GAP` → `VOL` → `SPRD` → `WARN` (هشدار = بج **عریض**، استایلش از تم).
   * همه مقادیر از داده محاسبه می‌شوند؛ ناموجود ⇒ `N/A` (بدون عدد جعلی).
   */
  const signals = useMemo<ChartSignal[]>(() => {
    const changePct = stats.changePct;
    const dirTone: SignalTone =
      changePct === null ? "neutral" : changePct > 0 ? "pos" : changePct < 0 ? "neg" : "neutral";
    const crossText = cross
      ? cross.dir === "golden"
        ? (labels?.crossGolden ?? "GOLDEN")
        : (labels?.crossDeath ?? "DEATH")
      : (labels?.crossNone ?? NA);
    const crossTone: SignalTone = cross ? (cross.dir === "golden" ? "pos" : "neg") : "neutral";
    const volZ = stats.volumeZ;
    const volTone: SignalTone = volZ !== null && Math.abs(volZ) >= 2 ? "warn" : "neutral";
    const dataUnhealthy = stats.gaps.maxGapBars > 0 || stats.gaps.coverage < 0.98;
    const warnTone: SignalTone = warning?.tone ?? (dataUnhealthy ? "warn" : "neutral");
    const warnText =
      warning?.text ??
      (dataUnhealthy ? `${stats.gaps.gaps}×${stats.gaps.maxGapBars}` : (labels?.warnOk ?? NA));
    const pct = (v: number | null) =>
      v === null ? NA : `${v >= 0 ? "+" : ""}${fmt(v, locale, 2)}%`;
    const out: ChartSignal[] = [
      {
        id: "btc",
        label: labels?.sigMain ?? symbol ?? asset ?? "BTC",
        display: `${fmt(stats.last, locale)} · ${pct(changePct)}`,
        value: stats.last,
        tone: dirTone,
        valueTone: dirTone,
        weight: 2,
        fill: true,
        hintKey: "hist.signals.btc.hint",
      },
      {
        id: "tf",
        label: labels?.sigTf ?? "TF",
        display: timeframe,
        tone: "info",
        hintKey: "hist.signals.tf.hint",
      },
      {
        id: "venue",
        label: labels?.sigVenue ?? "VENUE",
        display: venueLabel ?? "ALL",
        tone: "info",
        hintKey: "hist.signals.venue.hint",
      },
      {
        id: "cross",
        label: labels?.sigCross ?? "CX",
        display: cross ? `${crossText} · ${cross.barsAgo}` : crossText,
        tone: crossTone,
        valueTone: crossTone,
        hintKey: "hist.signals.cross.hint",
        hintParams: { fast: paramValue("ema", "period"), slow: paramValue("sma", "period") },
      },
      {
        id: "gap",
        label: labels?.sigGap ?? "GAP",
        display: String(stats.gaps.gaps),
        tone: stats.gaps.gaps > 0 ? "warn" : "neutral",
        hintKey: "hist.signals.gap.hint",
        hintParams: {
          max: stats.gaps.maxGapBars,
          coverage: Math.round(stats.gaps.coverage * 1000) / 10,
        },
      },
      {
        id: "vol",
        label: labels?.sigVol ?? "VOL",
        display: volZ === null ? NA : fmt(volZ, locale, 2),
        tone: volTone,
        hintKey: "hist.signals.vol.hint",
      },
      {
        id: "spread",
        label: labels?.sigSpread ?? "SPRD",
        display: pct(spread),
        tone: spread === null ? "neutral" : spread >= 0 ? "pos" : "neg",
        hintKey: "hist.signals.spread.hint",
      },
      {
        id: "warn",
        label: labels?.sigWarn ?? "WARN",
        display: warnText,
        tone: warnTone,
        valueTone: warnTone,
        weight: 2,
        hintKey: "hist.signals.warn.hint",
      },
    ];
    return out;
  }, [stats, cross, spread, timeframe, venueLabel, labels, locale, asset, symbol, warning]);

  const hasData = axis.length > 0;
  const lastCandle = axis[axis.length - 1] ?? null;
  const emaLast = emaFast[emaFast.length - 1] ?? null;
  const smaLast = smaSlow[smaSlow.length - 1] ?? null;
  const hasVolume = chartData.some((s) => s.id === "volume");

  /**
   * **P5/4-UI (مورد ۴) — ردیف‌های لجندِ داخل چارت = سری‌های واقعیِ رسم‌شده ✓**
   *   · برچسب از i18n ✓ · رنگ از **همان `colorKey`** سری و **همان تم** ✓
   *     (پس رنگ لجند = رنگ خط چارت = رنگ آیتم در کشو ✓ سه‌جا یکی ✓).
   *   · مقدار = آخرین مقدار محاسبه‌شدهٔ AL ✓ (هیچ عدد ساختگی ✗).
   *   · ساختار **سریالایزپذیر** ✓ چون از Server به Client می‌رود ✓.
   */
  const legendRows = useMemo<ChartLegendRow[]>(() => {
    /** 🆕 ردیف‌ها = **همان سری‌های دینامیکِ رسم‌شده** ✓ (لجند ↔ کشو یکی ✓) */
    const rows: ChartLegendRow[] = [...dynamicOverlays.rows];
    if (paneBuilt) {
      rows.push({
        module: "indicators",
        key: statePane?.key ?? (pane === "macd" ? "macd" : "rsi"),
        index: 0,
        label: paneBuilt.ids[0] ?? pane.toUpperCase(),
        color: resolveSlot(theme, statePane?.colorKey ?? "signalInfo", 2),
      });
    }
    return legendRowCap > 0 ? rows.slice(0, legendRowCap) : [];
  }, [dynamicOverlays, paneBuilt, statePane, pane, theme, legendRowCap]);

  const meta = (
    <>
      <span>
        {labels?.asOf ?? "As of"}:{" "}
        <span className="font-medium text-foreground">
          {lastCandle ? fmtUtc(lastCandle.utcTime, locale) : "—"}
        </span>
      </span>
      <span>
        {labels?.timeframe ?? "TF"}:{" "}
        <span className="font-medium text-foreground">{timeframe}</span>
      </span>
      <span>
        {labels?.venue ?? "Venue"}:{" "}
        <span className="font-medium text-foreground">{venueLabel ?? "ALL"}</span>
      </span>
      <span>
        H/L:{" "}
        <span className="font-medium text-foreground">{fmtCompact(stats.high, locale)}</span> /{" "}
        <span className="font-medium text-foreground">{fmtCompact(stats.low, locale)}</span>
      </span>
      <span
        title={`candles=${axis.length} · gaps=${stats.gaps.gaps} · coverage=${stats.gaps.coverage.toFixed(4)}`}
      >
        {labels?.source ?? "Source"}: historical /tf (UTC buckets · NY-close axis)
      </span>
    </>
  );

  return (
    <div
      data-hist-symbol={symbol ?? asset ?? ""}
      data-hist-tf={timeframe}
      data-hist-venue={venueLabel ?? "ALL"}
      data-hist-candles={axis.length}
      data-hist-gaps={stats.gaps.gaps}
      data-hist-gap-max-bars={stats.gaps.maxGapBars}
      data-hist-coverage={stats.gaps.coverage.toFixed(4)}
      data-hist-cross={cross ? `${cross.dir}:${cross.barsAgo}` : "none"}
      data-hist-cross-count={crossCount}
      data-hist-cross-markers={crossCount}
      data-al-signals={signalCountsSummary(signalsBuilt.counts)}
      data-al-markers={signalCountsSummary(signalsBuilt.displayCounts)}
      data-al-provisional={signalsBuilt.provisionalCount}
      /* C2: مبنای محاسبهٔ ساختار/سیگنال + وضعیت کندل در حال تشکیل */
      data-al-basis={forming ? "closed" : "closed+forming"}
      data-al-basis-bars={sigAxis.times.length}
      /* P1.2c: خودآزمون هستهٔ V2 در SSR (ok:0 = سالم ✓ · fail:N = N خطا ✗) */
      data-engine-selftest={ENGINE_SELFTEST_ATTR}
      /* انتشار **همهٔ** خطاها (با « | ») — درس چک زنده: قبلاً فقط اولی دیده می‌شد ✗ */
      data-engine-selftest-first={ENGINE_SELFTEST_ERRORS.join(" | ")}
      /* کاملیت تم‌های خانوادهٔ شهریور (ok:0 = همه کامل) */
      data-theme-selftest={THEME_SELFTEST_ATTR}
      data-theme-selftest-first={THEME_SELFTEST_ERRORS.join(" | ")}
      data-hist-forming={
        forming && Number.isFinite(forming.timestamp)
          ? new Date(forming.timestamp).toISOString()
          : "none"
      }
      /* C4: پنجره/لنگر/عقب‌ماندگی/کش — همه از گزارش سرور (قابل‌بازرسی در SSR) */
      data-hist-window={
        serverMeta?.from != null && serverMeta?.to != null
          ? `${new Date(serverMeta.from).toISOString()}..${new Date(serverMeta.to).toISOString()}`
          : "none"
      }
      data-hist-anchored={serverMeta?.anchored ? "1" : "0"}
      data-hist-lag={serverMeta?.lagSeconds != null ? String(serverMeta.lagSeconds) : "none"}
      data-hist-cache={serverMeta?.cached ? "hit" : "miss"}
      data-hist-ms={serverMeta?.ms != null ? String(serverMeta.ms) : "none"}
      data-al-signal-formulas={Object.entries(signalsBuilt.formulaVersions)
        .map(([k, v]) => `${k}:${v}`)
        .join(",")}
      data-hist-ema21={emaLast ?? "na"}
      data-hist-sma50={smaLast ?? "na"}
      data-hist-volume={hasVolume ? "1" : "0"}
      data-hist-pane={pane}
      data-al-version={AL_VERSION}
      data-al-formula={`ema:${emaBuilt.formulaVersion},sma:${smaBuilt.formulaVersion}`}
      data-al-params={`ema:${emaParams.period},sma:${smaParams.period}`}
      data-hist-pane-ratio={volumeRatio}
      data-hist-time-boundary="utc-21"
      /* P3-b: پروفایل فعال (SSR-قابل‌بازرسی ⇒ سنجش و اسکرین‌شات مارکتینگ ✓) */
      data-chart-profile={profile ?? "classic"}
      /*
       * 🆕 **بازبینی ششم** — تمِ نسخه‌دار + پارامترهای نمایشیِ آن (همه قابل‌بازرسی ✓)
       * ⛔ هیچ‌کدام داده/پریست را عوض نمی‌کنند ✗ (فقط ظاهر و چیدمان ✓).
       */
      data-chart-theme={themeName}
      data-chart-anchor={layoutAnchor}
      data-chart-future-margin={String(layoutFutureMargin)}
      data-chart-bar-spacing={String(layoutBarSpacing)}
      data-chart-right-offset={String(layoutRightOffset)}
      data-chart-series-thickness={String(seriesThickness)}
      data-chart-header={headerMode}
      data-chart-legend-rows={String(legendRowCap)}
      data-chart-dpr-cap={String(layoutDprCap)}
      data-chart-height-ratio={String(themeSpec?.layout?.chartViewportRatio ?? "none")}
      data-chart-font={String(theme.fontSize)}
      /* 🟩 مرحلهٔ ۲۱ — بازرسی: autofit خاموش است ✓ */
      data-chart-autoscale="off"
      data-warning={warning?.text ?? ""}
      /* v3.1: نسخهٔ قرارداد دامنه + نسخهٔ پایهٔ ماکرو (قابل‌بازرسی در SSR) */
      data-spec-version={HISTORICAL_SPEC_VERSION}
      data-base-spec-version={CHART_SPEC_VERSION}
      data-missing-policy="na"
      data-points={chartData
        .map((s) => `${s.id}:${s.bars?.length ?? s.points?.length ?? 0}`)
        .join(",")}
      className={className}
    >
      <ChartFrame
        /**
         * 🆕 **حالت هدر از تم** (بازبینی ششم ✓):
         *   · `full`    ⇒ عنوان + ردیف متا (امروز ✓)
         *   · `compact` ⇒ فقط عنوان (موبایل ✓ — جا برای چارت)
         *   · `hidden`  ⇒ بدون هدر ✗ (چارت تمامقد ✓)
         */
        title={headerMode === "hidden" ? undefined : (labels?.title ?? `${symbol ?? asset ?? "BTCUSDT"} — ${timeframe}`)}
        meta={headerMode === "full" ? meta : undefined}
        right={headerMode === "full" ? right : undefined}
        state={hasData ? "ready" : "empty"}
        height={finalHeight}
        emptyText={labels?.empty ?? "No candle data for this asset/venue/timeframe"}
        errorText={labels?.error ?? "Failed to load"}
      >
        <div className="relative">
          <BaseChart
          data={chartData}
          themeName={themeName}
          /**
           * 🟩 **مرحلهٔ ۲۱** — **بدون autofit** (خواستهٔ کاربر ✓): مقیاس قیمت این
           * چارت **خودکار تغییر نمی‌کند** ✗؛ کاربر خودش با محور قیمت (درگ/چرخ ✓)
           * کادر را تنظیم می‌کند ✓. (چارت‌های ماکرو این override را ندارند ✓.)
           */
          layout={{ priceScale: { autoScale: false } }}
          /* H2: لایهٔ نشانگر کراس (داده از سرور · نقاشی در موتور) */
          layers={chartLayers}
          /* سیگنال‌ها داده‌محور از دامنه (مثل PAS/GAS)؛ ids/استایل از تم */
          signals={{ custom: signals }}
          height={finalHeight}
          locale={locale}
          labels={{ empty: "—", error: labels?.error ?? "chart error" }}
          /* v3: قالب‌های ترجمهٔ tooltip سیگنال‌ها (دادهٔ سریالایزپذیر) */
          signalHints={labels?.signalHints}
          /**
           * 🟩 **مرحلهٔ ۲۴** — فقط **دامنهٔ داده** بازساخت می‌دهد ✓:
           *   `timeframe`/`symbol` (تغییر معنایی ✓). طول داده و جهت کراس **حذف شدند** ✗
           *   چون به‌روزرسانی/افزودن سری‌ها از مسیر **افزایشی** می‌آید ✓ ⇒ دیگر هیچ
           *   بازساختی با کندل تازه یا روشن/خاموش کردن اندیکاتور رخ نمی‌دهد ✓✓.
           */
          deps={[timeframe, symbol ?? asset ?? ""]}
          /* زنده: حفظ زوم/اسکرول کاربر در رفرش‌های کندل تازه (کلید = نماد|تایم‌فریم) */
          viewKey={`${symbol ?? asset ?? ""}|${timeframe}`}
        />
          {/*
           * ④ لجندِ داخل چارت ⇒ کلیک روی هر ردیف، همان آیتم را در Control Center
           * باز می‌کند ✓ (رویداد `cc:focus` ✓) و هاور دوطرفه هایلایت می‌کند ✓.
           */}
          <ChartLegend rows={legendRows} hint={labels?.legendHint} fontSize={legendFontSize} />
        </div>
      </ChartFrame>
    </div>
  );
}

