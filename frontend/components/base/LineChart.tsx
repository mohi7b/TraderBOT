"use client";

import { useMemo, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import type { SeriesPoint } from "@/lib/types/series";
import { cn } from "@/lib/utils";
import { parseSeriesDate } from "@/lib/format";

/**
 * LineChart — خط چندسری/تک‌سری با محور و گرید (Visx).
 * قواعد roadmap §11:
 *  - Line لازم نیست از صفر، (اینجا domain از داده محاسبه می‌شود).
 *  - حداکثر ۴–۵ خط روی یک چارت.
 *  - ریسپانسیو با ParentSize.
 */
export interface LineSeries {
  id: string;
  points: SeriesPoint[];
  color?: string;
  label?: string;
}

const MARGIN = { top: 8, right: 12, bottom: 24, left: 36 };

function Inner({
  series,
  width,
  height,
}: {
  series: LineSeries[];
  width: number;
  height: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const { xScale, yScale, allPoints } = useMemo(() => {
    const times: number[] = [];
    const values: number[] = [];
    for (const s of series) {
      for (const p of s.points) {
        const t = parseSeriesDate(p.date);
        if (!Number.isFinite(t) || !Number.isFinite(p.value)) continue;
        times.push(t);
        values.push(p.value);
      }
    }
    const tMin = times.length ? Math.min(...times) : 0;
    const tMax = times.length ? Math.max(...times) : 1;
    const vMin = values.length ? Math.min(...values) : 0;
    const vMax = values.length ? Math.max(...values) : 1;
    const xScale = scaleTime({
      domain: [tMin, tMax],
      range: [0, innerW],
    });
    const yScale = scaleLinear({
      domain: [vMin, vMax],
      range: [innerH, 0],
      nice: true,
    });
    return {
      xScale,
      yScale,
      allPoints: series.flatMap((s) =>
        s.points
          .map((p) => ({ t: parseSeriesDate(p.date), v: p.value }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)),
      ),
    };
  }, [series, innerW, innerH]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
      }),
    [],
  );

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = e.clientX - rect.left - MARGIN.left;
          const t = xScale.invert(x).getTime();
          // نزدیک‌ترین نقطه در فضای زمان
          let best: number | null = null;
          let bestD = Infinity;
          for (const p of allPoints) {
            const d = Math.abs(p.t - t);
            if (d < bestD) {
              bestD = d;
              best = p.t;
            }
          }
          setHover(best);
        }}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke="currentColor"
            className="text-border"
            strokeOpacity={0.4}
            numTicks={4}
          />
          {series.slice(0, 5).map((s, i) => (
            <LinePath
              key={s.id}
              data={s.points.filter((d) => Number.isFinite(parseSeriesDate(d.date)))}
              x={(d) => xScale(parseSeriesDate(d.date))}
              y={(d) => yScale(d.value)}
              stroke={s.color ?? `var(--chart-${(i % 6) + 1})`}
              strokeWidth={1.5}
              curve={curveMonotoneX}
            />
          ))}
          {hover !== null ? (
            <line
              x1={xScale(hover)}
              x2={xScale(hover)}
              y1={0}
              y2={innerH}
              stroke="currentColor"
              className="text-muted"
              strokeDasharray="3 3"
            />
          ) : null}
          <AxisBottom
            top={innerH}
            scale={xScale}
            numTicks={Math.min(6, Math.floor(innerW / 80))}
            stroke="currentColor"
            tickStroke="currentColor"
            tickFormat={(d) => dateFmt.format(new Date(d as number))}
            tickLabelProps={() => ({
              fill: "currentColor",
              fontSize: 10,
              textAnchor: "middle",
              className: "text-muted",
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={4}
            stroke="currentColor"
            tickStroke="currentColor"
            tickLabelProps={() => ({
              fill: "currentColor",
              fontSize: 10,
              textAnchor: "end",
              dx: "-0.25em",
              dy: "0.3em",
              className: "text-muted",
            })}
          />
        </Group>
      </svg>
    </div>
  );
}

export function LineChart({
  series,
  height = 220,
  className,
  emptyLabel,
}: {
  series: LineSeries[];
  height?: number;
  className?: string;
  emptyLabel?: React.ReactNode;
}) {
  const hasData = series.some(
    (s) =>
      s.points &&
      s.points.filter((p) => Number.isFinite(parseSeriesDate(p.date))).length >= 2,
  );
  if (!hasData) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded bg-surface-2 text-xs text-muted",
          className,
        )}
        style={{ height }}
      >
        {emptyLabel ?? "—"}
      </div>
    );
  }
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ParentSize>
        {({ width }) =>
          width > 0 ? <Inner series={series} width={width} height={height} /> : null
        }
      </ParentSize>
    </div>
  );
}
