"use client";

/** P1.1 — نگهبان ترتیب زمانی (اکنون همراه `SeriesRegistry` در import پایین‌تر ✓) */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/components/providers/ThemeProvider";
import { getThemePreset, getThemeSpec, mergeTheme, resolveSlot, resolveThemeName } from "@/lib/chart/themePresets";
import { normalizeLayoutSpec, resolveColorRef } from "@/lib/chart/themeSpec";
import { buildChartOptions, expandRangeForTarget, type LwcFormatOptions } from "@/lib/chart/lwcOptions";
import { assumedCardColor, statusBadgePaint } from "@/lib/chart/colorMath";
import { DEFAULT_LAYOUT, mergeLayout, resolveZoomRange, toUnixSec, zoomLabel } from "@/lib/chart/layout";
/** دروازهٔ همگام‌سازی تم/اسکرین (بازبینی شانزدهم) */
import { isScreenSyncDone, onScreenSync } from "@/components/domain/historical/screenSyncState";
/** 🟩 مرحلهٔ ۳ — **ماژول واحد مدیریت نما** (کلید یکتا · زمان‌محور · انقضا ۱۲h · آفست ۱۵۰px) */
import {
  INITIAL_OFFSET_PX,
  persistKeyOf,
  restoreOffsetPx,
  clearPriceRange,
  restorePriceRange,
  restoreView,
  saveOffsetPx,
  savePriceRange,
  saveView,
  viewAgeMs,
  viewPersistenceSelfTest,
} from "@/lib/chart/viewPersistence";
/** 🆕 قاعده‌های مصوب کاربر: ارتفاع و فضای راست ✓ (تک‌نسخه ✓) */
import { paintLayers } from "@/lib/chart/layers";
/** P1.2b — زمان‌بند رسم از هستهٔ V2 (ادغام در یک فریم؛ رفتار بی‌تغییر ✗) */
import { createRedrawScheduler, LayerPainter, type RedrawScheduler } from "./engine/core/layerPainter";
/** P1.4b/۲ — حافظهٔ نما از هستهٔ V2 (بازپس‌گیری زوم با اعتبارسنجی ✓) */
/** P1.4b/۳ — ثبت‌خانهٔ سری‌ها از هستهٔ V2 (مسیر افزایشی P2 ✓) */
import { SeriesRegistry, orderPoints, type SeriesPoint } from "./engine/core/seriesRegistry";
import { computeSignals } from "@/lib/chart/signals";
import { resolveHint } from "@/lib/chart/spec/hints";
import { seriesTimeBounds, visibleSeries } from "@/lib/chart/adapters";
import { cn } from "@/lib/utils";
import type {
  BaseChartHandle,
  ChartLayer,
  ChartLayout,
  ChartLayoutPartial,
  ChartSeriesInput,
  ChartSignal,
  ChartSignalsConfig,
  LayerPaintContext,
  SignalContext,
  TargetBandLayer,
  ZoomPreset,
  ZoomRange,
} from "@/lib/chart/types";

/**
 * ============================================================
 * BaseChart — چارت مرجع ماژولار (موتور واحد همهٔ دامنه‌ها)
 * frontend/components/base/BaseChart.tsx
 * ============================================================
 * ورودی‌ها (همه تزریق‌پذیر):
 *
 *   data     دادهٔ دامنه‌آگنوستیک (ChartSeriesInput[])
 *   theme    تم رنگ/فونت (یا ازتم فعال سایت)
 *   layout   زوم · legend · signals · grid · padding · scales
 *   signals  سیگنال‌های لحظه‌ای (کتابخانه یا سفارشی)
 *   layers   لایه‌های بصری (باند هدف، رکود، رویداد، پیش‌بینی، شوک)
 *
 * ❌ در این فایل هیچ رنگ/زوم/سیگنال/لایهٔ هاردکدی وجود ندارد.
 * ✅ افزودن دامنهٔ جدید (Energy/Crypto/Trading/Risk) نیازی به
 *    تغییر این فایل ندارد: فقط داده + preset می‌دهند.
 * ============================================================
 */

const SERIES_CTORS = {
  line: LineSeries,
  area: AreaSeries,
  histogram: HistogramSeries,
  baseline: BaselineSeries,
  bar: BarSeries,
  candlestick: CandlestickSeries,
} as const;

const LINE_STYLE_MAP: Record<string, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

const SLOT_CLASS: Record<string, string> = {
  "top-left": "top-2 start-2 items-start",
  "top-right": "top-2 end-2 items-end",
  "bottom-left": "bottom-7 start-2 items-start",
  "bottom-right": "bottom-7 end-2 items-end",
  none: "hidden",
};

/**
 * چینش پنل **سیگنال‌ها** — عمداً **فیزیکی** (left/right ثابت) نه logical:
 * در RTL، `start-2` به راست می‌افتد و پنلِ چندبجی از لبهٔ چارت بیرون می‌زند
 * (شاهد 2026-09-21: ۶ سیگنال از سمت راست بیرون زده بودند).
 * همراه با `max-w-[calc(100%-0.5rem)]` تضمین می‌شود پنل همیشه داخل چارت بماند
 * و بج‌ها به خط بعد بشکنند.
 */
const SIGNAL_SLOT_CLASS: Record<string, string> = {
  "top-left": "top-2 left-2 items-start",
  "top-right": "top-2 right-2 items-end",
  "bottom-left": "bottom-7 left-2 items-start",
  "bottom-right": "bottom-7 right-2 items-end",
  none: "hidden",
};

const TONE_SLOT: Record<string, string> = {
  pos: "signalPos",
  neg: "signalNeg",
  warn: "signalWarn",
  risk: "signalRisk",
  info: "signalInfo",
  neutral: "signalNeutral",
};

/** ضخامت فلش/بج (۱..۳ از سیگنال) → وزن فونت مقدار. */
const SIGNAL_WEIGHT: Record<number, number> = { 1: 400, 2: 600, 3: 800 };

/**
 * فاصلهٔ تنفس (px) بین سطر سیگنال و پنل زیرین (حجم) — چارت تاریخی.
 * پنل به اندازهٔ **ارتفاع واقعی سطر سیگنال + این فاصله** بالا می‌رود تا بج‌ها
 * خوانا بمانند (داستان کاربر 2026-09-23).
 */
const PANE_SIGNAL_GAP_PX = 8;

export interface BaseChartProps {
  /** دادهٔ چارت (شکل واحد همهٔ دامنه‌ها) */
  data: ChartSeriesInput[];
  /** تم (اگر ندهید، از تم فعال سایت: light/dark) */
  theme?: Parameters<typeof mergeTheme>[1];
  /** نام تم آماده: light/dark/terminal/print · inflation_modern_dark/light · "auto" */
  themeName?: string;
  /** چینش و زوم (layout دامنه بر layout تم اولویت دارد) */
  layout?: ChartLayoutPartial;
  /** سیگنال‌ها */
  signals?: ChartSignalsConfig;
  /** لایه‌های بصری */
  layers?: ChartLayer[];
  height?: number;
  className?: string;
  locale?: string;
  /** فرمت محور قیمت */
  priceFormat?: keyof typeof import("@/lib/chart/lwcOptions").PRICE_FORMATTERS | ((v: number) => string);
  /** متن‌های اختیاری (i18n از دامنه) */
  labels?: { signals?: string; legend?: string; empty?: string; error?: string };
  /**
   * ترجمهٔ tooltipهای سیگنال (v3): سیگنالها `hintKey`/`hintParams` می‌دهند و
   * موتور با این تابع متن ترجمه‌شده می‌سازد (صفحه آن را از next-intl می‌سازد).
   * اگر ندهید، خود `hint` (در صورت وجود) استفاده می‌شود.
   */
  /**
   * v3: قالب‌های ترجمهٔ tooltipهای سیگنال (`messages.macro.signals` سمت سرور).
   * ⚠️ فقط **دادهٔ سریالایزپذیر** — طبق Next، تابع را نمی‌توان به Client
   *    Component پاس داد و همین باعث خطای ۵۰۰ در نسخهٔ اول v3 شده بود.
   */
  signalHints?: Record<string, unknown>;
  /** کلید بازسازی (با تغییر کشور/سری) */
  /**
   * **کلید نما (زنده · اختیاری):** اگر داده شود (مثلاً `symbol|tf`)، بازهٔ دیدنی
   * کاربر در بازساخت‌های **همان** چارت حفظ می‌شود ⇒ رفرش زندهٔ کندل تازه،
   * زوم/اسکرول را نمی‌پراند ✓. بدون این prop، رفتار قبلی دست‌نخورده است ✓
   * (چارت‌های ماکرو صریحاً چیزی پاس نمی‌دهند ⇒ بدون رگرسیون).
   */
  viewKey?: string;
  deps?: unknown[];
  /** دسترسی به موتور (برای دامنه‌های پیشرفته) */
  onHandle?: (h: BaseChartHandle) => void;
  /** overlay اضافی دامنه (HTML) */
  children?: ReactNode;
}


// ------------------------------------------------------------------
// ابزار: رنگ سری از تم (صریح → اسلات → پالت)
// ------------------------------------------------------------------
/**
 * **بازهٔ دیدنی ذخیره‌شده (سطح ماژول):** فقط برای چارت‌هایی که `viewKey` دارند
 * استفاده می‌شود ⇒ رفرش زندهٔ داده (بازساخت چارت) نما را بازنشانی نمی‌کند ✓.
 */
/**
 * **P1.4b/۲ — حافظهٔ نما از هستهٔ V2:** همان رفتار قبلی (`savedView`) — بازهٔ دیدنی
 * کاربر با کلید `symbol|tf` ذخیره و پس از بازساخت بازگردانی می‌شود ✓ — اما با
 * **اعتبارسنجی** (`NaN`/`to ≤ from`/کلید خالی رد می‌شوند ✗) و شمارنده‌های
 * `saved/restored/missed` ✓. (singleton سطح-ماژول: همان دامنهٔ متغیر قبلی ✓؛
 * جداسازی per-chart کار P3 است.)
 */
/**
 * ⛔ **حذف شد ✗:** `ViewMemory` موازیِ این‌جا. از **مرحلهٔ ۳** تنها مالکِ نما
 * `lib/chart/viewPersistence.ts` است ✓ (کلید یکتا · زمان‌محور · انقضا ۱۲h ·
 * نسخهٔ باندل ✓). هستهٔ V2 (`chartEngine`) همان `ViewMemory` خودش را برای
 * selfTest/قرارداد نگه می‌دارد ✓ — ولی BaseChart دیگر از آن استفاده نمی‌کند ✗.
 */

/**
 * **P2 (۹.۲.۱+۹.۲.۲) — رندر افزایشی پشت flag:** وقتی `true` شود، `dataKey`
 * **ساختاری** می‌شود (نه محتوایی ✗) و به‌روزرسانی دادهٔ کندل از مسیر
 * `SeriesRegistry.update` انجام می‌شود ⇒ **بازساخت کامل چارت ✗**.
 * ⚠️ پیش‌فرض `false` ⇒ رفتار امروز **عیناً یکسان** ✓ (صفر ریسک ✗)؛ برای سنجش
 *    چهار معیار P2 موقتاً `true` می‌شود و بعد از تأیید، پیش‌فرض عوض می‌شود ✓.
 */
const P2_INCREMENTAL = true;

function seriesColorOf(theme: ReturnType<typeof mergeTheme>, s: ChartSeriesInput, index: number): string {
  if (s.color) return s.color;
  return resolveSlot(theme, s.colorKey, index);
}

/**
 * گزینه‌های سری از تم — **یک منبع واحد** برای ساخت سری و برای
 * به‌روزرسانی زندهٔ آن (applyOptions) تا ظاهر هرگز واگرا نشود.
 */
function seriesOptionsFor(
  theme: ReturnType<typeof mergeTheme>,
  s: ChartSeriesInput,
  index: number,
  /**
   * باند هدف (فقط به **سری مقیاس راست** داده می‌شود): مقیاس قیمت را طوری
   * گسترش می‌دهد که خط/باند هدف هرگز بیرون از دید نیفتد.
   */
  targetBand?: { low: number | null; high: number | null } | null,
  /**
   * 🟩 **بازهٔ عمودی (Y) تثبیت‌شده از حافظه** (مرحلهٔ ۱۰ ✓) — فقط وقتی در کش باشد ✓
   * (یعنی کاربر محور قیمت را **دستی** مقیاس کرده بود ✓). `null` ⇒ رفتار همیشگی ✓.
   */
  pinnedY?: { min: number; max: number } | null,
  /** 🟩 منبع **زندهٔ** بازهٔ Y (پنِ عمودی کاربر ✓ یا مقدار تثبیت‌شده ✓) */
  liveRange?: () => { min: number; max: number } | null,
): Record<string, unknown> {
  const color = seriesColorOf(theme, s, index);
  const kind = s.type ?? "line";
  const style = LINE_STYLE_MAP[s.lineStyle ?? (s.dashed ? "dashed" : "solid")] ?? LineStyle.Solid;
  const opts: Record<string, unknown> = {
    title: s.label ?? s.id,
    color,
    priceLineVisible: false,
    lastValueVisible: true,
  };
  /**
   * **کندل (دامنهٔ تاریخی · H1):** رنگ‌ها **فقط از اسلات‌های تم** می‌آیند
   * (`candleUp`/`candleDown`/`wickUp`/`wickDown`) ⇒ نه رنگ هاردکد، نه رنگ
   * پیش‌فرض LWC. اگر تم این اسلات‌ها را نداشته باشد، `resolveSlot` به پالت سری
   * برمی‌گردد (رفتار امن) و چارت ماکرو هیچ‌وقت کندل نمی‌سازد ⇒ بدون تغییر.
   */
  if (kind === "candlestick") {
    /**
     * ⚠️ `color` روی کندل معنا ندارد و در LWC v5 جزو `CandlestickStyleOptions`
     * نیست ⇒ صریحاً حذف می‌شود تا اعتبارسنجی آپشن‌ها در **مرورگر** خطا ندهد
     * (این کلاس خطا در SSR دیده نمی‌شود و فقط در تب کاربر ظاهر می‌شود).
     */
    delete opts.color;
    const up = resolveSlot(theme, "candleUp");
    const down = resolveSlot(theme, "candleDown");
    opts.upColor = up;
    opts.downColor = down;
    opts.borderUpColor = up;
    opts.borderDownColor = down;
    opts.wickUpColor = resolveSlot(theme, "wickUp");
    opts.wickDownColor = resolveSlot(theme, "wickDown");
  }
  if (kind === "line" || kind === "area") {
    opts.lineWidth = s.lineWidth ?? 2;
    opts.lineStyle = style;
    // نقاط داده به‌صورت دایره‌های کوچک (درخواست چارت سیاست پولی)
    if (s.markers) {
      opts.pointMarkersVisible = true;
      const r = typeof s.markers === "object" ? s.markers.radius : undefined;
      if (typeof r === "number") opts.pointMarkersRadius = r;
    }
  }
  if (kind === "area") {
    opts.topColor = color;
    opts.bottomColor = theme.palette.background;
  }
  if (s.priceScaleId) {
    opts.priceScaleId = s.priceScaleId;
    /**
     * مقیاس **کمکی/مخفی** (پنل زیرین مثل حجم): نه برچسب آخرین مقدار، نه خط قیمت.
     * مقیاسِ راست دست‌نخورده می‌ماند ⇒ رفتار چهار چارت ماکرو تغییر نمی‌کند.
     */
    if (s.priceScaleId !== "right") {
      opts.lastValueVisible = false;
      opts.priceLineVisible = false;
    }
  }
  /**
   * 🟩 **مرحلهٔ ۱۰ — تثبیت بازهٔ عمودی (Y) از حافظهٔ کلاینت:**
   *   اگر کاربر محور قیمت را دستی مقیاس کرده باشد، همان بازه ذخیره شده است ✓ و این‌جا
   *   فراهم‌کنندهٔ `autoscale` یک بازهٔ **ثابت** برمی‌گرداند ✓ (به‌علاوهٔ **آخرین قیمت
   *   سری** ✓ تا کندل زنده هرگز بیرون نیفتد ✗). فقط روی سریِ **مقیاس راست** اعمال
   *   می‌شود ✓ (پنل حجم/مقیاس‌های کمکی دست‌نخورده ✓). حاشیهٔ تم حفظ می‌شود ✓.
   */
  if ((pinnedY || liveRange) && (s.priceScaleId ?? "right") === "right") {
    const pts = s.type === "candlestick" ? (s.bars ?? []) : (s.points ?? []);
    const last = pts[pts.length - 1] as { value?: number; close?: number } | undefined;
    const lastVal = last ? Number(last.value ?? last.close) : Number.NaN;
    /**
     * ⚠️ نکتهٔ مهم: فقط اگر واقعاً بازهٔ زنده/تثبیت‌شده‌ای هست provider می‌گذاریم ✓ —
     * ولی **هرگز `return opts` زودهنگام نمی‌کنیم** ✗ (وگرنه provider «باند هدف» در
     * چارت‌های ماکرو رد می‌شد ✗ ⇒ همان باگ قدیمی برمی‌گشت ✗).
     */
    const live = liveRange?.() ?? (pinnedY ? { min: pinnedY.min, max: pinnedY.max } : null);
    if (live) {
    let lo = live.min;
    let hi = live.max;
    if (Number.isFinite(lastVal)) {
      if (lastVal < lo) lo = lastVal;
      if (lastVal > hi) hi = lastVal;
    }
    if (targetBand?.low !== null && targetBand?.low !== undefined && targetBand.low < lo) {
      lo = targetBand.low;
    }
    if (targetBand?.high !== null && targetBand?.high !== undefined && targetBand.high > hi) {
      hi = targetBand.high;
    }
    const pad = (hi - lo) * 0.003;
    opts.autoscaleInfoProvider = (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
      const res = original();
      return {
        priceRange: { minValue: lo - pad, maxValue: hi + pad },
        margins: res?.margins ?? { above: 0.1, below: 0.1 },
      };
    };
    }
  }
  if (targetBand && (targetBand.low !== null || targetBand.high !== null) && !s.priceScaleId) {
    opts.autoscaleInfoProvider = (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
      const res = original();
      try {
        if (!res || !res.priceRange) return res;
        const r = expandRangeForTarget(res.priceRange.minValue, res.priceRange.maxValue, targetBand);
        if (!r.expanded) return res;
        return { priceRange: { minValue: r.minValue, maxValue: r.maxValue }, margins: res.margins };
      } catch {
        return res; // هر خطای غیرمنتظره = رفتار پیشین (بدون کرش چارت)
      }
    };
  }
  return opts;
}

