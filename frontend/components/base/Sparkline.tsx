"use client";

import { useMemo } from "react";
import { scaleLinear, scaleTime } from "@visx/scale";
import { line } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import type { SeriesPoint } from "@/lib/types/series";
import { cn } from "@/lib/utils";
import { parseSeriesDate } from "@/lib/format";

/**
 * Sparkline — خط کوچک بدون محور (Visx).
 * viewBox نسبی است، پس بدون نیاز به اندازه‌گیری والد کشیده می‌شود.
 */
const VB_W = 100;

export function Sparkline({
  points,
  height = 32,
  stroke = "var(--accent)",
  className,
}: {
  points: SeriesPoint[];
  height?: number;
  stroke?: string;
  className?: string;
}) {
  const positions = useMemo(() => {
    if (!points || points.length < 2) return [];
    const clean = points
      .map((p) => ({ t: parseSeriesDate(p.date), v: p.value }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    if (clean.length < 2) return [];
    const xs = clean.map((p) => p.t);
    const ys = clean.map((p) => p.v);
    const x = scaleTime({
      domain: [Math.min(...xs), Math.max(...xs)],
      range: [0, VB_W],
    });
    const y = scaleLinear({
      domain: [Math.min(...ys), Math.max(...ys)],
      range: [height, 0],
      nice: true,
    });
    return clean.map((p) => ({ x: x(p.t), y: y(p.v) }));
  }, [points, height]);

  if (positions.length < 2) {
    return (
      <div
        className={cn("w-full rounded bg-surface-2", className)}
        style={{ height }}
        aria-hidden="true"
      />
    );
  }

  const path = line<{ x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(curveMonotoneX)(positions);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      style={{ height }}
      role="img"
    >
      {path ? (
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
      ) : null}
    </svg>
  );
}
