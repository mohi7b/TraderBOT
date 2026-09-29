"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  BaselineSeries,
  BarSeries,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type ChartOptions,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/components/providers/ThemeProvider";
import { getChartTheme } from "@/lib/chart/theme";
import { buildLwcOptions } from "@/lib/chart/lwcTheme";
import { createTimeShift } from "@/lib/time/TimeShift";
import { cn } from "@/lib/utils";

/**
 * ============================================================
 * BaseLwcChart — پایهٔ همهٔ چارت‌های LWC پلتفرم
 * frontend/components/base/BaseLwcChart.tsx
 * ============================================================
 * با LWC v5 کار می‌کند (addSeries با SeriesDefinition، نه string).
 * مسئولیت‌ها:
 *  - ساخت/destroy چارت (cleanup درست)
 *  - تم فعال (light/dark از ThemeProvider)
 *  - resize خودکار (autoSize)
 *  - TimeShift مرکزی (برای محور زمان)
 *  - render-prop برای افزودن سری/داده در Domain
 * ============================================================
 */

/** انواع سری پشتیبانی‌شده (نگاشت به سازندهٔ LWC 5). */
export type LwcSeriesKind =
  | "Line"
  | "Area"
  | "Histogram"
  | "Baseline"
  | "Bar"
  | "Candlestick";

const SERIES_CTORS = {
  Line: LineSeries,
  Area: AreaSeries,
  Histogram: HistogramSeries,
  Baseline: BaselineSeries,
  Bar: BarSeries,
  Candlestick: CandlestickSeries,
} as const;

export interface LwcChartApi {
  chart: IChartApi;
  /** ساخت سری با نوع شناخته‌شده (Line/Area/...) */
  addSeries: <K extends LwcSeriesKind>(kind: K, opts?: object) => ISeriesApi<K>;
  /** ثانیهٔ UNIX از یک لحظه (برای دادهٔ سری) */
  unixSec: (t: number | Date | string) => UTCTimestamp;
  /** TimeShift برای برچسب‌ها */
  timeShift: ReturnType<typeof createTimeShift>;
}

export function BaseLwcChart({
  height = 320,
  className,
  options,
  onReady,
  children,
  deps = [],
}: {
  height?: number;
  className?: string;
  /** override/gام options روی تم پایه */
  options?: DeepPartial<ChartOptions>;
  /** وقتی چارت ساخته شد صدا زده می‌شود (سری/داده را اینجا اضافه کن) */
  onReady?: (api: LwcChartApi) => void;
  /** overlayهای HTML (رویدادها، باندها) روی چارت */
  children?: React.ReactNode;
  /**
   * وابستگی‌های دیتا که با تغییرشان چارت باید بازسازی شود.
   * مثال: تعویض کشور/گروه سری‌ها عوض می‌شود، پس onReady باید
   * دوباره اجرا و setData جدید اعمال شود. چارت‌ها سبک‌اند و
   * بازسازی ارزان‌تر از مدیریت دستی سری‌هاست.
   */
  deps?: unknown[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { theme } = useTheme();

  const timeShift = useMemo(() => createTimeShift(), []);
  const chartTheme = useMemo(() => getChartTheme(theme), [theme]);

  // --- ساخت/بازسازی چارت با تغییر تم ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fail = (err: unknown, phase: string) => {
      // خطای کلاینت را قابل‌دیدن می‌کنیم (به‌جای ناحیهٔ خالی و بی‌صدا).
      // مستقیماً در DOM نوشته می‌شود (بدون setState) تا داخل effect مجاز بماند.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BaseLwcChart] ${phase} failed:`, err);
      const safe = msg.replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
      );
      el.setAttribute("data-lwc-state", "error");
      el.parentElement?.setAttribute("data-lwc-state", "error");
      el.innerHTML =
        '<div class="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/80 p-3 text-center text-xs text-warn">' +
        `chart error (${phase}): ${safe}</div>`;
    };

    let chart: IChartApi;
    try {
      chart = createChart(el, {
        ...buildLwcOptions(chartTheme),
        ...options,
        autoSize: true,
      });
    } catch (e) {
      fail(e, "createChart");
      return;
    }
    chartRef.current = chart;
    el.setAttribute("data-lwc-state", "ready");
    el.parentElement?.setAttribute("data-lwc-state", "ready");

    const api: LwcChartApi = {
      chart,
      addSeries: <K extends LwcSeriesKind>(kind: K, opts?: object) =>
        chart.addSeries(SERIES_CTORS[kind], {
          priceLineVisible: false,
          lastValueVisible: true,
          ...opts,
        }) as unknown as ISeriesApi<K>,
      unixSec: (t) => timeShift.unixSec(t) as UTCTimestamp,
      timeShift,
    };

    try {
      onReady?.(api);
    } catch (e) {
      fail(e, "onReady");
    }

    return () => {
      try {
        chart.remove();
      } catch {
        /* noop */
      }
      chartRef.current = null;
    };
    // بازسازی هنگام تغییر تم/ارتفاع یا هر dep دیتایی (مثل تعویض کشور).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, height, ...deps]);

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height }}
      data-lwc-state="ready"
    >
      <div ref={containerRef} className="absolute inset-0" />
      {children ? (
        <div className="pointer-events-none absolute inset-0">{children}</div>
      ) : null}
    </div>
  );
}