/**
 * 🆕 **سقف فضای خالی راست** (میله) — بازبینی دهم ✓ (پیشنهاد صریح کاربر ✓):
 * روی پنجره‌های بزرگ (TV واید · زوم ۱ ساله ≈ ۸۷۶۰ میله ✗) نسبتِ ۲۵٪ یعنی
 * ~۲۲۰۰ میله فضای خالی ⇒ چارت از قاب بیرون می‌افتاد ✗ ⇒ سقف ۲۰۰ میله ✓.
 */

const MAX_RIGHT_OFFSET_BARS = 200;
/** 🟩 مرحلهٔ ۲۶ — حداقلِ فضای راست = **یک میله** (ضدِ چسبیدن به لبه ✗) */
const MIN_RIGHT_OFFSET_BARS = 1;
/**
 * 🟩 **مرحلهٔ ۲۷ — کفِ فضای راست بر حسب **پیکسل** (خواستهٔ کاربر ✓: «حدود ۱۰۰px»):
 *   «۱ میله» کافی نبود ✗ ⇒ حالا فاصلهٔ راست **دست‌کم ۱۰۰ پیکسل** است ✓ (مستقل از
 *   `barSpacing` ✓). این کف در سنجش هم ملاک است ✓ ⇒ پس از **زوم با چرخ** (که
 *   `barSpacing` را عوض می‌کند و LWC خودش `rightOffset` را تنظیم می‌کند ✗) دوباره
 *   برقرار می‌شود ✓. آفستِ **بزرگ‌ترِ** کاربر همیشه محترم است ✓ (فقط کف اعمال می‌شود ✗).
 */
const MIN_RIGHT_OFFSET_PX = 100;
/**
 * 🟩 **مرحلهٔ ۲۹ — سقفِ سختِ دوم برای تایم‌فریم‌های ریز (۱ دقیقه ✓):**
 *   `barSpacing` روی ۱m خیلی کوچک است ✓ ⇒ برای ۱۰۰px ممکن است به میله‌های زیادی
 *   نیاز باشد که از سقفِ عادیِ ۲۰۰ میله رد شود ✗ ⇒ آن‌وقت کفِ پیکسلی **نقض** می‌شد ✓
 *   (چرا فقط روی ۱m دیده می‌شد ✓). این سقفِ بالاتر فقط زمانی استفاده می‌شود که
 *   **لازم** باشد ✓ تا چارت از قاب بیرون نیفتد ✗.
 */
/** 🟩 آخرین آفستِ اعمال‌شده (برای بازرسی در DOM ✓) */
let lastAppliedOffsetBars = MIN_RIGHT_OFFSET_BARS;
let lastAppliedOffsetPx = MIN_RIGHT_OFFSET_PX;

/**
 * 🟩 **مرحلهٔ ۲۰ — کلید رفتار سفارشی محورها** (خواستهٔ کاربر: «به پیش‌فرض اولیه برگردان» ✓):
 *   `false` ✗ ⇒ هیچ پنِ اختصاصیِ ماوس و هیچ «تثبیت Y»ای فعال نیست ✓ ⇒ چارت **دقیقاً**
 *   مثل تنظیمات اصلیِ LWC رفتار می‌کند ✓ (پن X با درگ ✓ · مقیاس Y فقط با محور/چرخ ✓ ·
 *   مقیاس خودکار و fit ✓). برای فعال‌کردن دوباره، همین را `true` کن ✓ (کد آماده است ✓).
 */
const ENABLE_CUSTOM_Y_PAN = false;

/**
 * 🆕 **جای آخرین کندل = نسبتی از عرض چارت** (بازبینی یازدهم ✓ — دقیقاً خواستهٔ کاربر):
 *   فضای خالی راست = `(۱ − ratio) × عرضِ واقعی چارت` **به پیکسل** ✓
 *   سپس به میله تبدیل می‌شود با **فاصلهٔ واقعی میله‌ها** (`barSpacing` ✓ که خودِ LWC
 *   به‌خاطر `minBarSpacing` تنظیم می‌کند ✗ نه تعداد میلهٔ پنجرهٔ زمانی ✗).
 * ⚠️ باگ پیشین ✗: از تعداد میلهٔ **پنجرهٔ زمانی** استفاده می‌کردم (۲۱٬۰۰۰ میله ✗)
 *    ⇒ `rightOffset` عظیم ⇒ چارت از قاب بیرون می‌افتاد ✗. حالا مبنای محاسبه
 *    **عرض چارت** است ✓ (مستقل از زوم ✓).
 * @returns میلهٔ محاسبه‌شده یا `null` (نسبت تعیین نشده یا اندازه‌ها نامعتبر ✓)
 */
/**
 * بازبینی چهاردهم — محل چارت کاملاً مستقل از تم (خواستهٔ صریح کاربر):
 *   INITIAL_OFFSET_PX = 150 فقط یک‌بار در نخستین mount (مستقل از تم/اسکرین)
 *   بعد از اولین حرکت کاربر ⇒ localStorage["chartOffset"]
 *   در همهٔ refreshها همان اعمال می‌شود و هیچ تمی override نمی‌کند
 */
/**
 * 🔴 **بازبینی هجدهم — کش آفست به تفکیک (نماد|تایم‌فریم)** (رفع باگ «Apply تایم‌فریم»):
 *   · قبلاً **یک کلید جهانی** بود (`chartOffset` ✗) ⇒ آفست تایم‌فریم قبلی روی
 *     تایم‌فریم جدید اعمال می‌شد ✗ (ظاهر پس از Apply ≠ ظاهر پس از Ctrl+Shift+R ✗).
 *   · حالا `chartOffset:<نماد|تایم‌فریم>` ✓ ⇒ هر ترکیب، کش مستقل خودش را دارد ✓
 *     و نبودِ کش ⇒ مقدار پیش‌فرض `150px` ✓ (همان قاعدهٔ نخستین mount ✓).
 *   · کش جهانیِ قدیمی **یک‌بار پاک** می‌شود ✓ (منبع آلودگی ✗).
 */
/** کلید کهنهٔ **جهانی** (پیش از مرحلهٔ ۳) — یک‌بار پاک می‌شود ✓ */
const LEGACY_CHART_OFFSET_KEY = "chartOffset";
let applyingChartOffset = false;
let legacyOffsetPurged = false;
/** خودآزمون ماژول نما (خالص ✓ ⇒ در SSR منتشر می‌شود ✓) */
const VIEW_SELFTEST_ERRORS = viewPersistenceSelfTest();
const VIEW_SELFTEST_ATTR = VIEW_SELFTEST_ERRORS.length
  ? `fail:${VIEW_SELFTEST_ERRORS.length}`
  : "ok:0";

function purgeLegacyOffset(): void {
  if (legacyOffsetPurged) return;
  legacyOffsetPurged = true;
  try {
    window.localStorage.removeItem(LEGACY_CHART_OFFSET_KEY);
  } catch {
    /* noop */
  }
}

/** آفست ذخیره‌شدهٔ همین کلید (از **ماژول واحد** ✓) — نبود ⇒ `INITIAL_OFFSET_PX` ✓ */
function readSavedOffsetPx(key: string): number | null {
  return restoreOffsetPx(key);
}



/** آفست فعلی چارت به px (برای ذخیره) */
function currentOffsetPx(chart: IChartApi): number | null {
  try {
    const ts = chart.timeScale().options();
    const barSpacing = Number(ts.barSpacing ?? 0);
    if (!(barSpacing > 0)) return null;
    return Math.max(0, Math.round(Number(ts.rightOffset ?? 0) * barSpacing));
  } catch {
    return null;
  }
}

/**
 * 🟩 **مرحلهٔ ۱۰ — خواندن بازهٔ عمودی (Y) فقط در حالتِ «دستی»** ✓
 *   اگر کاربر محور قیمت را کشیده باشد، LWC خودش `autoScale` را `false` می‌کند ✓
 *   (`PriceScaleOptions.autoScale` · `@defaultValue true` ✓). آن‌وقت بازهٔ دیدنی با
 *   `series.coordinateToPrice(0 / paneHeight)` خوانده می‌شود ✓ (در v5
 *   `getVisiblePriceRange` وجود ندارد ✗ ⇒ همین مسیر مستند ✓).
 *   در حالت خودکار (`autoScale !== false` ✗) هیچ‌چیز ذخیره نمی‌شود ⇒ صفر تغییر رفتار ✓.
 */
function manualPriceRange(
  chart: IChartApi,
  series: ISeriesApi<never> | null | undefined,
): { min: number; max: number } | null {
  try {
    if (!series) return null;
    const ps = chart.priceScale("right");
    if (ps.options().autoScale !== false) return null; // خودکار ⇒ هیچ ذخیره‌ای ✗
    const h = chart.paneSize(0).height;
    if (!(h > 0)) return null;
    const top = Number(series.coordinateToPrice(0));
    const bottom = Number(series.coordinateToPrice(h));
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || top === bottom) return null;
    const min = Math.min(top, bottom);
    const max = Math.max(top, bottom);
    if (!(max > min) || !(min > 0)) return null;
    return { min, max };
  } catch {
    return null;
  }
}

/**
 * 🟩 **مرحلهٔ ۱۶ — پنِ عمودی (Y) با ماوس** — LWC API عمومی برای «ست‌کردن بازهٔ قیمت»
 * ندارد ✗ (`getVisiblePriceRange` هم در v5 حذف شده ✗) ⇒ مسیر ما:
 *   ۱) بازهٔ دیدنی را از `coordinateToPrice` می‌خوانیم ✓
 *   ۲) یک `autoscaleInfoProvider` روی سریِ مقیاس راست می‌گذاریم که همان بازهٔ
 *      **جابه‌جاشده** را برمی‌گرداند ✓ (منبع: `liveRange` ⇒ `panRange` یا `pinnedY` ✓)
 *   ۳) برای وادارکردن LWC به بازمحاسبه، `scaleMargins` را با یک جیتر **نامحسوس**
 *      (`1e-4`) بازاعمال می‌کنیم ✓ (`nudgePriceScale`).
 */
function visiblePriceRange(
  chart: IChartApi,
  series: ISeriesApi<never> | null | undefined,
): { min: number; max: number } | null {
  try {
    if (!series) return null;
    const h = chart.paneSize(0).height;
    if (!(h > 0)) return null;
    const top = Number(series.coordinateToPrice(0));
    const bottom = Number(series.coordinateToPrice(h));
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || top === bottom) return null;
    const min = Math.min(top, bottom);
    const max = Math.max(top, bottom);
    return max > min && min > 0 ? { min, max } : null;
  } catch {
    return null;
  }
}

/**
 * اعمال آفست راست: کشِ **همین (نماد|تایم‌فریم)** ⇒ وگرنه `INITIAL_OFFSET_PX` ✓
 * 🟩 **مرحلهٔ ۲۶:** همیشه **حداقل یک میله** فضا می‌گذارد ✓ و آستانهٔ idempotent هم
 * دیگر جلوی این حداقل را نمی‌گیرد ✗ (قبلاً اگر مقدار فعلی ۰ یا ۱ بود ✗، شرطِ
 * `|cur − bars| < 2` اعمال را **رد** می‌کرد ✓ ⇒ چارت به لبهٔ راست می‌چسبید ✗✓).
 */
function applyChartOffset(chart: IChartApi, key: string): void {
  if (applyingChartOffset) return;
  const savedPx = readSavedOffsetPx(key) ?? INITIAL_OFFSET_PX;
  /** 🟩 کفِ پیکسلی: هرگز کمتر از ~۱۰۰px فضا نماند ✓ (خواستهٔ کاربر ✓) */
  const wantPx = Math.max(MIN_RIGHT_OFFSET_PX, savedPx);
  try {
    const ts = chart.timeScale().options();
    const barSpacing = Number(ts.barSpacing ?? 0);
    if (!(barSpacing > 0)) return;
    const bars = Math.min(
      MAX_RIGHT_OFFSET_BARS,
      Math.max(MIN_RIGHT_OFFSET_BARS, Math.round(wantPx / barSpacing)),
    );
    const curBars = Number(ts.rightOffset ?? 0);
    const curPx = curBars * barSpacing;
    /**
     * idempotent ✓ — ولی ملاک، **پیکسل** است ✓: اگر فاصلهٔ فعلی از ۱۰۰px کمتر باشد ✗
     * (مثلاً پس از زوم با چرخ ✓) همیشه دوباره اعمال می‌شود ✓ ⇒ فضای راست پایدار ✓.
     */
    if (curPx >= MIN_RIGHT_OFFSET_PX && Math.abs(curBars - bars) < 2) return;
    applyingChartOffset = true;
    chart.applyOptions({ timeScale: { rightOffset: bars } });
    /** 🟩 کفِ پیکسلی تضمین شد ✓ — **بدون هیچ اعمال دوباره‌ای که پنجره را جابه‌جا کند** ✗ */
    lastAppliedOffsetBars = bars;
    lastAppliedOffsetPx = Math.round(bars * barSpacing);
  } catch {
    /* noop */
  } finally {
    applyingChartOffset = false;
  }
}

