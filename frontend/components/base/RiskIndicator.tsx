import { cn } from "@/lib/utils";
import type { SeriesRiskFlags } from "@/lib/types/series";

/**
 * RiskIndicator — برچسب‌های ریسک از `risk_flags` بک‌اند.
 * متن‌ها از i18n می‌آیند (labels prop)؛ در Base hardcode نمی‌شوند.
 */
const ORDER: (keyof SeriesRiskFlags)[] = [
  "high_volatility",
  "sharp_reversal",
  "abnormal_momentum",
  "vol_spike",
  "near_peak",
  "near_trough",
];

function isOn(v: unknown): v is boolean {
  return v === true;
}

export function RiskIndicator({
  flags,
  labels,
  className,
}: {
  flags: SeriesRiskFlags | null;
  /** نگاشت کلید ریسک → متن i18n */
  labels?: Partial<Record<keyof SeriesRiskFlags, string>>;
  className?: string;
}) {
  if (!flags || !flags.has_risk) {
    return <span className="text-xs text-muted">—</span>;
  }

  const active = ORDER.filter((k) => isOn(flags[k]));
  const notes = Array.isArray(flags.notes) ? flags.notes : [];

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {active.map((k) => (
        <span
          key={k}
          className="inline-flex items-center rounded bg-warn/15 px-1.5 py-0.5 text-xs text-warn"
          title={labels?.[k] ?? k}
        >
          {labels?.[k] ?? k.replace(/_/g, " ")}
        </span>
      ))}
      {notes.length > 0 ? (
        <span className="text-xs text-muted" title={notes.join(" · ")}>
          ⓘ
        </span>
      ) : null}
    </div>
  );
}
