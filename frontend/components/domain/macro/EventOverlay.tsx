"use client";

import { useMemo } from "react";
import type { MacroEvent } from "@/lib/macro/calendar";
import { getChartTheme } from "@/lib/chart/theme";
import { eventColor } from "@/lib/chart/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

/**
 * EventOverlay — لایهٔ تقویم اقتصادی روی چارت (chart01 بخش ۴/۵).
 * فعلاً دادهٔ آن خالی است؛ ساختار آماده تا بعداً از API پر شود.
 *
 * این کامپوننت فقط «مارکرهای عمودی» سبک را رسم می‌کند (بدون وابستگی به
 * مختصات داخلی LWC). برای باندها/خطوط forecast در آینده گسترش می‌یابد.
 */
export function EventOverlay({
  events,
  visible = false,
}: {
  events: MacroEvent[];
  /** فعلاً false؛ با ورود داده true می‌شود */
  visible?: boolean;
}) {
  const { theme } = useTheme();
  const chartTheme = useMemo(() => getChartTheme(theme), [theme]);

  if (!visible || events.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-2">
      {events.map((e, i) => (
        <span
          key={`${e.date}-${i}`}
          className="absolute top-0 h-full w-0.5"
          style={{ background: eventColor(chartTheme, e.importance) }}
          title={`${e.event} (${e.importance})`}
        />
      ))}
    </div>
  );
}
