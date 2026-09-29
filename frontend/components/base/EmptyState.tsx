import { cn } from "@/lib/utils";

/**
 * EmptyState — استاندارد داده-محور (roadmap §11).
 * وقتی سری/گروه داده ندارد؛ متن از i18n/پروپس می‌آید (بدون hardcode).
 */
export function EmptyState({
  title,
  hint,
  className,
  icon,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center",
        className,
      )}
      role="status"
    >
      {icon ? <div className="mb-1 text-muted">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
