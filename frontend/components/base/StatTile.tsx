import { cn } from "@/lib/utils";

/**
 * StatTile — یک عدد کلیدی + دلتا/واحد.
 * رنگِ دلتا از `deltaTone` گرفته می‌شود (نه از علامت)، تا معنای
 * «خوب/بد» در Domain تعیین شود (تورم↑ = بد، رشد↑ = خوب).
 */
export type DeltaTone = "pos" | "neg" | "neutral";

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  deltaTone = "neutral",
  footer,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaLabel?: React.ReactNode;
  deltaTone?: DeltaTone;
  footer?: React.ReactNode;
  className?: string;
}) {
  const toneClass =
    deltaTone === "pos"
      ? "text-pos"
      : deltaTone === "neg"
        ? "text-neg"
        : "text-muted";

  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0">
        <span className="text-xl font-semibold leading-none tnum sm:text-2xl">
          {value}
        </span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
        {delta !== undefined && delta !== null ? (
          <span className={cn("ms-1 text-xs tnum", toneClass)}>
            {deltaLabel ? `${deltaLabel} ` : ""}
            {delta}
          </span>
        ) : null}
      </div>
      {footer ? (
        <div className="mt-1 text-xs text-muted">{footer}</div>
      ) : null}
    </div>
  );
}
