/**
 * نگاشت گروه‌های ماکرو ↔ مسیرهای بک‌اند.
 * مبنا: collector/macro/backend/http.cjs
 */
import type { Group, Series } from "@/lib/types/series";

export type MacroGroupKey =
  | "1A_inflation"
  | "1A2_inflation_sub"
  | "1B_growth"
  | "1C_labor"
  | "1D_monetary"
  | "1E_growth_core"
  | "1F_market";

export interface MacroGroupDef {
  key: MacroGroupKey;
  title: string;
  /** مسیر JSON بک‌اند (نسبت به /api) */
  path:
    | "inflation"
    | "inflation-sub"
    | "growth"
    | "labor"
    | "monetary"
    | "growth-core"
    | "market";
  canons: string[];
}

export const MACRO_GROUPS: readonly MacroGroupDef[] = [
  {
    key: "1A_inflation",
    title: "Inflation",
    path: "inflation",
    canons: ["CPI", "CORE_CPI", "PPI", "GDP_DEFL"],
  },
  {
    // P1 (2026-09-20): تفکیک تورم — زیرشاخص‌های COICOP + وزن سبد.
    // گروه جدا از 1A نگه داشته شده تا ترکیب/سقف ۶۰-سری آن تغییر نکند.
    key: "1A2_inflation_sub",
    title: "Inflation breakdown",
    path: "inflation-sub",
    canons: ["CPI_SUB", "CPI_WEIGHTS"],
  },
  {
    key: "1B_growth",
    title: "Growth",
    path: "growth",
    canons: ["GDP", "IND_PRO", "RETAIL_SALES"],
  },
  {
    key: "1C_labor",
    title: "Labor",
    path: "labor",
    canons: ["UNEMP", "EMP"],
  },
  {
    // P3 (2026-09-22): نرخ سیاستی بانک مرکزی — برای چارت «Policy Rate vs CPI»
    // + P3-Signals: بازدهی اوراق ۱۰ساله (canon: YIELD_10Y) برای سیگنال 📈
    //   چارت تورمی. هر دو سری «نرخ»اند (kind=rate) و YoY محاسبه نمی‌شوند.
    // گروه مستقل تا ترکیب/سقف گروه‌های قبلی دست‌نخورده بماند.
    key: "1D_monetary",
    title: "Monetary policy",
    path: "monetary",
    canons: ["POLICY_RATE", "YIELD_10Y"],
  },
  {
    // P4-Growth (2026-09-22): رشد فصلی/سالانهٔ GDP برای چارت «GDP Growth».
    // canon اختصاصی `GDP_GROWTH` (OECD `GDP_VPV_YOY`/`GDP_VPV_QOQ` + FRED GDPC1)
    // تا سری‌های سالانهٔ IMF/WB سطح تولید ناخالص مزاحم نشوند.
    key: "1E_growth_core",
    title: "Growth (quarterly GDP)",
    path: "growth-core",
    canons: ["GDP_GROWTH"],
  },
  {
    // P5-Financial (2026-09-23): شاخص‌های بازار جهانی برای چارت «شرایط مالی».
    // ⚠️ کشوری نیستند (کشور سری = USA) و برای هر کشور همان‌ها خوانده می‌شوند.
    key: "1F_market",
    title: "Global market",
    path: "market",
    canons: ["MARKET_GLOBAL"],
  },
] as const;

export function groupByKey(key: string): MacroGroupDef | undefined {
  return MACRO_GROUPS.find((g) => g.key === key);
}

/** کلید یکتای سری برای ادغام/حذف تکراری. */
export function seriesKey(s: Series): string {
  return (
    s.id ||
    [s.dataset, s.country?.code, s.indicator?.code, s.frequency].join("_")
  );
}

/**
 * ادغام دو payload گروه (base + extra).
 *
 * چرا لازم است: `?mode=countries` فقط سری‌های «هشداردهنده» را می‌آورد
 * (17 کشور CPI) و در عوض Core/PPI را از دست می‌دهد؛ payload پیش‌فرض
 * برعکس. برای «Headline vs Core» با ۱۷ کشور هر دو لازم است:
 *
 *   const wide = await fetchMacroGroup("inflation", { mode: "countries" });
 *   const full = await fetchMacroGroup("inflation");                  // Core/PPI
 *   const data = mergeGroups(wide.body, full.body);
 *
 * قواعد:
 *  - سری‌های `base` اول و با ترتیب اصلی حفظ می‌شوند (اولویت انتخاب چارت).
 *  - سری تکراری (همان `seriesKey`) از `extra` نادیده گرفته می‌شود.
 *  - `summary`/`available` مطابق `base` می‌ماند (خلاصهٔ گروه اصلی).
 */
export function mergeGroups(
  base: Group | null | undefined,
  extra: Group | null | undefined,
): Group | null {
  if (!base) return extra ?? null;
  if (!extra) return base;

  const seen = new Set(base.series.map(seriesKey));
  const merged: Series[] = [...base.series];
  for (const s of extra.series) {
    const k = seriesKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(s);
  }

  return {
    ...base,
    series: merged,
    series_count: merged.length,
  };
}
