import { cn } from "@/lib/utils";
import type { TrendDirection, TrendStrength } from "@/lib/types/series";

/**
 * TrendBadge — جهت/قدرت روند.
 * نکتهٔ معماری (roadmap §11): «خوب/بد» در Base تعیین نمی‌شود؛
 * فقط `direction` نمایش داده می‌شود. معنای رنگِ خوب/بد در Domain.
 */
export function TrendBadge({
  direction,
  strength,
  className,
}: {
  direction: TrendDirection;
  strength?: TrendStrength;
  className?: string;
}) {
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : "▬";
  const color =
    direction === "up"
      ? "text-pos"
      : direction === "down"
        ? "text-neg"
        : "text-neutral";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tnum",
        "bg-surface-2",
        color,
        className,
      )}
      title={`${direction}${strength ? ` / ${strength}` : ""}`}
    >
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{direction}</span>
      {strength ? <span className="text-muted">{strength}</span> : null}
    </span>
  );
}
