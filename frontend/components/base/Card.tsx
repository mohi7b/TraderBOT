import { cn } from "@/lib/utils";

/**
 * Card — پایهٔ همهٔ بلوک‌های UI.
 * - Dark/Light با توکن‌های سراسری.
 * - ریسپانسیو (بدون عرض ثابت).
 * - بدون متن سخت‌کد (محتوا از props).
 */
export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 sm:p-4",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle ? (
          <div className="truncate text-xs text-muted">{subtitle}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-3", className)}>{children}</div>;
}
