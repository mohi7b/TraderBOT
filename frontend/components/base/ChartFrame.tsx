import { cn } from "@/lib/utils";

/**
 * ChartFrame — پوستهٔ مشترک همهٔ چارت‌ها (Base، بدون منطق دامنه).
 *
 * مسئولیت‌ها:
 *  - هدر: عنوان + زیرعنوان + اسلات کنترل سمت راست (مثل انتخابگر کشور)
 *  - نوار متادیتا: **as-of**، واحد، منبع، فرکانس (به‌عنوان ReactNode از Domain)
 *  - نوار لجند (فقط سری‌هایی که واقعاً رسم شده‌اند)
 *  - بدنه: children یا placeholder مربوط به state (empty/error/loading)
 *  - footer
 *
 * رنگ/تم از توکن‌های سراسری (`bg-surface`, `border-border`, `text-muted`)
 * می‌آید ⇒ Dark/Light خودکار. هیچ متنی اینجا hardcode نمی‌شود (props).
 */
export type ChartFrameState = "ready" | "empty" | "error" | "loading";

const STATE_CLASS: Record<Exclude<ChartFrameState, "ready">, string> = {
  empty: "text-muted",
  error: "text-warn",
  loading: "text-muted animate-pulse",
};

export interface ChartFrameProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** نوار متادیتا (as-of / unit / source / frequency) */
  meta?: React.ReactNode;
  /** کنترل سمت راست هدر (مثلاً CountrySelect) */
  right?: React.ReactNode;
  /** لجند — فقط سری‌های رسم‌شده */
  legend?: React.ReactNode;
  footer?: React.ReactNode;
  state?: ChartFrameState;
  /** متن حالت‌ها (از i18n) */
  emptyText?: React.ReactNode;
  errorText?: React.ReactNode;
  /** ارتفاع ناحیهٔ placeholder در حالت‌های غیر ready */
  height?: number;
  className?: string;
  /** ناحیهٔ چارت (در حالت ready) */
  children?: React.ReactNode;
}

export function ChartFrame({
  title,
  subtitle,
  meta,
  right,
  legend,
  footer,
  state = "ready",
  emptyText,
  errorText,
  height = 320,
  className,
  children,
}: ChartFrameProps) {
  const showHeader = Boolean(title || subtitle || right);
  const placeholderText =
    state === "error" ? (errorText ?? "—") : state === "loading" ? "…" : (emptyText ?? "—");

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 sm:p-4",
        className,
      )}
      data-chart-frame-state={state}
    >
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <div className="truncate text-sm font-medium">{title}</div>
            ) : null}
            {subtitle ? (
              <div className="truncate text-xs text-muted">{subtitle}</div>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}

      {meta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {meta}
        </div>
      ) : null}

      {legend ? (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
          {legend}
        </div>
      ) : null}

      <div className="mt-2">
        {state === "ready" ? (
          children ?? null
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded border border-border bg-surface-2 text-xs",
              STATE_CLASS[state],
            )}
            style={{ height }}
          >
            {placeholderText}
          </div>
        )}
      </div>

      {footer ? (
        <div className="mt-2 text-xs text-muted">{footer}</div>
      ) : null}
    </div>
  );
}
