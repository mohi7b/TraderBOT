/**
 * ============================================================
 * Chart Adapters — تبدیل دادهٔ هر دامنه به `ChartSeriesInput[]`
 * frontend/lib/chart/adapters.ts
 * ============================================================
 * موتور چارت هیچ‌چیز از دامنه نمی‌داند؛ فقط این شکل واحد را می‌فهمد.
 * دامنه‌ها یک‌خطی تبدیل می‌کنند:
 *
 *   Macro   : fromDatedPoints(series.history.full, { parseDate })
 *   Markets : fromOhlc(bars)
 *   Crypto  : fromOhlc(bars, { id: "BTCUSDT" })
 *   Trading : fromNumericPoints(pnlPoints)
 *   Energy  : fromDatedPoints(points)
 * ============================================================
 */
import type { ChartBar, ChartPoint, ChartSeriesInput, ChartSeriesType } from "./types";

export interface SeriesOptions {
  id: string;
  label?: string;
  type?: ChartSeriesType;
  colorKey?: string;
  color?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  dashed?: boolean;
  /** نقاط داده به‌صورت دایره‌های کوچک روی خط (`true` یا `{ radius }`) */
  markers?: boolean | { radius?: number };
  priceScaleId?: string;
  hint?: string;
}

/**
 * نقاط (date|t, value) → ChartPoint[]
 * @param parseDate تبدیل تاریخ کانونیکال به ثانیهٔ UNIX
 *                  (در ماکرو: `(d) => Date.parse(...)` یا `parseSeriesDate(d)/1000`)
 */
export function fromDatedPoints(
  points: { date: string; value: number }[] | null | undefined,
  parseDate: (d: string) => number,
): ChartPoint[] {
  if (!Array.isArray(points)) return [];
  const out: ChartPoint[] = [];
  for (const p of points) {
    if (!p || typeof p.date !== "string") continue;
    const ms = parseDate(p.date);
    if (!Number.isFinite(ms) || !Number.isFinite(p.value)) continue;
    out.push({ t: Math.floor(ms / 1000), value: p.value });
  }
  return out;
}

/** نقاط عددی آماده (t = ثانیه) → مرتب‌شده و پاک‌سازی‌شده. */
export function fromNumericPoints(
  points: ChartPoint[] | { t: number; value: number }[] | null | undefined,
): ChartPoint[] {
  if (!Array.isArray(points)) return [];
  return points
    .filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.value))
    .map((p) => ({ t: Math.floor(p.t), value: p.value }))
    .sort((a, b) => a.t - b.t);
}

/** کندل‌ها → ChartBar[] (مرتب‌شده). */
export function fromOhlc(
  bars: { time: number; open: number; high: number; low: number; close: number }[] | null | undefined,
): ChartBar[] {
  if (!Array.isArray(bars)) return [];
  return bars
    .map((b) => ({
      t: Math.floor(b.time),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    .filter((b) => [b.t, b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v)))
    .sort((a, b) => a.t - b.t);
}

/** ساخت یک سری ورودی کامل (کمک‌کنندهٔ دامنه‌ها). */
export function makeSeries(
  points: ChartPoint[],
  opts: SeriesOptions,
): ChartSeriesInput {
  return {
    id: opts.id,
    label: opts.label ?? opts.id,
    type: opts.type ?? "line",
    points,
    ...(opts.colorKey ? { colorKey: opts.colorKey } : {}),
    ...(opts.color ? { color: opts.color } : {}),
    ...(opts.lineWidth ? { lineWidth: opts.lineWidth } : {}),
    ...(opts.dashed ? { dashed: true } : {}),
    ...(opts.markers ? { markers: opts.markers } : {}),
    ...(opts.priceScaleId ? { priceScaleId: opts.priceScaleId } : {}),
    ...(opts.hint ? { hint: opts.hint } : {}),
  };
}

/** سری کندلی (Markets/Crypto). */
export function makeCandleSeries(bars: ChartBar[], opts: Omit<SeriesOptions, "type">): ChartSeriesInput {
  return {
    id: opts.id,
    label: opts.label ?? opts.id,
    type: "candlestick",
    bars,
    ...(opts.colorKey ? { colorKey: opts.colorKey } : {}),
    ...(opts.priceScaleId ? { priceScaleId: opts.priceScaleId } : {}),
    ...(opts.hint ? { hint: opts.hint } : {}),
  };
}

/** همهٔ نقاط زمانی سری‌ها (min/max) — برای محاسبهٔ زوم. */
export function seriesTimeBounds(series: ChartSeriesInput[]): { first: number; last: number } {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    const pts = s.type === "candlestick" ? (s.bars ?? []) : (s.points ?? []);
    for (const p of pts) {
      if (p.t < first) first = p.t;
      if (p.t > last) last = p.t;
    }
  }
  if (!Number.isFinite(first) || !Number.isFinite(last)) return { first: 0, last: 0 };
  return { first, last };
}

/** فقط سری‌های قابل‌رسم (با داده). */
export function visibleSeries(series: ChartSeriesInput[]): ChartSeriesInput[] {
  return series.filter((s) => {
    if (s.visible === false) return false;
    const n = s.type === "candlestick" ? (s.bars?.length ?? 0) : (s.points?.length ?? 0);
    return n > 0;
  });
}