export function BaseChart({
  data,
  theme: themeOverride,
  themeName,
  layout: layoutOverride,
  signals: signalsConfig,
  layers,
  height = 320,
  className,
  locale = "en",
  priceFormat = "number",
  labels,
  signalHints,
  deps = [],
  viewKey = "",
  onHandle,
  children,
}: BaseChartProps) {
  const { theme: siteTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  /** سطر سیگنال‌ها — ارتفاعش برای بالا بردن پنل‌های زیرین اندازه‌گیری می‌شود. */
  const signalsRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<never>>>(new Map());
  /** شناسهٔ سری → نمونهٔ سری (برای به‌روزرسانی زندهٔ رنگ/استایل). */
  const seriesByIdRef = useRef<Map<string, ISeriesApi<never>>>(new Map());
  /** آخرین ظاهر (theme/layout/shown) برای هندلرهای LWC — ضد stale closure. */
  const latestRef = useRef<{
    theme: ReturnType<typeof mergeTheme>;
    layout: ChartLayout;
    shown: ChartSeriesInput[];
  } | null>(null);
  const scheduleRedrawRef = useRef<() => void>(() => {});
  /** P1.2b — آخرین بدنهٔ رسم (برای زمان‌بند هسته؛ بدون بازساخت چارت ✗) */
  const redrawRef = useRef<() => void>(() => {});
  const applyZoomRef = useRef<(z: ZoomPreset | ZoomRange) => void>(() => {});
  /** آخرین زومِ اعمال‌شده — تا تغییر تم، زوم/اسکرول کاربر را ریست نکند. */
  const lastZoomKeyRef = useRef<string>("");
  /** P1.2b: `rafRef` حذف شد — زمان‌بند هسته (`createRedrawScheduler`) مالک فریم است ✓ */
  const [tip, setTip] = useState<{
    visible: boolean;
    x: number;
    lines: { label: string; color: string; value: number }[];
  }>({ visible: false, x: 0, lines: [] });
  const [error, setError] = useState<string | null>(null);
  /**
   * 🆕 **ضدِ «فلاشِ چارت قبلی» (بازبینی ششم):** چارت تا **تأیید زومِ پیش‌فرض**
   * پنهان است ✓. پیاده‌سازی با **مقایسهٔ کلید** است (نه `setState` همگام در افکت ✗)
   * ⇒ هم قاعدهٔ lint رعایت می‌شود ✓ و هم تغییر تایم‌فریم/زوم، نشانگر را ریست
   * می‌کند ✓ (یک فریم پنهان، سپس آشکار ✓).
   */
  const [readyKey, setReadyKey] = useState("");

  /**
   * دروازهٔ ساختِ چارت (بازبینی شانزدهم):
   *   · syncOpen = تشخیص کلاینت (ScreenThemeSync) تمام شده
   *   · grace = تورِ ۲۵۰ms برای صفحه‌هایی که ScreenThemeSync ندارند (fail-open)
   *   · تا باز نشدن دروازه هیچ چارتی ساخته نمی‌شود و init در صف می‌ماند
   */
  const [syncOpen, setSyncOpen] = useState(() => isScreenSyncDone());
  const [grace, setGrace] = useState(false);
  const gateOpen = syncOpen || grace;

  useEffect(() => onScreenSync(() => setSyncOpen(true)), []);
  /** تورِ ایمنی: صفحه‌ای که ScreenThemeSync ندارد هرگز قفل نماند */
  useEffect(() => {
    const t = window.setTimeout(() => setGrace(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  /** «مسلح» = بعد از نخستین اعمال آفست ⇒ حرکت کاربر ذخیره شود */
  const armedRef = useRef(false);
  /**
   * 🔴 بازبینی هجدهم: کلید کش آفست = (نماد|تایم‌فریم) ✓ — هر چارت با کلید خودش.
   * ⛔ آفست تایم‌فریم قبلی هرگز روی تایم‌فریم جدید نمی‌نشیند ✗.
   */
  const persistKeyRef = useRef<string>("default");
  /** کلید نمای قبلی (برای read تازه از حافظه هنگام تغییر کلید ✓) */
  const prevViewKeyRef = useRef<string>("");
  /** 🟩 «بازگردانی یک‌بار»: نخستین mount ⇒ خواندن `localStorage` ✓ (مرحلهٔ ۳) */
  const restoredOnceRef = useRef(false);
  /**
   * 🟩 **مرحلهٔ ۸ — پلِ نما میان نسل‌ها** (رفع «پرش هنگام روشن/خاموش کردن اندیکاتور» ✗):
   *   با تغییر پلن سری‌ها (`dataKey` ساختاری ✓) چارت **بازساخته** می‌شود؛ در آن لحظه
   *   پنجرهٔ دیدنیِ دقیقِ کاربر این‌جا نگه داشته می‌شود و نسل بعدی همان را می‌نشاند ✓
   *   ⇒ روشن/خاموش کردن اندیکاتور، مکانِ محور زمان را **ریست نمی‌کند** ✗.
   *   (کلید هم ذخیره می‌شود ✓ تا با تغییر نماد/تایم‌فریم، نمای TF قبلی منتقل نشود ✗.)
   */
  const pendingViewRef = useRef<{ key: string; from: number; to: number } | null>(null);
  /** پنجرهٔ آرمانیِ همین ساخت (از پل یا از ماژول نما ✓) — در rAF بازتأکید می‌شود ✓ */
  const wantRangeRef = useRef<{ from: number; to: number } | null>(null);
  /** 🟩 مرحلهٔ ۱۰ — بازهٔ عمودی (Y) خوانده‌شده از حافظه برای همین ساخت ✓ */
  const pinnedYRef = useRef<{ min: number; max: number } | null>(null);
  /** 🟩 مرحلهٔ ۱۶ — بازهٔ Y که کاربر با **کشیدن عمودی با ماوس** جابه‌جا کرده ✓ (زنده ✓) */
  const panRangeRef = useRef<{ min: number; max: number } | null>(null);
  /**
   * 🟩 **مرحلهٔ ۲۳ — پلِ بازهٔ عمودی (Y) بین نسل‌ها** (رفع «پرش مقیاس هنگام خاموش/روشن
   * کردن اندیکاتور» ✗):
   *   با هر toggle، چارت **بازساخته** می‌شود ✓ و در چارت تازه LWC مقیاس را از نو از
   *   مجموعهٔ **جدید** سری‌ها حساب می‌کند ✗ (و چون اتوفیت خاموش است ✗، همان بازهٔ تازه
   *   تثبیت می‌شود ✓) ⇒ پرش مقیاس ✓. این‌جا بازهٔ **قبل از بازساخت** نگه داشته می‌شود ✓
   *   (فقط در همان نشست ✓ · **هیچ نوشتنی در کش نیست** ✗ ⇒ بدون قفل‌شدن ✗) و در ساخت
   *   بعدی — اگر **کلید یکتا همان** باشد ✓ — عیناً بازاعمال می‌شود ✓✓.
   */
  const pendingYRef = useRef<{ key: string; range: { min: number; max: number } } | null>(null);
  /** 🟩 مرحلهٔ ۲۴ — افزودن یک سری تازه بدون بازساخت (در افکت ساخت تنظیم می‌شود ✓) */
  const ensureSeriesRef = useRef<((specs: ChartSeriesInput[]) => void) | null>(null);
  /** 🟩 مرحلهٔ ۲۴ — بازمحاسبهٔ inset پنل پس از افزودن/حذف سری ✓ */
  const applyPaneInsetRef = useRef<(() => void) | null>(null);
  /** 🟩 مرحلهٔ ۲۴ — باند هدفِ جاری (برای سری‌های تازه ✓) */
  const targetBandRef = useRef<{ low: number | null; high: number | null } | null>(null);
  /** بازرسی: منبع نمای جاری (`memory` = همان کلید ✓ · `default` = زوم پیش‌فرض ✓) */
  const [viewSrc, setViewSrc] = useState("init");
  /** بازرسی: نسل چارت — هر re-init یک عدد جلو می‌رود ✓ */
  const [chartGen, setChartGen] = useState(0);
  const chartGenRef = useRef(0);
  /** نسلِ **آشکارشده** — تا اعمال زوم، قاب جدید دیده نمی‌شود ✓ (ضدِ پرش ✗) */
  const [readyGen, setReadyGen] = useState(0);
  /** کلیدِ مؤثرِ کش آفست (فقط برای بازرسی در DOM ✓) */
  const [offsetKeyUi, setOffsetKeyUi] = useState("default");
  /** 🟩 مرحلهٔ ۳ — بازرسی: کلید یکتای نما + سن حافظه (ms) */
  const [viewKeyUi, setViewKeyUi] = useState("");
  const [viewAgeUi, setViewAgeUi] = useState<number | null>(null);


  // ---- تم نهایی: نام درخواستی (auto/preset) → تم فعال سایت → override ----
  //      `themeName` نداده‌اید؟ ⇒ تم روشن/تیرهٔ سایت.
  const themeNameResolved = useMemo(
    () => resolveThemeName(themeName, siteTheme),
    [themeName, siteTheme],
  );
  const themeSpec = useMemo(() => getThemeSpec(themeNameResolved), [themeNameResolved]);
  const theme = useMemo(
    () => mergeTheme(getThemePreset(themeNameResolved), themeOverride),
    [themeNameResolved, themeOverride],
  );

  // ---- چینش: DEFAULT_LAYOUT → layout تم → layout دامنه (برنده) ----
  const layout = useMemo(
    () => mergeLayout(mergeLayout(DEFAULT_LAYOUT, normalizeLayoutSpec(themeSpec?.layout)), layoutOverride),
    [themeSpec, layoutOverride],
  );

  /**
   * ⛔ **بازبینی دوازدهم:** منطق ارتفاع از تم حذف شد ✗ (نه یک‌سوم عرض ✗ نه viewport ✗).
   * ارتفاع **فقط آرگومان صفحه** است ✓ (`height` prop ✓ — کف ۳۶۰px در `CandleChart` ✓).
   */

  /** 🆕 ارتفاع = همان آرگومان صفحه ✓ (بدون قاعدهٔ خودکار ✗) */
  /** ارتفاع خام = آرگومان صفحه (بدون هیچ قاعده) */
  const effHeight = height;

  /**
   * نگهبان ارتفاع (بازبینی شانزدهم): هر مقدار نامعتبر (NaN/undefined/۰) ⇒ کف
   * ۳۶۰px ⇒ هیچ ترکیبی باعث «چارت بی‌ارتفاع/ناپدید» نمی‌شود.
   */
  const safeHeight = Number.isFinite(effHeight) && (effHeight as number) > 0 ? (effHeight as number) : 360;

  /** بازرسی: وضعیت دروازه (queued → ready) */
  const gateAttr = gateOpen ? "ready" : "queued";
  /** 🆕 ارتفاع LWC را همگام می‌کند — بدون بازساخت چارت ✗ */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.applyOptions({ height: safeHeight });
    } catch {
      /* noop */
    }
  }, [safeHeight]);

  const shown = useMemo(() => visibleSeries(data), [data]);

  /**
   * باند هدف از لایه‌ها → به سری (مقیاس راست) داده می‌شود تا **مقیاس قیمت**
   * آن را در دید بگیرد؛ وگرنه هدفِ بیرون از دامنهٔ داده (مثل چین: ۳٪ با تورم
   * ‎-۰٫۸..۱٫۳) روی بوم کشیده می‌شد ولی دیده نمی‌شد.
   */
  const targetBand = useMemo<{ low: number | null; high: number | null } | null>(() => {
    const l = (layers ?? []).find(
      (x): x is TargetBandLayer => x.id === "target-band" && x.enabled !== false,
    );
    if (!l) return null;
    const low = typeof l.low === "number" && Number.isFinite(l.low) ? l.low : null;
    const high = typeof l.high === "number" && Number.isFinite(l.high) ? l.high : null;
    return low === null && high === null ? null : { low, high };
  }, [layers]);
  const bandLow = targetBand?.low ?? null;
  const bandHigh = targetBand?.high ?? null;

  const formatOptions = useMemo<LwcFormatOptions>(() => {
    const fmt = typeof priceFormat === "function" ? priceFormat : undefined;
    return { locale, priceFormatter: fmt };
  }, [locale, priceFormat]);

  // ---- سیگنال‌ها (خالص؛ از داده محاسبه می‌شوند) ----
  const signalCtx = useMemo<SignalContext>(() => {
    const primary = shown.find((s) => s.type !== "candlestick") ?? shown[0];
    const secondary = shown.filter((s) => s !== primary)[0];
    return {
      series: shown,
      primary,
      secondary,
      // هدف تورمی (اختیاری) — سیگنال‌های جامع مثل ISS از آن استفاده می‌کنند
      target: signalsConfig?.target ?? null,
      // قرارداد جهت دامنه (برای تورم: `up-is-bad`) — رنگ سیگنال‌های جهتی
      bias: signalsConfig?.bias,
    };
  }, [shown, signalsConfig]);

  // ---- سیگنال‌ها: پیش‌فرض تم + props دامنه (برنده) ----
  const signalsCfg = useMemo<ChartSignalsConfig>(() => {
    const style = { ...(themeSpec?.signals?.style ?? {}), ...(signalsConfig?.style ?? {}) };
    const merged: ChartSignalsConfig = { ...(themeSpec?.signals ?? {}), ...(signalsConfig ?? {}) };
    if (Object.keys(style).length) merged.style = style;
    return merged;
  }, [themeSpec, signalsConfig]);

  const signals = useMemo(
    () => computeSignals(signalsCfg.ids ?? [], signalCtx, signalsCfg.custom),
    [signalsCfg, signalCtx],
  );
  const anchoredIdsFallback: string[] = []; // (پایدار برای deps)
  /** سیگنال‌هایی که بعد از آن‌ها شکست خط اجباری داریم (مثل PAS). */
  const breakAfterIds = signalsCfg.breakAfter ?? anchoredIdsFallback;
  const signalSlot = signalsCfg.slot ?? layout.signals;
  const shownSignals = signalsCfg.max ? signals.slice(0, signalsCfg.max) : signals;

  // استایل سیگنال‌ها (از تم یا props — نه هاردکد در موتور)
  const signalStyle = signalsCfg.style;
  const signalTransparent = Boolean(signalStyle?.transparent);
  const signalUniform = Boolean(signalStyle?.uniform);
  const signalFontSize = signalStyle?.fontSize ?? 10;
  const signalBadgeBg = resolveColorRef(theme, signalStyle?.background);
  const signalBadgeBorder = resolveColorRef(theme, signalStyle?.border);
  /** آلفای «حالهٔ رنگ وضعیت» برای بج‌های fill (پیش‌فرض ۰٫۳۵ = ملایم تا متن پررنگ دیده شود). */
  const signalStatusTint = signalStyle?.statusTint ?? 0.35;
  /**
   * **بج عریض** (دامنهٔ تاریخی · H1): استایل آخرین بج پنل (بج هشدار) — عرض
   * مضربی + پس‌زمینه/لبه/متن اختصاصی. نبودِ `wideLast` در تم ⇒ هیچ تغییری در
   * چهار چارت ماکرو (پیش‌فرض = رفتار کنونی).
   */
  const signalWideLast = signalStyle?.wideLast;
  const wideBg = resolveColorRef(theme, signalWideLast?.background);
  const wideBorder = resolveColorRef(theme, signalWideLast?.border);
  const wideText = resolveColorRef(theme, signalWideLast?.text);
  /** رنگ کارت پشت بج (حدسی برای سنجش کنتراست بج‌های نیمه‌شفاف). */
  const signalCardBg = assumedCardColor(theme.palette.background, theme.palette.text);

  /**
   * رنگ‌های یک بج سیگنال. برای بج‌های `fill: true` (مثل ISS):
   *   پس‌زمینه = حالهٔ رنگ وضعیت روی **همان پایهٔ بقیهٔ بج‌ها**
   *   متن مقدار = `valueTone` (منطق جهتی، مثل روند) و برچسب = متن تم
   * و اگر کنتراست کافی نباشد، رنگ متن فقط تا حد خوانایی به سفید/سیاه میل می‌کند.
   */
  const badgePaint = useCallback(
    (
      s: ChartSignal,
    ): { bg?: string; border?: string; value: string; label: string; glow?: string; valueBg?: string } => {
      const toneColor = resolveSlot(theme, TONE_SLOT[s.tone] ?? "signalNeutral");
      /**
       * رنگ متن مقدار:
       * · اگر سیگنال `valueTone` داشته باشد (ISS/PAS) ⇒ از **اسلات‌های معنایی**
       *   استفاده می‌شود؛ نگاشت چهارسطحی (رنگ/زرد/سفید/سبز) پشتیبانی می‌شود:
       *     pos→valueUp · neg→valueDown · neutral→valueFlat
       *     warn→signalWarn · risk→signalRisk (نردبان وضعیت)
       * · وگرنه رنگ تُن سیگنال (مثل بقیهٔ بج‌ها).
       */
      const VALUE_SLOT: Record<string, string> = {
        pos: "valueUp",
        neg: "valueDown",
        neutral: "valueFlat",
        warn: "signalWarn",
        risk: "signalRisk",
        info: "signalInfo",
      };
      const VALUE_FALLBACK: Record<string, string> = {
        pos: "signalPos",
        neg: "signalNeg",
        neutral: "signalNeutral",
        warn: "signalWarn",
        risk: "signalRisk",
        info: "signalInfo",
      };
      const valueColor =
        signalStyle?.textColor ??
        (s.valueTone
          ? (theme.palette.slots[VALUE_SLOT[s.valueTone] ?? "valueFlat"] ??
            resolveSlot(theme, VALUE_FALLBACK[s.valueTone] ?? "signalNeutral"))
          : resolveSlot(theme, TONE_SLOT[s.tone] ?? "signalNeutral"));
      if (!s.fill) {
        return {
          bg: signalBadgeBg,
          border: signalBadgeBorder,
          value: valueColor,
          label: theme.palette.textMuted,
        };
      }
      // بج وضعیت: حالهٔ رنگ + حلقهٔ رنگ خالص + متن روی صفحهٔ خودش (آنکادربندی‌شده)
      return statusBadgePaint({
        toneColor,
        valueColor,
        labelColor: theme.palette.textMuted,
        baseBadgeBg: signalBadgeBg,
        cardBg: signalCardBg,
        tint: signalStatusTint,
        valuePlate: signalStyle?.valuePlate,
      });
    },
    [
      theme,
      signalStyle?.textColor,
      signalStyle?.valuePlate,
      signalBadgeBg,
      signalBadgeBorder,
      signalStatusTint,
      signalCardBg,
    ],
  );

  // ---- زوم ----
  const applyZoom = useCallback(
    (zoom: ZoomPreset | ZoomRange) => {
      const chart = chartRef.current;
      if (!chart || shown.length === 0) return;
      const { first, last } = seriesTimeBounds(shown);
      if (!last) return;
      const { from, to } = resolveZoomRange(zoom, last, first, layout.anchor);
      /**
       * 🆕 **anchor نسبی** (بازبینی نهم ✓): آخرین کندل روی کسرِ تعیین‌شده از عرض
       * ⇒ فضای خالی راست **دقیق و مستقل از زوم** ✓ (میله‌محور نیست ✗).
       */
      
      /**
       * ⚠️ بازبینی یازدهم ✗→✓: این‌جا قبلاً `ratioBars` از **تعداد میلهٔ پنجرهٔ زمانی**
       * حساب می‌شد (مثلاً ۲۱٬۰۰۰ میله ✗) که چارت را از قاب بیرون می‌انداخت ✗.
       * حالا «جای آخرین کندل» با **نسبتِ عرض واقعی چارت** تعیین می‌شود ✓
       * (`applyAnchorRatio` پایین ✓) ⇒ این محاسبه لازم نیست ✗ (حذف شد ✓).
       */
      /**
       * ⚠️ **نگهبان دامنهٔ زوم** (خطای واقعی 2026-09-23): اگر `resolveZoomRange`
       * مقدار نامعتبر بدهد (مثلاً وقتی هیچ سری‌ای داده ندارد یا سری‌ها رد شده‌اند)،
       * LWC با `Uncaught Error: Value is null` استثنا می‌دهد و **کل صفحه می‌افتد**.
       * حالا بازهٔ نامعتبر بی‌صدا رد می‌شود (چارت روی نمای پیش‌فرض می‌ماند).
       */
      const fromNum = Number(from);
      const toNum = Number(to);
      if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || fromNum <= 0 || fromNum >= toNum) {
        return;
      }
      try {
        chart.timeScale().setVisibleRange({ from: fromNum as UTCTimestamp, to: toNum as UTCTimestamp });
        // فضای خالی سمت راست (تعداد دوره) — برای خوانایی برچسب‌ها و دیدن
        // چند دورهٔ آینده (پیش‌بینی/فرافکنی) بدون فشرده‌شدن نمودار.
        /**
         * 🆕 **فضای راست (بازبینی دهم ✓):**
         *   · اگر «نسبت لنگر» آمده ⇒ از آپشن **`timeScale.rightOffset`** استفاده می‌کنیم
         *     (مکانیزم مستندِ «فضای خالی راست» ✓) و **سقف ۲۰۰ میله** می‌گذاریم ✓
         *     ⇒ روی TV/واید، پنجرهٔ بزرگ (۱ سال = ۸۷۶۰ میله ✗) چارت را از قاب
         *     بیرون نمی‌اندازد ✗ (پیشنهاد کاربر ✓).
         *   · وگرنه رفتار سنّتی `futureMargin` (میله‌محور ✓) دست‌نخورده می‌ماند ✓.
         */
        /**
         * 🆕 **قاعدهٔ مصوب و همیشگی** (بازبینی دوازدهم ✓):
         * `rightOffset = min(chartWidth × 0.20, 600px)` ✓ — مستقل از تم ✓
         * (تم فقط `anchorRatio`/spacing/`futureMargin`/`rightOffset` را نگه می‌دارد ✓).
         */
        applyChartOffset(chart, persistKeyRef.current);
      } catch (e) {
        console.warn("[BaseChart] setVisibleRange skipped:", e);
        return;
      }
      // 🔎 نشانگر تشخیصی: بازهٔ واقعیِ اعمال‌شده روی DOM (برای تست/دیباگ زوم)
      const host = containerRef.current;
      if (host) {
        const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
        host.dataset.zoomApplied = `${zoomLabel(zoom)}|${iso(from)}|${iso(to)}`;
      }
    },
    [shown, layout.anchor],
  );

  // ---- نقاشی لایه‌ها روی بوم ----
  const redraw = useCallback(() => {
    const chart = chartRef.current;
    const canvas = overlayRef.current;
    const host = containerRef.current;
    if (!chart || !canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /** 🆕 سقف DPR از **چیدمان تم** می‌آید ✓ (موبایل/TV بودجهٔ پیکسل کمتر می‌خواهند ✓) */
    const dprCap = Number.isFinite(layout.dprCap) && layout.dprCap > 0 ? layout.dprCap : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const priceScaleW = chart.priceScale("right").width();
    const timeScaleH = chart.timeScale().height();
    const paintCtx: LayerPaintContext = {
      ctx,
      width: w,
      height: h,
      dpr,
      theme,
      layout,
      plot: {
        left: 0,
        right: Math.max(0, w - priceScaleW),
        top: 0,
        bottom: Math.max(0, h - timeScaleH),
      },
      data: shown,
      priceToY: (price, scaleId = "right") => {
        const s = seriesMapRef.current.get(scaleId) ?? seriesMapRef.current.values().next().value;
        if (!s) return null;
        const y = s.priceToCoordinate(price);
        return y === null || y === undefined ? null : Number(y);
      },
      timeToX: (t) => {
        const x = chart.timeScale().timeToCoordinate(t as UTCTimestamp);
        return x === null || x === undefined ? null : Number(x);
      },
      xToTime: (x) => {
        const t = chart.timeScale().coordinateToTime(x);
        return t === null || t === undefined ? null : Number(t);
      },
      resolveColor: (key, fallbackIndex = 0) => resolveSlot(theme, key, fallbackIndex),
      toSec: (t) => (typeof t === "number" ? t : toUnixSec(t)),
      formatValue: typeof priceFormat === "function" ? priceFormat : undefined,
    };

    try {
      /**
       * **P1.4b/۱ — مسیر رسم از هستهٔ V2:** لایه با `layers` **تازهٔ همین رندر**
       * ثبت می‌شود (fn در جا ساخته می‌شود ⇒ بدون stale ✗) و `paint` همان یک
       * فراخوان قبلی را انجام می‌دهد ✓ — فقط حالا از هسته می‌گذرد و شمارنده‌های
       * `painted/skipped` را می‌سازد ✓ (انتخاب تدریجیِ لایه‌ها کار P2 است).
       */
      const engineLayers = engineLayersRef.current;
      if (engineLayers) {
        engineLayers.register("layers", ({ ctx }) =>
          paintLayers(ctx as Parameters<typeof paintLayers>[0], layers),
        );
        engineLayers.paint({ ctx: paintCtx });
      } else {
        /** fallback (SSR/پیش از mount) — رفتار قبلی ✓ */
        paintLayers(paintCtx, layers);
      }
    } catch (e) {
      console.warn("[BaseChart] layer paint failed:", e);
    }
  }, [layers, layout, shown, theme, priceFormat]);

  /**
   * **P1.2b — زمان‌بند رسم از هستهٔ V2:** مالک انحصاری فریم ✓.
   * ⚠️ در **اثر** ساخته می‌شود (نه در رندر ✗) — قاعدهٔ `react-hooks/refs` پروژه:
   * هیچ خواندن ref در فاز رندر مجاز نیست ✗.
   */
  const redrawSchedulerRef = useRef<RedrawScheduler | null>(null);
  /** P1.4b/۱ — نقاش لایه‌ها از هستهٔ V2 (پل مهاجرت · رفتار عیناً یکسان ✓) */
  const engineLayersRef = useRef<LayerPainter | null>(null);
  /**
   * **P1.4b/۳ — ثبت‌خانهٔ سری‌ها از هستهٔ V2:** مالک `ensure/update/drop` ✓.
   * محافظ §۸.۷: آداپتورها در **هر ساخت** تازه می‌شوند (سری تازه ✓) و فراخوان
   * با `try/catch` به `setData` برمی‌گردد ⇒ چارت هرگز نمی‌افتد ✗.
   */
  const engineSeriesRef = useRef<SeriesRegistry | null>(null);
  useEffect(() => {
    const scheduler = createRedrawScheduler({
      raf: (cb) => window.requestAnimationFrame(cb),
      onPaint: () => redrawRef.current(),
    });
    redrawSchedulerRef.current = scheduler;
    /**
     * این دو ref **مالکیت شیء هسته** را نگه می‌دارند (یک‌بار در mount ✓) — همان
     * الگوی موجود پروژه برای refهایی که فقط در اثر نوشته می‌شوند؛ کامپایلر React
     * برای «نوشتن شیء تازه در ref» سخت‌گیر است ⇒ با دلیل مستند غیرفعال می‌شود ✓.
     */
    // eslint-disable-next-line react-hooks/immutability -- مالکیت هسته در mount، یک‌بار ✓
    engineLayersRef.current = new LayerPainter();
    // eslint-disable-next-line react-hooks/immutability -- همان الگو برای ثبت‌خانهٔ سری‌ها ✓
    engineSeriesRef.current = new SeriesRegistry();
    return () => {
      scheduler.dispose(); // هیچ رسم معلقی نمی‌ماند ✓
      redrawSchedulerRef.current = null;
      engineLayersRef.current = null;
      engineSeriesRef.current = null;
    };
  }, []);

  /** همان رفتار پیشین (ادغام در یک فریم ✓) — پایدار، بدون وابستگی به `redraw` ✓ */
  const scheduleRedraw = useCallback(() => {
    redrawSchedulerRef.current?.schedule("data");
  }, []);

  // ---- امضای مقداری (نه identity): رندرهای والد نباید چارت را بازسازی کنند ----
  const themeSig = useMemo(
    () => `${theme.name}|${theme.fontFamily}|${theme.fontSize}|${JSON.stringify(theme.palette)}`,
    [theme],
  );
  const layoutSig = useMemo(() => JSON.stringify(layout), [layout]);
  const zoomKey = useMemo(
    () => (typeof layout.zoom === "string" ? layout.zoom : JSON.stringify(layout.zoom)),
    [layout.zoom],
  );
  const formatSig = useMemo(
    () => `${locale}|${typeof priceFormat === "function" ? "fn" : priceFormat}`,
    [locale, priceFormat],
  );

  // ---- همگام‌سازی رفرنس‌ها (هندلرهای LWC همیشه آخرین ظاهر را می‌بینند) ----
  useEffect(() => {
    latestRef.current = { theme, layout, shown };
    targetBandRef.current = targetBand;
    scheduleRedrawRef.current = scheduleRedraw;
    redrawRef.current = redraw;
    applyZoomRef.current = applyZoom;
  }, [theme, layout, shown, targetBand, scheduleRedraw, redraw, applyZoom]);


  /**
   * **امضای محتوا (`dataSig`)** — همان رشتهٔ پیشین ✓: با کندل تازه/تغییر قیمت
   * کندل در حال تشکیل عوض می‌شود ✓. در P2 فقط برای **تشخیص تغییر داده** به کار
   * می‌رود (اثر به‌روزرسانی ✓)، نه برای بازساخت ✗.
   */
  const dataSig = useMemo(
    () =>
      shown
        .map((s) => {
          const pts = s.type === "candlestick" ? (s.bars ?? []) : (s.points ?? []);
          const first = pts[0];
          const last = pts[pts.length - 1];
          if (!first || !last) return `${s.id}:0`;
          const lastValue = "value" in last ? last.value : last.close;
          return `${s.id}:${pts.length}:${first.t}:${last.t}:${lastValue}`;
        })
        .join(","),
    [shown],
  );

  /**
   * **کلید ساختار (`dataKey`) — P2:** فقط **ساختار پلن** (id/type/scale ✓)، نه
   * محتوای داده ✗ ⇒ افزودن کندل تازه دیگر چارت را بازسازی نمی‌کند ✓.
   * با flag خاموش، همان امضای محتوایی قبلی استفاده می‌شود ✓ (صفر تغییر رفتار ✗).
   */
  /**
   * 🟩 **مرحلهٔ ۲۴ — کلید ساخت، کاملاً پایدار شد** (خواستهٔ کاربر ✓: «اندیکاتورها بدون
   * destroy/create اضافه یا حذف بشن» ✓):
   *   پیش‌تر این کلید، **فهرست سری‌ها** را در خود داشت ✗ ⇒ هر روشن/خاموش کردن اندیکاتور
   *   ⇒ تغییر کلید ⇒ **بازساخت کامل** ✗ ⇒ پرش مقیاس/مکان ✓.
   *   حالا مقدار ثابت `"chart"` است ✓ ⇒ چارت **فقط** با تغییر واقعیِ دامنه بازسازی می‌شود:
   *   `timeframe`/`symbol` (دپسِ والد ✓) و باز شدن دروازهٔ ساخت ✓ — نه با toggle ✗.
   *   افزودن/حذف سری‌ها در اثرِ **افزایشی** زیر انجام می‌شود ✓ (`ensure/drop` ✓).
   */
  const dataKey = useMemo(() => (P2_INCREMENTAL ? "chart" : dataSig), [dataSig]);

  // ---- ساخت/بازسازی چارت ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart: IChartApi;
    try {
      /** دروازه: اگر تشخیص کلاینت تمام نشده ⇒ ساخت در صف می‌ماند */
      if (!gateOpen) return;
      chart = createChart(el, buildChartOptions(theme, layout, formatOptions));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[BaseChart] createChart failed:", e);
      // ⚠️ setState همگام داخل effect ممنوع است (react-hooks/set-state-in-effect)
      //    ⇒ پیام خطا در microtask بعدی ست می‌شود (بدون cascading render).
      queueMicrotask(() =>
        setError(`${labels?.error ?? "chart error"} (createChart): ${msg}`),
      );
      return;
    }
    chartRef.current = chart;
    seriesMapRef.current = new Map();
    /**
     * 🔴 بازبینی هجدهم — **هر ساخت = نسل تازه** (رفع باگ «Apply تایم‌فریم»):
     *   · `persistKeyRef` = کلید همین (نماد|تایم‌فریم) ✓
     *   · `armedRef=false` ⇒ آفستِ قابِ اولیه کش **نمی‌شود** ✗ (قبلاً می‌شد ✗)
     *   · نسل ++ ⇒ قاب تا اعمال زوم پنهان می‌ماند ✓ (جایگزینِ کش قدیمی ✗)
     *   · کش جهانیِ کهنه پاک می‌شود ✓ (یک‌بار در عمر صفحه ✓)
     */
    /**
     * 🟩 مرحلهٔ ۳ — **کلید یکتا: `<symbol>|<timeframe>|<chartType>`** ✓
     *   · `viewKey` از `CandleChart` = `symbol|tf` ✓ و نوع چارت از پلن سری‌ها ✓
     *   · هر ساخت = نسل تازه ✓ ⇒ هیچ state از instance قبلی نشت نمی‌کند ✓ (item 8)
     */
    const chartType = shown.some((x) => x.type === "candlestick") ? "candle" : "series";
    persistKeyRef.current = persistKeyOf(viewKey, chartType);
    /**
     * 🟩 هر ساخت از صفر: پنجرهٔ آرمانی **پاک** می‌شود ✓ ⇒ فقط اگر بازگردانی همین
     * کلید موفق شود پر می‌شود ✓ (وگرنه نمای TF/نماد قبلی به ساختِ بعدی نشت می‌کرد ✗).
     */
    wantRangeRef.current = null;
    panRangeRef.current = null;
    /**
     * 🟩 **مرحلهٔ ۱۰ — بازگردانی بازهٔ عمودی (Y)** با همان قواعد معماری ✓
     * (کلید یکتا ✓ · انقضای ۱۲h ✓ · نسخهٔ رکورد ✓ · نگهبان هم‌پوشانی با داده ✓):
     * چون فراهم‌کنندهٔ autoscale **هنگام ساخت سری** خوانده می‌شود ✓، مقدار همین‌جا و
     * پیش از حلقهٔ سری‌ها آماده می‌شود ✓.
     */
    {
      const rightSeries = shown.find((x) => (x.priceScaleId ?? "right") === "right");
      let dMin = Number.POSITIVE_INFINITY;
      let dMax = Number.NEGATIVE_INFINITY;
      if (rightSeries) {
        const bars = rightSeries.type === "candlestick" ? (rightSeries.bars ?? []) : [];
        const pts = rightSeries.type === "candlestick" ? [] : (rightSeries.points ?? []);
        for (const b of bars) {
          if (b.low < dMin) dMin = b.low;
          if (b.high > dMax) dMax = b.high;
        }
        for (const q of pts) {
          if (q.value < dMin) dMin = q.value;
          if (q.value > dMax) dMax = q.value;
        }
      }
      pinnedYRef.current = restorePriceRange(persistKeyRef.current, {
        fresh: prevViewKeyRef.current !== persistKeyRef.current || !restoredOnceRef.current,
        dataMin: Number.isFinite(dMin) ? dMin : undefined,
        dataMax: Number.isFinite(dMax) ? dMax : undefined,
      });
    }
    armedRef.current = false;
    purgeLegacyOffset();
    chartGenRef.current += 1;
    const genNow = chartGenRef.current;
    queueMicrotask(() => setChartGen(genNow));
    // هندلرها حتی پیش از اجرای effect همگام‌سازی، مقدار معتبر دارند
    latestRef.current = { theme, layout, shown };

    // ---- سری‌ها: نوع/رنگ از داده، ظاهر از تم (helper مشترک با applyOptions) ----
    seriesByIdRef.current = new Map();
    shown.forEach((s, index) => {
      /**
       * ⚠️ محافظه‌کاری کلاینت: اگر یک سری (مثلاً پنل حجم روی مقیاس مخفی) با نسخهٔ
       * نصب‌شدهٔ LWC سازگار نباشد، **همان سری** رد می‌شود و بقیهٔ چارت سالم
       * می‌ماند. این کلاس خطا در SSR دیده نمی‌شود و فقط در تب کاربر ظاهر می‌شد.
       */
      try {
      const kind = s.type ?? "line";
      const ctor = SERIES_CTORS[kind as keyof typeof SERIES_CTORS] ?? LineSeries;
      const series = chart.addSeries(
        ctor,
        seriesOptionsFor(theme, s, index, targetBand, null, undefined) as never,
      ) as unknown as ISeriesApi<never>;

      const pts =
        kind === "candlestick"
          ? (s.bars ?? []).map((b) => ({
              time: b.t as UTCTimestamp,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            }))
          : (s.points ?? []).map((p) => ({
              time: p.t as UTCTimestamp,
              value: p.value,
              /** رنگ نقطه‌به‌نقطه (پنل حجم: سبز/قرمز بر پایهٔ جهت کندل) */
              ...(p.color ? { color: p.color } : {}),
            }));
      /**
       * ⚠️ **نگهبان ترتیب زمانی (سطح موتور):** LWC زمان تکراری/نزولی را با
       * استثنا رد می‌کند و کل صفحه می‌افتد (شاهد واقعی: باکت‌های هم‌زمان‌شدهٔ DST).
       * نگهبان نقاط غیرصعودی را حذف می‌کند و در dev هشدار می‌دهد تا نقص دامنه
       * پنهان نماند؛ منبع اصلی اطمینان، ادغام برخورد در TAMC است.
       * **P1.1:** منطق به هستهٔ V2 منتقل شد (`orderPoints` — رفتار بی‌تغییر ✗).
       */
      const { ordered, dropped } = orderPoints(pts as { time: unknown }[]);
      if (dropped > 0) {
        console.warn(`[BaseChart] series "${s.id}": ${dropped} نقطهٔ غیرصعودی حذف شد`);
      }
      /**
       * **P1.4b/۳ — مسیر دادهٔ سری از هستهٔ V2:**
       *  · `ensure` آداپتور **تازهٔ همین سری** را ثبت می‌کند ✓ (پس از هر بازساخت،
       *    آداپتور کهنه جایگزین می‌شود ✓ ⇒ تلهٔ §۸.۷ بسته می‌شود)
       *  · `update` منطق **افزایشی** را تصمیم می‌گیرد: دنباله ⇒ `partial` ✓ ·
       *    بازنگری/شکل تازه ⇒ `full` (همان `setData` قبلی ✓)
       *  · محافظ: هر خطای آداپتور (سری مرده/استثنای LWC) ⇒ بازگشت به `setData` ✓
       * ⇒ رفتار فعلی عیناً یکسان ✓ و شمارنده‌های `partial/full` برای P2 فعال ✓
       */
      const engineSeries = engineSeriesRef.current;
      if (engineSeries) {
        engineSeries.ensure({ id: s.id, scaleId: s.priceScaleId ?? "right" }, {
          setData: (pts) => {
            try {
              series.setData(pts as never);
            } catch {
              /* سری مرده ⇒ بی‌صدا رد می‌شود ✓ (ساخت بعدی جایگزین می‌کند) */
            }
          },
          update: (p) => series.update(p as never),
        });
        try {
          engineSeries.update(s.id, ordered as SeriesPoint[]);
        } catch {
          /** fallback ایمن (§۸.۷): همان مسیر قبلی تا چارت هرگز نیفتد ✗ */
          series.setData(ordered as never);
        }
      } else {
        series.setData(ordered as never);
      }
      const scaleId = s.priceScaleId ?? "right";
      if (!seriesMapRef.current.has(scaleId)) seriesMapRef.current.set(scaleId, series);
      /**
       * **پنل زیرین** (دامنهٔ تاریخی · H1): سری روی یک مقیاس **کمکی/مخفی** با
       * حاشیهٔ اختصاصی (`scaleMargins`) ⇒ حجم در پایین چارت می‌نشیند و محورِ
       * قیمتِ خودش دیده نمی‌شود. الگوی محافظه‌کارانهٔ پروژه: هر خطای LWC =
       * بی‌اثر شدن پنل، نه خرابی کل چارت.
       */
      if (scaleId !== "right" && s.scaleMargins) {
        /**
         * محافظه‌کارانه: هم وجود API و هم خودِ فراخوانی بررسی می‌شود؛ در بدترین
         * حالت پنل حجم «مقیاس‌دار ولی دیدنی» می‌ماند و چارت سالم می‌ماند.
         */
        try {
          if (typeof chart.priceScale === "function") {
            chart.priceScale(scaleId).applyOptions({
              visible: false,
              scaleMargins: s.scaleMargins,
              /**
               * 🟩 **مرحلهٔ ۲۲ — بدون autofit برای پنل (حجم) هم** (شکایت کاربر ✓:
               * «با شیفت به گذشته/آینده، ارتفاع ولوم تغییر می‌کند» ✗):
               *   پنل، **مقیاس مستقل خودش** را دارد ✓ و تا پیش از این **خودکار** بود ✗
               *   ⇒ با تغییر بازهٔ دیدنی، حجمنمای پنل هم بازمقیاس می‌شد ✗.
               *   حالا `autoScale: false` ✓ ⇒ مثل مقیاس قیمت **ثابت** می‌ماند ✓ و فقط
               *   با تنظیم دستی کاربر تغییر می‌کند ✓ (`data-chart-autoscale="off"` ✓).
               */
              autoScale: false,
            });
          }
        } catch (e) {
          console.warn(`[BaseChart] pane scale "${scaleId}" skipped:`, e);
        }
      }
        seriesByIdRef.current.set(s.id, series);
      } catch (e) {
        /** یک سری معیوب، کل چارت را از کار نمی‌اندازد (خطا فقط در مرورگر دیده می‌شود) */
        console.warn(`[BaseChart] series "${s.id}" skipped:`, e);
      }
    });

    /**
     * ============================================================
     * پنل زیرین × سطر سیگنال (داستان کاربر 2026-09-23):
     * در چارت تاریخی، بج‌های سیگنال پایین چارت می‌نشینند و روی نوار حجم
     * می‌افتادند ⇒ هر دو ناخوانا. این‌جا ارتفاع **واقعی** سطر سیگنال اندازه‌گیری
     * می‌شود و پنل حجم + پایهٔ مقیاس قیمت به همان اندازه بالا می‌آیند:
     *
     *      [ کندل ]            ← مقیاس قیمت هم بالا می‌آید تا روی پنل نیفتد
     *      [ حجم ]             ← به اندازهٔ سطر سیگنال جابه‌جا شده
     *      [ بج‌های سیگنال ]   ← کاملاً خوانا
     *
     * ⚠️ فقط برای چارت‌هایی که **پنل** دارند اجرا می‌شود ⇒ چهار چارت ماکرو
     *    (بدون پنل) عیناً دست‌نخورده می‌مانند.
     * ============================================================
     */
    let panelRo: ResizeObserver | null = null;
    const applyPaneInset = () => {
      const host = containerRef.current;
      const panel = signalsRef.current;
      const slot = layout.signals;
      const paneSeries = shown.filter(
        (s) => s.priceScaleId && s.priceScaleId !== "right" && s.scaleMargins,
      );
      if (!host || paneSeries.length === 0) return;
      if (slot !== "bottom-left" && slot !== "bottom-right") return;
      const chartH = host.clientHeight;
      if (!panel || chartH <= 0) return;
      /**
       * ⚠️ حاشیهٔ مقیاس، نسبتی از **ناحیهٔ نمودار** است (بدون محور زمان) ⇒
       * مخرج کسر، ارتفاع نمودار است نه ارتفاع کل کانتینر.
       */
      const timeScaleH = chart.timeScale().height();
      const plotH = Math.max(1, chartH - timeScaleH);
      /** ارتفاع سطر سیگنال (+ فاصله تا کف چارت + تنفس) به‌صورت نسبت از ارتفاع چارت */
      const hostRect = host.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      /**
       * ⚠️ فقط `offsetHeight` کافی نیست: سطر سیگنال خودش از کف چارت فاصله دارد
       * (`bottom-7`) ⇒ فاصله تا **کف چارت** را کامل می‌گیریم تا پنل دقیقاً بالای
       * بج‌ها بنشیند (بازخورد کاربر 2026-09-23).
       */
      const insetPx = hostRect.bottom - panelRect.top + PANE_SIGNAL_GAP_PX;
      const inset = Math.min(0.35, insetPx / plotH);
      /** ارتفاع پنل از خودِ سری خوانده می‌شود (نه هاردکد) */
      const heights = paneSeries.map((s) => 1 - (s.scaleMargins!.top + s.scaleMargins!.bottom));
      const paneHeight = Math.min(0.6, Math.max(...heights));
      /**
       * 🔎 تشخیص در dev: عددهای اعمال‌شده در کنسول مرورگر (و در
       * `.next/dev/logs/next-development.log`) ثبت می‌شوند تا «عدم تداخل
       * سیگنال/حجم» بدون چشم هم قابل‌راستی‌آزمایی باشد.
       */
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[BaseChart] pane inset: bottom=${(inset * 100).toFixed(1)}% · pane=${(paneHeight * 100).toFixed(1)}% · panelTopGap=${Math.round(insetPx)}px`,
        );
      }
      host.dataset.paneInset = `${(inset * 100).toFixed(1)}|${(paneHeight * 100).toFixed(1)}`;
      for (const s of paneSeries) {
        try {
          chart.priceScale(s.priceScaleId!).applyOptions({
            visible: false,
            /** 🟩 مرحلهٔ ۲۲ — پنل هم بدون autofit ✓ (فقط چیدمانش بازمحاسبه می‌شود ✓) */
            autoScale: false,
            scaleMargins: { top: 1 - paneHeight - inset, bottom: inset },
          });
        } catch (e) {
          console.warn(`[BaseChart] pane inset "${s.priceScaleId}" skipped:`, e);
        }
      }
      try {
        chart.priceScale("right").applyOptions({
          scaleMargins: {
            top: layout.priceScale.top,
            bottom: Math.min(0.7, inset + paneHeight + 0.02),
          },
        });
      } catch (e) {
        console.warn("[BaseChart] price-scale inset skipped:", e);
      }
    };
    applyPaneInsetRef.current = applyPaneInset;   // 🟩 مرحلهٔ ۲۴ — برای افزودن سری بدون بازساخت ✓
    applyPaneInset();
    /** تغییر ارتفاع سطر (wrap شدن بج‌ها / تغییر زبان) ⇒ تطبیق خودکار */
    if (typeof ResizeObserver !== "undefined" && signalsRef.current) {
      panelRo = new ResizeObserver(() => applyPaneInset());
      panelRo.observe(signalsRef.current);
    }

    // ---- زوم پیش‌فرض (از layout) — تعویض تم بعداً این را ریست نمی‌کند ----
    applyZoom(layout.zoom);
    lastZoomKeyRef.current = zoomKey;
    /**
     * 🔴 بازبینی هجدهم — **نمای هر چارت تازه: پیش‌فرض یا حافظهٔ همان کلید**:
     *   · کلید عوض شد (تغییر TF/نماد) ⇒ نمای **پیش‌فرض همان TF** ✓ و حافظهٔ نشستِ کلید
     *     پاک می‌شود ✗ ⇒ «Apply» و «Ctrl+Shift+R» **یک ظاهر** می‌دهند ✓ (خواستهٔ صریح ✓)
     *   · کلید همان است (رفرش کندل تازه) ⇒ حافظهٔ همان کلید بازمی‌گردد ✓ (زوم نمی‌پرد ✓)
     */
    let viewSrcNow = "default";
    const pKey = persistKeyRef.current;
    if (pKey) {
      const keyChanged = prevViewKeyRef.current !== pKey;
      prevViewKeyRef.current = pKey;
      {
        /**
         * 🟩 مرحلهٔ ۳ — **بازگردانی یک‌بار** (item 7): `fresh` فقط در نخستین mount یا
         * هنگام تغییر کلید ✓ ⇒ خواندن `localStorage` درست مثل `Ctrl+Shift+R` ✓
         * و در بازساخت‌های بعدی، حافظهٔ **نشست** (تازه‌شده در هر teardown ✓) مرجع است ✓.
         */
        /**
         * 🟩 **مرحلهٔ ۸ — ترتیب اولویت:** پلِ همین نشست (`pendingViewRef` ✓ = پنجرهٔ دقیقِ
         * پیش از بازساخت ✓) ⇒ وگرنه ماژول نما (`viewPersistence` ✓). پل **یک‌بارمصرف** است ✓
         * و فقط اگر کلید یکتا **همان** باشد ✓ (وگرنه نمای TF/نماد دیگر منتقل می‌شد ✗).
         */
        const pend = pendingViewRef.current;
        const pendingOk = Boolean(pend) && pend!.key === pKey;
        const savedOne = pendingOk
          ? { from: pend!.from, to: pend!.to }
          : restoreView(pKey, { fresh: keyChanged || !restoredOnceRef.current });
        if (pendingOk) pendingViewRef.current = null; // یک‌بارمصرف ✓
        restoredOnceRef.current = true;
        const saved = savedOne;
        /**
         * 🔴 بازبینی نوزدهم + 🟩 مرحلهٔ ۳ — **نمای ذخیره‌شده زمان‌محور است، نه ایندکس ✗**:
         *   · ریشهٔ باگ «پرش پس از Apply»: `getVisibleLogicalRange()` ایندکس میله
         *     می‌داد ✗ و با رسیدن کندل تازه، اعداد به پنجرهٔ زمانی دیگری نگاشت می‌شد ✗.
         *   · حالا `restoreView` (ماژول واحد ✓) **timestamp** می‌دهد ✓ + نگهبان
         *     هم‌پوشانی با دادهٔ جاری ✓ (بازهٔ بیرون از داده ⇒ رد ⇒ زوم پیش‌فرض ✓).
         */
        /**
         * 🟩 **مرحلهٔ ۲۳** — گاردِ همپوشانی با **تلورانس** ✓ (رفع پرش مکان ✗):
         *   اگر کاربر به **آینده/فضای خالیِ راست** شیفت داده باشد (یا پنجره‌اش فقط
         *   کمی از داده بیرون باشد ✓)، گاردِ سختِ قبلی بازگردانی را **رد** می‌کرد ✗
         *   ⇒ چارت به نمای پیش‌فرض می‌پرید ✓. حالا ۱۵٪ دامنهٔ داده تلورانس داده
         *   می‌شود ✓ (بازهٔ کاملاً بی‌ربط مثل تایم‌فریم دیگر، همچنان رد می‌شود ✓).
         */
        const bounds = seriesTimeBounds(shown);
        const dataSpan = Math.max(0, Number(bounds.last ?? 0) - Number(bounds.first ?? 0));
        const slack = dataSpan > 0 ? dataSpan * 0.15 : 0;
        const overlaps =
          Boolean(saved) &&
          Boolean(bounds.last) &&
          saved!.to >= Number(bounds.first ?? 0) - slack &&
          saved!.from <= Number(bounds.last ?? 0) + slack;
        if (saved && overlaps) {
          try {
            chart.timeScale().setVisibleRange({
              from: saved.from as UTCTimestamp,
              to: saved.to as UTCTimestamp,
            });
            /** فضای خالی راستِ همین (نماد|تایم‌فریم) — همان قاعدهٔ ساخت ✓ */
            applyChartOffset(chart, persistKeyRef.current);
            /** 🟩 پنجرهٔ آرمانی ⇒ در rAF و ۱۸۰ms دوباره تأکید می‌شود ✓ (ضدِ بازنویسی LWC ✗) */
            wantRangeRef.current = { from: saved.from, to: saved.to };
            viewSrcNow = "memory";
          } catch {
            /* noop */
          }
        }
      }
    }
    /**
     * هاردنینگ (شاهد کاربر 2026-09-21): روی دادهٔ **فصلی** (نقاط کم/پراکنده)
     * رنجی که در همان تیکِ setData داده می‌شود گاهی روی فریم اول اعمال
     * نمی‌شود و چارت روی «همهٔ تاریخ» می‌ماند (چارت استرالیا از 1997).
     * یک‌بار در فریم بعد همان زوم تأیید می‌شود — idempotent و فقط بلافاصله
     * پس از ساخت چارت (زوم دستی بعدی کاربر دست‌نخورده می‌ماند).
     */
    window.requestAnimationFrame(() => {
      if (chartRef.current !== chart) return; // چارت بازسازی شده ⇒ لازم نیست
      /**
       * 🔴 بازبینی نوزدهم — **ترتیب/مالکیت نما** (رفع باگ «پرش پس از Apply»):
       *   · اگر نما از حافظهٔ همان کلید آمد (`viewSrcNow === "memory"`)، زومِ
       *     پیش‌فرض **دوباره اعمال نمی‌شود** ✗ — پیش‌تر همین rAF نما را باطل
       *     می‌کرد و کاربر «پرش به یک نمای زوم‌شدهٔ دیگر» می‌دید ✗.
       *   · در نخستین ساخت (بدون حافظه) همان زوم پیش‌فرض اعمال می‌شود ✓.
       */
      /**
       * 🟩 **مرحلهٔ ۸ — بازتأکید در فریم نخست** (رفع «پرش با روشن/خاموش اندیکاتور» ✗):
       *   پیش‌تر در حالتِ «از حافظه» این‌جا **هیچ‌کاری** نمی‌شد ✗؛ ولی LWC در فریم اول
       *   می‌تواند نمای خودش (پیش‌فرض) را بگذارد ⇒ پنجرهٔ کاربر ریست می‌شد ✗.
       *   حالا همان پنجرهٔ آرمانی **دوباره** اعمال می‌شود ✓ (با آفست همان کلید ✓).
       */
      const want = wantRangeRef.current;
      if (want) {
        try {
          chart.timeScale().setVisibleRange({
            from: want.from as UTCTimestamp,
            to: want.to as UTCTimestamp,
          });
          applyChartOffset(chart, persistKeyRef.current);
        } catch {
          /* noop */
        }
      } else {
        applyZoom(layout.zoom);
      }
      /** 🆕 زوم تأیید شد ⇒ کلیدِ نما ثبت می‌شود و چارت با **همان** نما آشکار ✓ */
      setReadyKey(zoomKey);
      /** 🔴 بازبینی هجدهم: نسلِ همین چارت آشکار می‌شود ✓ (نسلِ کهنه آشکار نمی‌شود ✗) */
      setReadyGen(genNow);
      setViewSrc(viewSrcNow);
      /** 🟩 مرحلهٔ ۲۶ — بازرسی: آفستِ راستِ واقعاً اعمال‌شده (میله ✓) */
      {
        const host = containerRef.current;
        if (host) {
          host.dataset.chartRightOffsetApplied = String(lastAppliedOffsetBars);
          host.dataset.chartRightOffsetPx = String(lastAppliedOffsetPx);
        }
      }
      setOffsetKeyUi(persistKeyRef.current);
      setViewKeyUi(persistKeyRef.current);
      setViewAgeUi(viewAgeMs(persistKeyRef.current));
    });
    /**
     * 🆕 **تورِ ایمنی:** اگر به هر دلیلی rAF اجرا نشد، چارت **هرگز پنهان نمی‌ماند** ✗
     * (بعد از ۴۰۰ms آشکار می‌شود ✓ — تجربهٔ کاربر قربانی نمی‌شود ✓).
     */
    const revealFallback = window.setTimeout(() => {
      setReadyKey(zoomKey);
      setReadyGen(genNow);
    }, 400);
    /**
     * 🟩 تورِ دوم (۱۸۰ms): اگر LWC نمای پایه را با تأخیر تنظیم کند، پنجرهٔ کاربر
     *    دوباره تأکید می‌شود ✓ (idempotent ✓ و مقید به «همان چارت» ✓).
     */
    const reassertView = window.setTimeout(() => {
      const want = wantRangeRef.current;
      if (!want || chartRef.current !== chart) return;
      try {
        chart.timeScale().setVisibleRange({
          from: want.from as UTCTimestamp,
          to: want.to as UTCTimestamp,
        });
        applyChartOffset(chart, persistKeyRef.current);
      } catch {
        /* noop */
      }
    }, 180);
    /**
     * 🟩 **مرحلهٔ ۱۸ — «fit اولیه» فقط یک‌بار** (خواستهٔ کاربر ✓):
     *   در فریم نخست، بازهٔ خودکارِ LWC (که کندل‌ها را در کادر می‌نشاند ✓) خوانده
     *   می‌شود و سپس با provider **تثبیت** می‌گردد ✓ ⇒ از آن به بعد مقیاس
     *   **auto-zoom نمی‌کند** ✗ و فقط با درگِ کاربر حرکت می‌کند ✓.
     */
    window.requestAnimationFrame(() => {
      if (chartRef.current !== chart) return;
      /**
       * 🟩 **مرحلهٔ ۲۳ — اولویتِ بازهٔ Y در ساخت تازه:**
       *   ① پلِ همان کلید (اگر بازساخت به‌خاطر toggle بود ✓) ⇒ مقیاس **عیناً قبل** ✓
       *   ② وگرنه (فقط با flagِ پنِ سفارشی ✓) قفلِ fit اولیه ✓
       */
      const pendY = pendingYRef.current;
      if (pendY && pendY.key === persistKeyRef.current) {
        pendingYRef.current = null; // یک‌بارمصرف ✓
        applyPriceRange(pendY.range);
        return;
      }
      if (ENABLE_CUSTOM_Y_PAN && !panRangeRef.current) {
        const r = visiblePriceRange(chart, seriesMapRef.current.get("right"));
        if (r) {
          panRangeRef.current = r;
          applyPriceRange(r);
        }
      }
    });
    scheduleRedraw();

    // ---- Tooltip (رنگ‌ها همیشه از تم جاری — بدون stale closure) ----
    const onCrosshair = (param: MouseEventParams) => {
      const { theme: th, layout: ly, shown: sh } = latestRef.current ?? { theme, layout, shown };
      if (ly.tooltip === "none" || !param.point || param.time === undefined) {
        setTip((t) => (t.visible ? { ...t, visible: false } : t));
        return;
      }
      const lines: { label: string; color: string; value: number }[] = [];
      let i = 0;
      for (const s of sh) {
        /**
         * ⚠️ FIX (2026-09-22): مقدار هر خط باید از **خودِ همان سری** خوانده شود.
         * قبلاً `seriesMapRef` (نقشهٔ «مقیاس قیمت → اولین سری») استفاده می‌شد و
         * برای همهٔ خطوط مقدار **سری اول** نمایش داده می‌شد؛ کاربر این را
         * «جای نادرست نسبت به محور Y» می‌دید. حالا با شناسهٔ سری جست‌وجو می‌کنیم.
         */
        const api = seriesByIdRef.current.get(s.id);
        const sd = api
          ? (param.seriesData.get(api as never) as { value?: number; close?: number } | undefined)
          : undefined;
        const v = sd?.value ?? sd?.close;
        if (v === undefined || v === null) {
          i++;
          continue;
        }
        lines.push({ label: s.label ?? s.id, color: seriesColorOf(th, s, i), value: Number(v) });
        i++;
      }
      if (!lines.length) {
        setTip((t) => (t.visible ? { ...t, visible: false } : t));
        return;
      }
      setTip({ visible: true, x: param.point.x, lines });
    };
    chart.subscribeCrosshairMove(onCrosshair);
    /**
     * 🆕 **جای آخرین کندل همیشه نسبتی از عرض بماند** (بازبینی یازدهم ✓):
     * با زوم/اسکرول کاربر یا تغییر عرض، `barSpacing` عوض می‌شود ⇒ بازمحاسبه ✓
     * (`applyAnchorRatio` خودش idempotent است ⇒ بدون حلقهٔ رویداد ✗).
     */
    const onLogicalRange = () => {
      /**
       * 🔴 بازبینی هجدهم: آفست **یک‌بار در هر ساخت** اعمال می‌شود (درست پیش از زوم ✓)
       * ⇒ این‌جا دیگر اعمال نمی‌شود ✗ (قبلاً هر پنِ کاربر را به آفست قدیمی «قفل»
       * می‌کرد و پرش می‌داد ✗). فقط ذخیرهٔ محلِ کاربر می‌ماند ✓ — با کلید **همین**
       * (نماد|تایم‌فریم) ✓ ⇒ هیچ آفستی به TF دیگر قرض نمی‌رود ✗.
       */
      if (!armedRef.current) return;
      const px = currentOffsetPx(chart);
      if (px !== null) saveOffsetPx(persistKeyRef.current, px);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRange);
    /** بعد از نخستین اعمال آفست «مسلح» می‌شویم */
    window.setTimeout(() => {
      armedRef.current = true;
    }, 600);
    window.addEventListener("resize", onLogicalRange);
    /**
     * 🟩 **مرحلهٔ ۱۰ — حفظ در لحظهٔ ترک صفحه** (رفع شکافِ «رفرش سخت» ✗):
     * با `Ctrl+Shift+R`/بستن تب، `teardown` ری‌اکت تضمینی نیست ✗ ⇒ این‌جا **خودمان**
     * نما و بازهٔ عمودی را در همان کشِ معماری می‌نویسیم ✓ (کلید یکتا · ۱۲h · نسخه ✓).
     */
    const persistNow = () => {
      if (!persistKeyRef.current) return;
      try {
        const r = chart.timeScale().getVisibleRange();
        if (r && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))) {
          saveView(persistKeyRef.current, { from: Number(r.from), to: Number(r.to) });
        }
      } catch {
        /* noop */
      }
      const y = manualPriceRange(chart, seriesMapRef.current.get("right"));
      if (y) savePriceRange(persistKeyRef.current, y);
    };
    const onHidden = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    /**
     * 🟩 **مرحلهٔ ۱۶ — پنِ عمودی با ماوس** (خواستهٔ صریح کاربر ✓: «با ماوس دراگ کنم بالا/پایین برود»):
     *   · LWC با ماوس، کشیدن روی بدنه را فقط **زمانی** می‌کند ✗ ⇒ این‌جا عمودی را هم می‌گیریم ✓:
     *     `pointerdown` روی **بدنه** (نه محور قیمت ✗ — آن را به خود LWC می‌سپاریم ✓) ⇒
     *     بازهٔ دیدنی فعلی snapshot ⇒ با هر `pointermove` بازه **shift** می‌شود ✓ و
     *     `nudgePriceScale` مقیاس را بازمحاسبه می‌کند ✓ ⇒ چارت با ماوس بالا/پایین می‌رود ✓✓.
     *   · در پایان درگ، بازه در **کش نما** ذخیره می‌شود ✓ (همان قاعدهٔ مرحلهٔ ۱۰ ✓).
     *   · افقی دست‌نخورده: کشیدن، هم‌زمان زمان را هم پن می‌کند ✓ (LWC خودش ✓) ⇒ درگِ مورب = X+Y ✓.
     */
    let panStart: { y: number; range: { min: number; max: number } } | null = null;
    /**
     * 🟩 **مرحلهٔ ۱۹** — درگِ پنِ عمودی فقط وقتی شروع می‌شود که اشاره‌گر **داخل بدنهٔ
     * چارت** باشد ✓ (نه روی محور زمانِ پایین ✗ و نه بیرون ✓). ناحیهٔ محور قیمت هم
     * حالا مشکلی ندارد ✓ چون زومِ درگِ محور خاموش شده است ✓ (بدون اختلاط zoom+pan ✓).
     */
    const isInPane = (ev: PointerEvent): boolean => {
      try {
        const rect = el.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const h = chart.paneSize(0).height;
        return h > 0 && y >= 0 && y <= h;
      } catch {
        return false;
      }
    };
    /**
     * 🟩 **ریست واقعی مقیاس** (دابل‌کلیک ✓): providerِ ما برداشته می‌شود ✗ و LWC
     * دوباره **خودکار** می‌شود ✓ ⇒ چارت به fit برمی‌گردد ✓ (آزادسازی دائمی ✓).
     */
    const resetPriceScale = () => {
      panRangeRef.current = null;
      pinnedYRef.current = null;
      if (persistKeyRef.current) clearPriceRange(persistKeyRef.current);
      shown.forEach((spec, index) => {
        const api = seriesByIdRef.current.get(spec.id);
        if (!api) return;
        try {
          (api as unknown as { applyOptions: (o: unknown) => void }).applyOptions(
            seriesOptionsFor(theme, spec, index, targetBand, null, () => null),
          );
        } catch {
          /* noop */
        }
      });
      try {
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* noop */
      }
      scheduleRedrawRef.current();
    };
    /**
     * 🟩 **مرحلهٔ ۱۸ — اعمال مستقیم بازهٔ Y روی همهٔ سری‌های مقیاس راست**:
     *   `applyOptions({ autoscaleInfoProvider })` با یک **تابع تازه** در هر گام ⇒
     *   LWC مقیاس را «کثیف» می‌بیند و **بلافاصله** بازمحاسبه می‌کند ✓ (تریگر قوی و
     *   رسمی ✓ — برخلاف جیترِ `scaleMargins` مرحلهٔ ۱۶ که مطمئن تریگر نمی‌کرد ✗✓).
     *   همچنین چون همین provider **همیشه** یک بازهٔ ثابت می‌دهد، مقیاس **auto-zoom
     *   نمی‌کند** ✗ (خواستهٔ کاربر ✓: «زوم خودکار نمی‌خوام» ✓) و پن فقط با کاربر است ✓.
     */
    const applyPriceRange = (range: { min: number; max: number }) => {
      for (const spec of shown) {
        if ((spec.priceScaleId ?? "right") !== "right") continue;
        const api = seriesByIdRef.current.get(spec.id);
        if (!api) continue;
        try {
          (api as unknown as { applyOptions: (o: unknown) => void }).applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: range.min, maxValue: range.max },
              margins: { above: 0, below: 0 },
            }),
          });
        } catch {
          /* noop */
        }
      }
    };

    const onPanDown = (ev: PointerEvent) => {
      /** 🟩 فقط ماوس ✓ — لمس در موبایل/تبلت توسط `vertTouchDrag` خودِ LWC ✓ (بدون دوبل‌شدن ✗) */
      if (ev.pointerType !== "mouse") return;
      if (ev.button !== 0 || !isInPane(ev)) return;
      const r = visiblePriceRange(chart, seriesMapRef.current.get("right"));
      if (!r) return;
      panStart = { y: ev.clientY, range: r };
      try {
        /** مالکیت Y را به providerِ خودمان می‌دهیم ✓ (autoScale=false از درگ محور ✗ باقی نماند ✓) */
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* noop */
      }
    };
    const onPanMove = (ev: PointerEvent) => {
      if (!panStart) return;
      const h = chart.paneSize(0).height || 0;
      const span = panStart.range.max - panStart.range.min;
      if (!(h > 0) || !(span > 0)) return;
      const dyPx = ev.clientY - panStart.y;
      /** آستانه: حرکت عمودی ناچیز (درگِ افقیِ خالص ✓ یا لرزش ماوس ✓) ⇒ Y را دست نزن ✓ */
      if (Math.abs(dyPx) < 6) return;
      const shift = (dyPx / h) * span;
      const nextRange = {
        min: panStart.range.min + shift,
        max: panStart.range.max + shift,
      };
      panRangeRef.current = nextRange;
      applyPriceRange(nextRange);
      scheduleRedrawRef.current();
    };
    const onPanUp = () => {
      if (!panStart) return;
      const netDy = panRangeRef.current ? 1 : 0; // صرفاً برای خوانایی؛ محاسبهٔ واقعی پایین ✓
      void netDy;
      panStart = null;
      /**
       * 🔴 **اصلاح باگ مرحلهٔ ۱۶ (مرحلهٔ ۱۷):** پیش‌تر این‌جا بازهٔ Y **ذخیره** می‌شد ✗
       * ⇒ هر رهاکردن ماوس (حتی درگِ افقی با `dy≈0` ✗ یا یک کلیکِ ساده ✗) مقیاس را
       * «تثبیت» می‌کرد ⇒ چارت از **auto-fit** خارج می‌شد ✗ و «قفل» می‌ماند ✓
       * (کاربر فقط با دابل‌کلیک روی محور آزادش می‌کرد ✓).
       * حالا: پنِ عمودی **موقتی و نشستی** است ✓ — ذخیره‌ای انجام نمی‌شود ✗ ⇒ با هر
       * بازساخت چارت (کندل/اندیکاتور ✓) خودبه‌خود به مقیاس خودکار برمی‌گردد ✓✓.
       * برای «آزادسازی فوری» هم دابل‌کلیک روی محور قیمت ⇒ `clearPriceRange` ✓.
       */
    };
    /** 🟩 دابل‌کلیک روی محور قیمت ⇒ Y ذخیره‌شده هم پاک شود ✓ (آزادسازی دائمی ✓) */
    const onAxisDblClick = () => resetPriceScale();
    if (ENABLE_CUSTOM_Y_PAN) {
      el.addEventListener("dblclick", onAxisDblClick);
      el.addEventListener("pointerdown", onPanDown);
    }
    if (ENABLE_CUSTOM_Y_PAN) {
      window.addEventListener("pointermove", onPanMove);
      window.addEventListener("pointerup", onPanUp);
    }
    document.addEventListener("visibilitychange", onHidden);

    // ---- repaint لایه‌ها با تغییر بازه/اندازه (همیشه با آخرین ظاهر) ----
    const repaint = () => scheduleRedrawRef.current();
    chart.timeScale().subscribeVisibleLogicalRangeChange(repaint);
    const ro = new ResizeObserver(repaint);
    ro.observe(el);

    // ---- دستهٔ عمومی برای دامنه (مقادیر از رفرنس‌های زنده) ----
    /**
     * 🟩 **مرحلهٔ ۲۴** — ساختِ **یک سری تازه روی چارت موجود** (بدون destroy/create ✓):
     *   همان منطقِ حلقهٔ ساخت ✓ ولی با **تمِ جاری** (`latestRef` ✓) و باند هدفِ جاری ✓،
     *   به‌علاوهٔ `engineSeries.ensure` (ثبت آداپتور برای به‌روزرسانی‌های بعدی ✓) و
     *   پیکربندی مقیاس کمکی (پنل ✓) — همه با try/catch (یک سری معیوب چارت را نمی‌اندازد ✗).
     */
    ensureSeriesRef.current = (specs: ChartSeriesInput[]) => {
      const th = latestRef.current?.theme ?? theme;
      const band = targetBandRef.current;
      const chType = shown.some((x) => x.type === "candlestick") ? "candle" : "series";
      void chType;
      specs.forEach((spec, index) => {
        if (seriesByIdRef.current.has(spec.id)) return;
        const kind = spec.type ?? "line";
        const Ctor = SERIES_CTORS[kind as keyof typeof SERIES_CTORS] ?? LineSeries;
        let series: ISeriesApi<never>;
        try {
          series = chart.addSeries(
            Ctor,
            seriesOptionsFor(th, spec, index, band, null, undefined) as never,
          ) as unknown as ISeriesApi<never>;
        } catch (e) {
          console.warn(`[BaseChart] addSeries "${spec.id}" skipped:`, e);
          return;
        }
        const raw =
          kind === "candlestick"
            ? (spec.bars ?? []).map((b) => ({
                time: b.t as UTCTimestamp,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
              }))
            : (spec.points ?? []).map((q) => ({
                time: q.t as UTCTimestamp,
                value: q.value,
                ...(q.color ? { color: q.color } : {}),
              }));
        const { ordered } = orderPoints(raw as { time: unknown }[]);
        const engineSeries = engineSeriesRef.current;
        if (engineSeries) {
          engineSeries.ensure({ id: spec.id, scaleId: spec.priceScaleId ?? "right" }, {
            setData: (pts) => {
              try {
                series.setData(pts as never);
              } catch {
                /* noop */
              }
            },
            update: (p) => series.update(p as never),
          });
          try {
            engineSeries.update(spec.id, ordered as SeriesPoint[]);
          } catch {
            series.setData(ordered as never);
          }
        } else {
          series.setData(ordered as never);
        }
        const scaleId = spec.priceScaleId ?? "right";
        if (!seriesMapRef.current.has(scaleId)) seriesMapRef.current.set(scaleId, series);
        if (scaleId !== "right" && spec.scaleMargins) {
          try {
            chart.priceScale(scaleId).applyOptions({
              visible: false,
              autoScale: false,
              scaleMargins: spec.scaleMargins,
            });
          } catch (e) {
            console.warn(`[BaseChart] pane scale "${scaleId}" skipped:`, e);
          }
        }
        seriesByIdRef.current.set(spec.id, series);
      });
      applyPaneInsetRef.current?.();
      scheduleRedrawRef.current();
    };

    onHandle?.({
      chart,
      setZoom: (z) => applyZoomRef.current(z),
      redraw: () => scheduleRedrawRef.current(),
    });

    /** بازگردانی نما پیش‌تر و درست پیش از زوم انجام شد (بلوک E5 ✓) */

    return () => {
      try {
        chart.unsubscribeCrosshairMove(onCrosshair);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRange);
        window.removeEventListener("resize", onLogicalRange);
        window.removeEventListener("pagehide", persistNow);
        el.removeEventListener("dblclick", onAxisDblClick);
        el.removeEventListener("pointerdown", onPanDown);
        window.removeEventListener("pointermove", onPanMove);
        window.removeEventListener("pointerup", onPanUp);
        document.removeEventListener("visibilitychange", onHidden);
        ro.disconnect();
        panelRo?.disconnect();
        /** 🆕 تورِ ایمنی نمایش نباید بعد از تخریب چارت شلیک کند ✓ */
        window.clearTimeout(revealFallback);
        window.clearTimeout(reassertView);
        /**
         * **حفظ نما (زنده):** قبل از تخریب، بازهٔ دیدنی فعلی ذخیره می‌شود تا در
         * بازساخت بعدی (کندل تازه) همان‌جا بماند. باگ واقعی: `chart.remove()`
         * زوم/اسکرول کاربر را با هر رفرش زنده بازنشانی می‌کرد ✗
         */
        if (persistKeyRef.current) {
          try {
            /**
             * 🟩 مرحلهٔ ۳ — ذخیره در **ماژول واحد مدیریت نما** ✓:
             *   · **زمان‌محور** (`getVisibleRange` ⇒ timestamp ✓) نه ایندکس میله ✗
             *   · با کلید یکتا `<symbol>|<timeframe>|<chartType>` ✓
             *   · قاعدهٔ item 13: کندل تازه اضافه شود، نما ثابت بماند ✓ (بدون پرش ✗)
             */
            const r = chart.timeScale().getVisibleRange();
            if (r && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))) {
              const range = { from: Number(r.from), to: Number(r.to) };
              saveView(persistKeyRef.current, range);
              /** 🟩 پل نسل‌ها: همین پنجره به ساخت بعدی منتقل می‌شود ✓ (بدون پرش ✗) */
              pendingViewRef.current = { key: persistKeyRef.current, ...range };
              /**
               * 🟩 مرحلهٔ ۲۳/۲۵ — فقط **پلِ Y در همان نشست** ✓ (بی‌نوشت‌در‌کش ✗).
               * ⛔ ذخیرهٔ Y در کشِ نما **حذف شد** ✗ (مرحلهٔ ۱۰ ⇒ ۲۵): از مرحلهٔ ۲۱
               * «اتوفیت» خاموش است و pin فعال نیست ✗ ⇒ آن فیلد فقط گمراهی می‌ساخت ✓.
               */
              const yNow = visiblePriceRange(chart, seriesMapRef.current.get("right"));
              if (yNow) pendingYRef.current = { key: persistKeyRef.current, range: yNow };
              /**
               * ⛔ **مرحلهٔ ۲۵ — ذخیرهٔ Y در کش حذف شد** ✗ (بی‌مصرف و مایهٔ سردرگمی ✗):
               *   از مرحلهٔ ۲۱ اتوفیت خاموش است و pin بی‌اثر ✗ ⇒ این ذخیره هیچ‌وقت
               *   خوانده نمی‌شد ✓. (پلِ نشستیِ Y بالا کافی است ✓.)
               */
            }
          } catch {
            /* noop */
          }
        }
        chart.remove();
      } catch {
        /* noop */
      }
      chartRef.current = null;
      seriesMapRef.current = new Map();
      seriesByIdRef.current = new Map();
      latestRef.current = null;
    };
    // ⚠️ deps عمداً «ساختاری» است (dataKey/deps): تغییر تم/چینش/فونت چارت را
    //    بازسازی نمی‌کند (زوم/اسکرول کاربر حفظ می‌شود) — اعمال زنده در effect بعدی.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, ...deps, gateOpen]);

  /**
   * **P2 (۹.۲.۱+۹.۲.۲) — به‌روزرسانی دادهٔ سری بدون بازساخت چارت:**
   * با تغییر محتوای داده (`dataSig`) و در حالت افزایشی، فقط
   * `SeriesRegistry.update(id, points)` صدا زده می‌شود ✓ (سری‌ها از
   * `seriesByIdRef` زنده‌اند ✓). هیچ دست‌زدنی به پنل‌ها/مقیاس‌ها/موتور ✗.
   * محافظ: هر خطا ⇒ `setData` روی همان سری ✓ (چارت هرگز نمی‌افتد ✗).
   */
  useEffect(() => {
    if (!P2_INCREMENTAL) return; // خاموش ⇒ رفتار قبلی ✓
    const engineSeries = engineSeriesRef.current;
    if (!engineSeries) return;
    /**
     * 🟩 **مرحلهٔ ۲۴ — افزودن/حذف سری‌ها روی همان چارت** (خواستهٔ کاربر ✓):
     *   · سری‌های `shown` که در چارت نیستند ⇒ `ensureSeriesRef` می‌سازد ✓
     *   · سری‌های چارت که در `shown` نیستند ⇒ `engineSeries.drop` + `chart.removeSeries` ✓
     *   ⇒ هیچ destroy/create ای رخ نمی‌دهد ✗ ⇒ **مقیاس و مکان دست‌نخورده** ✓✓
     *   (اگر چیزی خطا بدهد ⇒ همان چارت سالم می‌ماند ✓ و کاربر با تغییر TF/نماد بازسازی می‌گیرد ✓.)
     */
    const wanted = new Set(shown.map((x) => x.id));
    const incoming = shown.filter((x) => !seriesByIdRef.current.has(x.id));
    if (incoming.length && ensureSeriesRef.current) ensureSeriesRef.current(incoming);
    const gone: string[] = [];
    seriesByIdRef.current.forEach((_api, id) => {
      if (!wanted.has(id)) gone.push(id);
    });
    if (gone.length) {
      for (const id of gone) {
        try {
          engineSeries.drop(id);
        } catch {
          /* noop */
        }
        const api = seriesByIdRef.current.get(id);
        try {
          /** از `chartRef` استفاده می‌کنیم ✓ (در این نقطه هنوز `chart0` تعریف نشده ✓) */
          if (api) chartRef.current?.removeSeries(api as never);
        } catch {
          /* noop */
        }
        seriesByIdRef.current.delete(id);
      }
      /** مقیاس‌های کمکیِ بی‌استفاده در `seriesMapRef` می‌مانند (بی‌ضرر ✓) */
      applyPaneInsetRef.current?.();
      scheduleRedrawRef.current();
    }
    /**
     * 🟩 **مرحلهٔ ۶ — حفظ نما حول به‌روزرسانی داده** (رفع باگ «زوم خودکار بعد از مدی
     * باز بودن چارت» ✗ — بدون دخالت کاربر):
     *   · ریشه: وقتی شکل داده عوض شود، `SeriesRegistry.update` مسیر **`full`**
     *     (`setData` ✗) را می‌گیرد؛ LWC بازهٔ **logical** (ایندکس میله ✗) را نگه
     *     می‌دارد ⇒ با لغزش پنجرهٔ داده (سقف ۵۰۰۰ کندل ✓ / عوض‌شدن کندل در حال
     *     تشکیل ✓) همان اعداد به **پنجرهٔ زمانی دیگری** نگاشت می‌شوند ✗ ⇒ چارت
     *     «خودش» روی یک محدودهٔ دیگر زوم می‌شود ✓.
     *   · رفع: پنجرهٔ دیدنی **قبل** از به‌روزرسانی snapshot می‌شود و **بعد** از آن
     *     (یک فریم + ۱۸۰ms ✓) دوباره اعمال می‌شود ✓ ⇒ کاربر هیچ پرشی نمی‌بیند ✗.
     *     (ر.ک. §۱۳.۱۵ · معیار: `data-view-reassert` در DOM ✓)
     */
    const chart0 = chartRef.current;
    /**
     * 🟩 **مرحلهٔ ۱۲ — snapshot با بازهٔ *logical*** (رفع «چارت موقع تازه‌سازی داده جابه‌جا
     * می‌شود» ✗):
     *   · `getVisibleRange()` فقط بازهٔ **دادهٔ** دیدنی را می‌دهد ✗ و **فضای خالی راست**
     *     را شامل نمی‌شود ✗ ⇒ بازگردانی با `setVisibleRange` + آفست، پنجره را **کمی
     *     می‌لغزاند** ✗ (همان جابجاییِ محسوس با هر کندل تازه ✓).
     *   · `getVisibleLogicalRange()` **دقیقاً** همان چیزی است که کاربر می‌بیند ✓ (میله‌های
     *     خالی سمت راست هم داخل آن‌اند ✓) و چون این snapshot **بلافاصله پیش از** به‌روزرسانی
     *     **همان چارت** گرفته می‌شود ✓ ایندکس‌ها پایدارند ✓ (drift ندارد ✗ — drift مربوط
     *     به کشِ **بین‌نشستی** است که همان زمان‌محور می‌ماند ✓).
     */
    let before: { from: number; to: number } | null = null;
    try {
      const r = chart0?.timeScale().getVisibleLogicalRange();
      if (r && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))) {
        before = { from: Number(r.from), to: Number(r.to) };
      }
    } catch {
      before = null;
    }
    for (const s of shown) {
      const raw = s.type === "candlestick" ? (s.bars ?? []) : (s.points ?? []);
      if (!raw.length) continue;
      const pts = orderPoints(
        raw.map((p) => {
          const q = p as { t: number; value?: number; color?: string; open?: number; high?: number; low?: number; close?: number };
          return s.type === "candlestick"
            ? { time: q.t, open: q.open, high: q.high, low: q.low, close: q.close }
            : { time: q.t, value: q.value, ...(q.color ? { color: q.color } : {}) };
        }) as { time: unknown }[],
      ).ordered as SeriesPoint[];
      try {
        engineSeries.update(s.id, pts);
      } catch {
        /** fallback ایمن: همان مسیر مستقیم ✓ */
        const api = seriesByIdRef.current.get(s.id);
        try {
          api?.setData(pts as never);
        } catch {
          /* noop */
        }
      }
    }
    /** 🟩 بازاعمال snapshot پنجره (ضدِ driftِ `setData` ✗) — با نگهبان «همان چارت» */
    if (chart0 && before) {
      const snap = before;
      const reassert = () => {
        if (chartRef.current !== chart0) return; // چارت بازسازی شد ⇒ لازم نیست ✓
        try {
          /**
           * 🟩 بازگردانی عیناً همان بازهٔ دیدنی (logical ✓) — **بدون** `setVisibleRange`
           * و **بدون** آفست ✗ (هر دوی آن‌ها پنجره را جابه‌جا می‌کردند ✗). اینجا میله‌های
           * خالیِ سمت راست هم بخشی از بازهٔ logical هستند ✓ ⇒ صفر جابجایی ✗.
           */
          chart0.timeScale().setVisibleLogicalRange({ from: snap.from, to: snap.to });
          const host = containerRef.current;
          if (host) {
            host.dataset.viewReassert = String(Number(host.dataset.viewReassert ?? 0) + 1);
          }
        } catch {
          /* noop */
        }
      };
      window.requestAnimationFrame(reassert);
      window.setTimeout(reassert, 180);
    }
  }, [dataSig, shown]);

  /**
   * **۹.۲.۴ — انتشار سنجه‌ها برای اندازه‌گیری زنده:** روی کانتینر چارت
   * (`[data-engine]`) ⇒ در کنسول مرورگر قابل خواندن است ✓:
   * ```js
   * [...document.querySelectorAll("[data-engine]")].map(e => e.dataset.engine)
   * ```
   * چهار معیار P2: زوم (`ViewMemory`) · نسل (`chart.remove()` ✗) ·
   * `created/dropped` (باید صفر باشد ✓) · `partial` (>0 ✓) · `painted/skipped` ✓
   */
  useEffect(() => {
    if (!P2_INCREMENTAL) return;
    const host = containerRef.current;
    const engineSeries = engineSeriesRef.current;
    if (!host || !engineSeries) return;
    const s = engineSeries.stats();
    const l = engineLayersRef.current?.stats();
    host.dataset.engine =
      `created=${s.created},partial=${s.partial},full=${s.full},dropped=${s.dropped}` +
      `,painted=${l?.painted ?? 0},skipped=${l?.skipped ?? 0}`;
  }, [dataSig]);

  /**
   * ---- اعمال زندهٔ ظاهر: theme · layout · رنگ سری‌ها · زوم ----
   * چارت بازسازی نمی‌شود (applyOptions) و اگر مقدار زوم عوض نشده باشد،
   * موقعیت زوم/اسکرول کاربر دست‌نخورده می‌ماند.
   * وابستگی‌ها «امضای مقداری»اند: رندر مجدد والد هیچ کار اضافه‌ای نمی‌سازد.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.applyOptions(buildChartOptions(theme, layout, formatOptions));
      shown.forEach((s, index) => {
        seriesByIdRef.current
          .get(s.id)
          ?.applyOptions(seriesOptionsFor(theme, s, index, { low: bandLow, high: bandHigh }, null, undefined) as never);
      });
      if (lastZoomKeyRef.current !== zoomKey) {
        lastZoomKeyRef.current = zoomKey;
        applyZoomRef.current(layout.zoom);
      }
      scheduleRedrawRef.current();
    } catch (e) {
      console.warn("[BaseChart] applyOptions failed:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeSig, layoutSig, zoomKey, formatSig, bandLow, bandHigh]);


  // ---- حالت‌های خطا/خالی (بدون کرش) ----
  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded border border-border bg-surface-2 text-xs text-warn",
          className,
        )}
        style={{ height }}
        data-chart-state="error"
      >
        {error}
      </div>
    );
  }
  if (shown.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded border border-border bg-surface-2 text-xs text-muted",
          className,
        )}
        style={{ height }}
        data-chart-state="empty"
      >
        {labels?.empty ?? "—"}
      </div>
    );
  }

  // ---- رندر: چارت + بوم لایه‌ها + سیگنال‌ها + لجند + Tooltip ----
  /** 🆕 نمای تأییدشده = کلید فعلی ✓ (یک فریم پنهان، بعد آشکار ✓ — ضدِ فلاش ✗) */
  const viewReady = readyKey === zoomKey && readyGen === chartGen;


  const legendItems =
    layout.legend === "none"
      ? []
      : shown.map((s, i) => ({
          label: s.label ?? s.id,
          color: seriesColorOf(theme, s, i),
          dashed: Boolean(s.dashed || s.lineStyle === "dashed"),
        }));

  return (
    <div
      /** 🆕 تا نمای درست آماده نشود پنهان است ✓ (ضدِ فلاشِ چارت قبلی ✗) */
      data-chart-ready={viewReady ? "1" : "0"}
      data-chart-gate={gateAttr}
      className={cn(
        "relative w-full transition-opacity duration-150",
        viewReady ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ height: safeHeight, backgroundColor: theme.palette.background }}
      data-chart-state="ready"
      data-chart-theme={theme.name}
      /* 🔴 بازبینی هجدهم — بازرسی «Apply vs Ctrl+Shift+R» در DOM:
         · gen ⇒ هر Apply = نسل تازه (re-init کامل ✓)
         · view-src ⇒ default (TF عوض شد ✓) یا memory (رفرش همان کلید ✓)
         · offset-key ⇒ کلید کش آفست همین (نماد|تایم‌فریم) ✓ */
      data-chart-gen={String(chartGen)}
      data-chart-view-src={viewSrc}
      data-chart-offset-key={offsetKeyUi}
      /* 🟩 مرحلهٔ ۳ — ماژول واحد نما: کلید یکتا · سن حافظه · خودآزمون ماژول */
      data-view-key={viewKeyUi}
      data-view-age={viewAgeUi === null ? "none" : String(viewAgeUi)}
      data-view-selftest={VIEW_SELFTEST_ATTR}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* لایه‌های بصری (باند هدف · رکود · رویداد · پیش‌بینی · شوک) */}
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* لجند داخل چارت (در صورت تعیین محل در layout) */}
      {legendItems.length > 0 ? (
        <div
          className={cn(
            "pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded px-1.5 py-1",
            SLOT_CLASS[layout.legend] ?? SLOT_CLASS["top-left"],
          )}
          style={{ backgroundColor: theme.palette.surface, opacity: 0.92, fontSize: theme.fontSize }}
        >
          {legendItems.map((it) => (
            <span
              key={it.label}
              className="inline-flex items-center gap-1.5"
              style={{ color: theme.palette.textMuted }}
            >
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  background: it.dashed
                    ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 8px)`
                    : it.color,
                }}
              />
              {it.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* پنل سیگنال‌ها — محل/تعداد/استایل همه از بیرون (layout.signals · signals.style) */}
      {shownSignals.length > 0 && signalSlot !== "none" ? (
        <div
          ref={signalsRef}
          className={cn(
            "pointer-events-none absolute z-10 flex max-w-[calc(100%-0.5rem)] flex-wrap items-center gap-1",
            signalTransparent ? "p-0" : "rounded px-1.5 py-1",
            SIGNAL_SLOT_CLASS[signalSlot] ?? SIGNAL_SLOT_CLASS["bottom-right"],
          )}
          style={signalTransparent ? undefined : { backgroundColor: theme.palette.surface, opacity: 0.92 }}
          data-chart-signals={shownSignals.length}
        >
          {labels?.signals ? (
            <span className="uppercase" style={{ color: theme.palette.textMuted, fontSize: signalFontSize }}>
              {labels.signals}
            </span>
          ) : null}
          {shownSignals.map((s, si) => {
            const paint = badgePaint(s);
            const forceBreak = breakAfterIds.includes(s.id);
            /** بج **عریض**: آخرین بج پنل (هشدار) با عرض مضربی (`factor`) */
            const isWide = Boolean(signalWideLast) && si === shownSignals.length - 1;
            const wideFactor = isWide ? (signalWideLast?.factor ?? 2) : 1;
            return (
              <Fragment key={s.id}>
                <span
                  /* v3: tooltip از کلید i18n + قالب‌های ترجمه ساخته می‌شود */
                  title={resolveHint(s, signalHints)}
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 font-medium",
                    signalUniform && "min-w-[4.5rem] justify-between",
                  )}
                  style={{
                    color: isWide ? (wideText ?? paint.value) : paint.value,
                    fontSize: signalFontSize,
                    background: isWide ? (wideBg ?? paint.bg) : paint.bg,
                    border: paint.border || isWide ? "1px solid" : undefined,
                    borderColor: isWide ? (wideBorder ?? paint.border) : paint.border,
                    ...(isWide && wideFactor !== 1
                      ? { minWidth: `${(signalUniform ? 4.5 : 2.6) * wideFactor}rem` }
                      : {}),
                  }}
                  data-signal={s.id}
                  {...(isWide ? { "data-signal-wide": String(wideFactor) } : {})}
                >
                  {s.label ? (
                    <span style={{ color: isWide ? (wideText ?? paint.label) : paint.label }}>
                      {s.label}
                    </span>
                  ) : null}
                  <span
                    className="tnum"
                    // ضخامت (فشار) از خود سیگنال: ۱ نازک · ۲ متوسط · ۳ ضخیم
                    // + هالهٔ نور هم‌رنگ متن (فقط بج‌های وضعیت) برای برجستگی روی
                    //   پس‌زمینه‌های هم‌خانواده (سبز روی سبز · قرمز روی نارنجی)
                    style={{
                      ...(s.weight ? { fontWeight: SIGNAL_WEIGHT[s.weight] } : {}),
                      ...(paint.glow ? { textShadow: paint.glow } : {}),
                      // «جلوتر آوردن متن»: صفحهٔ ملایم زیر متن ⇒ رنگ متن مطلق و برجسته می‌ماند
                      ...(paint.valueBg
                        ? { background: paint.valueBg, borderRadius: 3, padding: "0 3px" }
                        : {}),
                    }}
                  >
                    {s.display}
                  </span>
                </span>
                {/* شکست خط اجباری بعد از این بج (مثل PAS): سیگنال‌های بعدی زیر آن می‌نشینند */}
                {forceBreak ? <span className="basis-full" aria-hidden /> : null}
              </Fragment>
            );
          })}
        </div>
      ) : null}

      {/* Tooltip (رنگ‌ها از تم) */}
      {tip.visible && tip.lines.length > 0 && layout.tooltip !== "none" ? (
        <div
          className="pointer-events-none absolute z-20 rounded-md border px-2 py-1.5 shadow-lg"
          style={{
            left: layout.tooltip === "crosshair" ? Math.max(4, tip.x + 12) : 8,
            top: 8,
            fontSize: theme.fontSize,
            background: theme.palette.tooltipBg,
            borderColor: theme.palette.tooltipBorder,
            color: theme.palette.tooltipText,
          }}
        >
          {tip.lines.map((l) => (
            <div key={l.label} className="tnum">
              <span className="me-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: l.color }} />
              {l.label}: <span className="font-medium">{l.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* overlayهای اضافی دامنه */}
      {children ? <div className="pointer-events-none absolute inset-0 z-10">{children}</div> : null}
    </div>
  );
}
