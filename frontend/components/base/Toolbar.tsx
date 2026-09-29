import { cn } from "@/lib/utils";

/**
 * Toolbar — نوار ابزار سبک (بدون منطق). چپ/راست جدا برای RTL/LTR.
 * در Domain با Selector/Button پر می‌شود.
 */
export function Toolbar({
  start,
  end,
  className,
}: {
  start?: React.ReactNode;
  end?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div>
      <div className="flex flex-wrap items-center gap-2">{end}</div>
    </div>
  );
}
