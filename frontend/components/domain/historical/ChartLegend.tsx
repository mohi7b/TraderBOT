"use client";
/**
 * ChartLegend — لجندِ **داخلِ خود چارت** برای سری‌های واقعاً رسم‌شده
 * frontend/components/domain/historical/ChartLegend.tsx
 * ============================================================
 * **چرا کامپوننت کلاینت جدا؟** چون `CandleChart` یک **Server Component** است ✓
 * (فقط `useMemo` دارد و در SSR اجرا می‌شود ✗) و امکان `onClick`/`window` ندارد ✗
 * ⇒ تعامل در همین فایل کوچک جدا شد ✓ (بدون VIP شدنِ کل چارت ✗).
 *
 * **مسئولیت‌ها (مورد ۴ درخواست — «لینک چارت ↔ کنترل سنتر»):**
 *   ۱) نمایش نام/رنگ/**آخرین مقدار واقعی** هر سری (همه از داده و تم ✓).
 *   ۲) کلیک روی ردیف ⇒ رویداد `cc:focus` ⇒ کشوی Control Center باز می‌شود،
 *      تب همان ماژول انتخاب و **کشوی تنظیمات همان آیتم** باز می‌شود ✓.
 *   ۳) هاور روی ردیف ⇒ `cc:highlight` (و برعکس از سمت کشو ✓) ⇒ هایلایت دوطرفه ✓.
 *
 * ⚠️ هیچ عدد/رنگ ساختگی ✗ — `rows` فقط از سری‌های محاسبه‌شدهٔ AL و `resolveSlot`
 *    همان تم چارت پر می‌شود ✓.
 */
import { useEffect, useState } from "react";

/** یک ردیف لجند — **سریالایزپذیر** ✓ (Server ⇒ Client ✓) */
export interface ChartLegendRow {
  /** ماژول متناظر در `engine/core/profiles` ✓ */
  module: string;
  /** کلید آیتم در `engine/core/library` ✓ (مثل `ema`) */
  key: string;
  /** اندیس نمونه (چند-نمونه‌ای ✓) */
  index?: number;
  label: string;
  /** رنگ واقعی همان سری در چارت ✓ (از تم ✓) */
  color?: string;
  /** آخرین مقدار محاسبه‌شده ✓ (نبود ⇒ نمایش داده نمی‌شود ✗) */
  value?: string;
}

export function ChartLegend({
  rows,
  hint,
  fontSize = 10,
}: {
  rows: ChartLegendRow[];
  hint?: string;
  /** 🆕 اندازهٔ قلم (از تمِ نسخه‌دار ✓ — موبایل ۱۱ · TV ۱۴ ✓) */
  fontSize?: number;
}) {
  /** ردیفِ هایلایت‌شده از سمت کشو ✓ (`module.key` ✓) */
  const [hot, setHot] = useState<string | null>(null);

  useEffect(() => {
    const onHighlight = (e: Event) => {
      const d = (e as CustomEvent<{ module?: string; key?: string | null }>).detail;
      setHot(d?.key ? `${d.module ?? ""}.${d.key}` : null);
    };
    window.addEventListener("cc:highlight", onHighlight as EventListener);
    return () => window.removeEventListener("cc:highlight", onHighlight as EventListener);
  }, []);

  if (!rows.length) return null;

  return (
    <div
      className="pointer-events-none absolute start-1 top-1 z-10 flex flex-col items-start gap-0.5"
      data-chart-legend={rows.length}
    >
      {rows.map((r) => {
        const id = `${r.module}.${r.key}`;
        return (
          <button
            key={`${id}#${r.index ?? 0}`}
            type="button"
            data-chart-legend-item={r.key}
            data-chart-legend-module={r.module}
            data-chart-legend-index={r.index ?? 0}
            data-chart-legend-color={r.color ?? "none"}
            title={hint}
            aria-label={`${r.label}${r.value ? ` ${r.value}` : ""}`}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("cc:focus", {
                  detail: { module: r.module, key: r.key, index: r.index ?? 0 },
                }),
              )
            }
            onMouseEnter={() =>
              window.dispatchEvent(
                new CustomEvent("cc:highlight", { detail: { module: r.module, key: r.key } }),
              )
            }
            onMouseLeave={() =>
              window.dispatchEvent(
                new CustomEvent("cc:highlight", { detail: { module: r.module, key: null } }),
              )
            }
            style={{ fontSize: `${fontSize}px` }}
            className={`pointer-events-auto flex items-center gap-1 rounded bg-surface/70 px-1 py-px backdrop-blur transition ${
              hot === id ? "ring-1 ring-pos/60" : ""
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: r.color ?? "var(--muted)" }}
              aria-hidden="true"
            />
            <span className="text-foreground/80">{r.label}</span>
            {r.value ? (
              <span className="tnum" style={{ color: r.color }} data-chart-legend-value={r.value}>
                {r.value}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
