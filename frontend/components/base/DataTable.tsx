import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** تراز ستون */
  align?: "start" | "end" | "center";
  className?: string;
  render: (row: T) => React.ReactNode;
}

/**
 * DataTable — جدول سبک ریسپانسیو (overflow-x).
 * بدون متن سخت‌کد؛ هدرها و سلول‌ها از props.
 * داده-محور: اگر ردیف نداشت → EmptyState.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyTitle,
  emptyHint,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: React.ReactNode;
  emptyHint?: React.ReactNode;
  className?: string;
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle ?? "—"} hint={emptyHint} />;
  }

  const alignClass = (a?: Column<T>["align"]) =>
    a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border",
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-medium",
                  alignClass(c.align),
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-t border-border">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2",
                    alignClass(c.align),
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
