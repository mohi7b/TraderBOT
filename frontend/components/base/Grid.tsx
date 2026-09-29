import { cn } from "@/lib/utils";

/**
 * Grid — الگوی گرید اجباری پروژه (roadmap §3B).
 *   grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8
 */
export function Grid({
  children,
  className,
  cols,
}: {
  children: React.ReactNode;
  className?: string;
  /** در صورت نیاز به ستون‌های کمتر، مثلاً 3 */
  cols?: 2 | 3 | 4 | 6 | 8;
}) {
  const responsive = cols
    ? {
        2: "grid-cols-1 sm:grid-cols-2",
        3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6",
        8: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8",
      }[cols]
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8";

  return (
    <div className={cn("grid gap-3", responsive, className)}>{children}</div>
  );
}
