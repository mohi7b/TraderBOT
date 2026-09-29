import { cn } from "@/lib/utils";

/**
 * ErrorState — نمایش خطای داده (بدون لو دادن آدرس/secret).
 * پیام اصلی از i18n؛ جزئیات فنی اختیاری و کوتاه.
 */
export function ErrorState({
  title,
  detail,
  action,
  className,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4",
        className,
      )}
      role="alert"
    >
      <p className="text-sm font-medium text-warn">{title}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
