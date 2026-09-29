/**
 * ============================================================
 * Macro derive — محاسبات سمت فرانت
 * frontend/lib/macro/derive.ts
 * ============================================================
 * چیزهایی که در core DB نیستند و فرانت می‌سازد:
 *  - merge سری Core با Headline
 *  - annualized_3m (روی سطح شاخص)
 *  - deviation از هدف
 *  - تشخیص جهت روند
 * ============================================================
 */
import { parseSeriesDate } from "@/lib/format";

export interface CpiRow {
  country: string;
  date: string; // YYYY-MM یا YYYY-MM-DD
  yoy: number;
  core_yoy?: number;
  mom?: number;
  value?: number; // سطح شاخص (برای annualized)
  annualized_3m?: number;
}

/** یک نقطهٔ خام ورودی (قبل از derive) — با تایم مدیریت‌شده. */
export interface RawPoint {
  date: string;
  value?: number | null;
  yoy?: number | null;
  mom?: number | null;
}

/**
 * annualized تورم ۳ماهه از **سطح** شاخص:
 *   ((v_t / v_{t-3})^(4/3) - 1) * 100
 * اگر سطح موجود نبود → undefined (هیچ تقریب YoY نمی‌سازیم).
 */
export function annualized3mFromLevels(levels: number[]): number | undefined {
  if (levels.length < 4) return undefined;
  const a = levels[levels.length - 4];
  const b = levels[levels.length - 1];
  if (!a || !b || a <= 0 || b <= 0) return undefined;
  return (Math.pow(b / a, 4 / 3) - 1) * 100;
}

/**
 * ادغام Headline (CPI) و Core (CORE_CPI) بر اساس تاریخ.
 * هر دو آرا��ی مرتب بر اساس date لازم نیستند، اینجا sort می‌کنیم.
 */
export function mergeHeadlineCore(
  headline: RawPoint[],
  core: RawPoint[],
): CpiRow[] {
  const byDate = new Map<string, CpiRow>();

  for (const p of headline) {
    byDate.set(p.date, {
      country: "",
      date: p.date,
      yoy: num(p.yoy),
      mom: p.mom ?? undefined,
      value: p.value ?? undefined,
    });
  }
  for (const p of core) {
    const row = byDate.get(p.date);
    if (row) {
      row.core_yoy = num(p.yoy);
    } else {
      byDate.set(p.date, {
        country: "",
        date: p.date,
        yoy: NaN,
        core_yoy: num(p.yoy),
      });
    }
  }

  const rows = Array.from(byDate.values()).sort(
    (a, b) => parseSeriesDate(a.date) - parseSeriesDate(b.date),
  );

  // annualized_3m روی سطح (از انتهای سری محاسبه می‌شود)
  const levels = rows
    .filter((r) => Number.isFinite(r.value ?? NaN))
    .map((r) => r.value as number);
  if (levels.length >= 4) {
    // به آخرین ردیفِ دارای value، مقدار annualized می‌دهیم
    for (let i = rows.length - 1; i >= 0; i--) {
      if (Number.isFinite(rows[i]!.value ?? NaN)) {
        const win = rows
          .slice(0, i + 1)
          .filter((r) => Number.isFinite(r.value ?? NaN))
          .map((r) => r.value as number);
        const a3 = annualized3mFromLevels(win);
        if (a3 !== undefined) rows[i]!.annualized_3m = a3;
        break;
      }
    }
  }

  return rows;
}

/** deviation از هدف (واحد: واحد درصد). */
export function deviationFromTarget(
  yoy: number,
  target: number,
): number {
  return yoy - target;
}

/** جهت روند از روی چند نقطهٔ آخر YoY. */
export function trendDirection(
  yoySeries: number[],
  window = 3,
): "up" | "down" | "flat" {
  const arr = yoySeries.filter((v) => Number.isFinite(v)).slice(-window);
  if (arr.length < 2) return "flat";
  const delta = arr[arr.length - 1]! - arr[0]!;
  if (Math.abs(delta) < 0.05) return "flat";
  return delta > 0 ? "up" : "down";
}

function num(v: number | null | undefined): number {
  return v === null || v === undefined || Number.isNaN(Number(v))
    ? NaN
    : Number(v);
}
