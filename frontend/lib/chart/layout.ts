/**
 * ============================================================
 * Chart Layout — چینش، زوم و پدینگ (کاملاً تزریق‌پذیر)
 * frontend/lib/chart/layout.ts
 * ============================================================
 * هیچ مقدار ظاهری در چارت هاردکد نیست؛ همه از `ChartLayout` می‌آید.
 * زوم پیش‌فرض: 1M · 3M · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · MAX · fit
 * ============================================================
 */
import type { ChartLayout, ChartLayoutPartial, ZoomPreset, ZoomRange } from "./types";

export const ZOOM_PRESETS: ZoomPreset[] = [
  "1M", "3M", "6M", "1Y", "2Y", "3Y", "3Y6M", "5Y", "10Y", "MAX", "fit",
];

/** طول هر preset بر حسب ماه (MAX/fit ⇒ null = همهٔ داده). */
const ZOOM_MONTHS: Record<string, number | null> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  "2Y": 24,
  "3Y": 36,
  "3Y6M": 42, // ۳ سال و نیم (درخواست کاربر 2026-09-21)
  "5Y": 60,
  "10Y": 120,
  MAX: null,
  fit: null,
};

export const DEFAULT_LAYOUT: ChartLayout = {
  zoom: "MAX",
  legend: "none",
  signals: "bottom-right",
  tooltip: "crosshair",
  grid: { vert: true, horz: true },
  padding: { top: 0.1, bottom: 0.1 },
  futureMargin: 0,
  /** 🆕 لنگر پیش‌فرض = آخرین کندل ✓ (رفتار امروز ✓) */
  anchor: "last",
  /** 🆕 ضخامت سری‌های overlay — پیش‌فرض ۲ = رفتار امروز ✓ */
  series: { thickness: 2 },
  /** 🆕 سقف ردیف‌های لجندِ درون‌چارت (بی‌سقف عملی ✓) */
  legendRows: 8,
  /** 🆕 هدر کامل = رفتار امروز ✓ */
  header: "full",
  /** 🆕 سقف DPR = ۲ = رفتار امروز ✓ */
  dprCap: 2,
  priceScale: { visible: true, top: 0.1, bottom: 0.1, mode: "normal" },
  timeScale: {
    visible: true,
    timeVisible: false,
    secondsVisible: false,
    rightOffset: 2,
    barSpacing: 6,
    minBarSpacing: 2,
  },
  crosshair: { mode: "normal", dashed: true },
  watermark: { visible: false },
};

/** ادغام جزئی روی چینش پیش‌فرض (override برای دامنه). */
export function mergeLayout(
  base: ChartLayout = DEFAULT_LAYOUT,
  override?: ChartLayoutPartial,
): ChartLayout {
  if (!override) return base;
  return {
    ...base,
    ...override,
    grid: { ...base.grid, ...(override.grid ?? {}) },
    padding: { ...base.padding, ...(override.padding ?? {}) },
    /** 🆕 ضخامت سری‌ها (نسخه‌های اسکرینی ✓) */
    series: { ...base.series, ...(override.series ?? {}) },
    priceScale: { ...base.priceScale, ...(override.priceScale ?? {}) },
    timeScale: { ...base.timeScale, ...(override.timeScale ?? {}) },
    crosshair: { ...base.crosshair, ...(override.crosshair ?? {}) },
    watermark: { ...base.watermark, ...(override.watermark ?? {}) },
  };
}

/** تبدیل «تاریخ/عدد» به ثانیهٔ UNIX (رشته‌های کانونیکال پشتیبانی می‌شوند). */
export function toUnixSec(t: number | string | null | undefined): number | null {
  if (t === null || t === undefined) return null;
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  const s = String(t).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return Math.floor(Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!) / 1000);
  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) return Math.floor(Date.UTC(+ym[1]!, +ym[2]! - 1, 1) / 1000);
  const q = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (q) return Math.floor(Date.UTC(+q[1]!, (+q[2]! - 1) * 3, 1) / 1000);
  const h = /^(\d{4})-S([1-2])$/i.exec(s);
  if (h) return Math.floor(Date.UTC(+h[1]!, (+h[2]! - 1) * 6, 1) / 1000);
  const y = /^(\d{4})$/.exec(s);
  if (y) return Math.floor(Date.UTC(+y[1]!, 0, 1) / 1000);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

/** کم‌کردن n ماه از یک ثانیهٔ UNIX (تقویم UTC). */
export function minusMonths(sec: number, months: number): number {
  const d = new Date(sec * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1) / 1000);
}

/** اضافه‌کردن n ماه به یک ثانیهٔ UNIX (تقویم UTC) — برای لنگر `first` ✓ */
export function plusMonths(sec: number, months: number): number {
  const d = new Date(sec * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1) / 1000);
}

/**
 * بازهٔ نمایش را از زوم + آخرین زمان داده محاسبه می‌کند.
 * @param zoom  preset یا بازهٔ صریح
 * @param lastT آخرین زمان موجود (ثانیهٔ UNIX)
 * @param firstT اولین زمان موجود
 * @param anchor **لنگر** — `last` (پیش‌فرض ✓) پنجره را به آخرین داده می‌چسباند؛
 *   `first` آن را از ابتدای داده می‌گشاید ✓ (نسخه‌های اسکرینی همیشه `last`اند ✓).
 */
export function resolveZoomRange(
  zoom: ZoomPreset | ZoomRange,
  lastT: number,
  firstT: number,
  anchor: "last" | "first" = "last",
): { from: number; to: number } {
  if (typeof zoom === "object") {
    const from = toUnixSec(zoom.from) ?? firstT;
    const to = toUnixSec(zoom.to) ?? lastT;
    return { from, to };
  }
  const months = ZOOM_MONTHS[zoom];
  if (months === null || months === undefined) return { from: firstT, to: lastT };
  /** 🆕 لنگر `first`: پنجره از ابتدای داده به جلو ✓ */
  if (anchor === "first") {
    return { from: firstT, to: Math.min(lastT, plusMonths(firstT, months)) };
  }
  return { from: Math.max(firstT, minusMonths(lastT, months)), to: lastT };
}

/** برچسب کوتاه زوم (برای UI/لاگ). */
export function zoomLabel(zoom: ZoomPreset | ZoomRange): string {
  if (typeof zoom === "string") return zoom;
  const f = typeof zoom.from === "string" ? zoom.from : new Date(zoom.from * 1000).toISOString().slice(0, 10);
  const t = zoom.to ? (typeof zoom.to === "string" ? zoom.to : new Date(zoom.to * 1000).toISOString().slice(0, 10)) : "…";
  return `${f}…${t}`;
}
