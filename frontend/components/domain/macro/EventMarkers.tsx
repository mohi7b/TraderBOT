"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { MacroEvent } from "@/lib/macro/calendar";
import { getChartTheme, eventColor } from "@/lib/chart/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

/**
 * EventMarkers — لایهٔ تقویم اقتصادی روی چارت (chart01 بخش ۴/۵).
 * با chart API کار می‌کند و هر رویداد را با timeToCoordinate روی axis
 * زمان دقیق می‌چسباند. داده‌اش فعلاً خالی است؛ ساختار آماده.
 */
export function EventMarkers({
  chart,
  events,
  height,
}: {
  chart: IChartApi | null;
  events: MacroEvent[];
  height: number;
}) {
  const { theme } = useTheme();
  const chartTheme = useMemo(() => getChartTheme(theme), [theme]);
  const [positions, setPositions] = useState<
    { x: number; color: string; label: string }[]
  >([]);

  const recompute = useCallback(() => {
    if (!chart || events.length === 0) {
      setPositions([]);
      return;
    }
    const ts = chart.timeScale();
    const out = events
      .map((e) => {
        const ms = new Date(e.date).getTime();
        if (!Number.isFinite(ms)) return null;
        const x = ts.timeToCoordinate((ms / 1000) as UTCTimestamp);
        if (x === null) return null;
        return {
          x: x as number,
          color: eventColor(chartTheme, e.importance),
          label: `${e.event} · ${e.importance}`,
        };
      })
      .filter((v): v is { x: number; color: string; label: string } => !!v);
    setPositions(out);
  }, [chart, events, chartTheme]);

  useEffect(() => {
    if (!chart) return;
    /**
     * ⚠️ قاعدهٔ React Compiler (`react-hooks/set-state-in-effect`): فراخوانی
     * همگام `setState` در بدنهٔ effect ⇒ رندر آبشاری. پس محاسبهٔ اولیه به یک
     * میکروتسک موکول می‌شود؛ اشتراک رویداد مثل قبل می‌ماند.
     */
    const initial = queueMicrotask(() => recompute());
    void initial;
    const handler = () => recompute();
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
    };
  }, [chart, recompute]);

  if (positions.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ height }}
      aria-hidden
    >
      {positions.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 h-full w-px opacity-70"
          style={{ left: p.x, background: p.color }}
          title={p.label}
        />
      ))}
    </div>
  );
}
