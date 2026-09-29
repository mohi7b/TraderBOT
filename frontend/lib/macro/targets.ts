/**
 * ============================================================
 * Macro targets — هدف تورمی بانک مرکزی
 * frontend/lib/macro/targets.ts
 * ============================================================
 * منبع اصلی: MAIN DB (macro.db) از طریق API بک‌اند
 *   GET /api/country/<ISO3>  -> { country, inflation_target_low, inflation_target_high, note }
 * config زیر فقط fallback است (اگر API نبود/خطا داد).
 * ============================================================
 */
import type { CountryMeta } from "@/lib/types/series";

export interface CpiTarget {
  country: string;
  /** کران پایین (و اگر target ثابت باشد همان مقدار) */
  low: number | null;
  /** کران بالا */
  high: number | null;
  label?: string | null;
}

/**
 * config fallback (آینهٔ جدول `inflation_targets` در macro.db).
 * منبع حقیقت API است؛ این‌جا فقط برای زمانی که جدول/endpoint در دسترس نیست
 * — پس باید **هم‌مقدار با DB** باشد (وگرنه مثلاً هدف چین «—» می‌شود).
 */
export const CPI_TARGETS: Record<string, CpiTarget> = {
  USA: { country: "USA", low: 2, high: 2, label: "Federal Reserve" },
  EUR: { country: "EUR", low: 2, high: 2, label: "ECB" },
  DEU: { country: "DEU", low: 2, high: 2, label: "ECB" },
  FRA: { country: "FRA", low: 2, high: 2, label: "ECB" },
  ITA: { country: "ITA", low: 2, high: 2, label: "ECB" },
  ESP: { country: "ESP", low: 2, high: 2, label: "ECB" },
  GBR: { country: "GBR", low: 2, high: 2, label: "Bank of England" },
  CAN: { country: "CAN", low: 2, high: 2, label: "Bank of Canada" },
  JPN: { country: "JPN", low: 2, high: 2, label: "Bank of Japan" },
  AUS: { country: "AUS", low: 2, high: 3, label: "Reserve Bank of Australia" },
  IND: { country: "IND", low: 2, high: 6, label: "Reserve Bank of India" },
  BRA: { country: "BRA", low: 3, high: 3, label: "Banco Central do Brasil" },
  CHN: { country: "CHN", low: 3, high: 3, label: "PBoC annual target (≈3%, ceiling)" },
  MEX: { country: "MEX", low: 2, high: 4, label: "Banco de México (3% ±1pp band)" },
  TUR: { country: "TUR", low: 5, high: 5, label: "CBRT target (5%)" },
  KOR: { country: "KOR", low: 2, high: 2, label: "Bank of Korea" },
  RUS: { country: "RUS", low: 4, high: 4, label: "Bank of Russia (4%)" },
  SAU: { country: "SAU", low: 2, high: 2, label: "SAMA (2%)" },
  ZAF: { country: "ZAF", low: 3, high: 6, label: "SARB target band (3–6%)" },
};

export function getCpiTarget(country: string): CpiTarget | undefined {
  return CPI_TARGETS[country.toUpperCase()];
}

/**
 * تبدیل CountryMeta (از API) به CpiTarget با fallback به config.
 * اگر API مقدار نداشت (هر دو null)، از config استفاده نکن اگر معنادار نیست.
 */
export function toCpiTarget(meta: CountryMeta | null): CpiTarget | undefined {
  if (meta) {
    const hasAny =
      meta.inflation_target_low != null || meta.inflation_target_high != null;
    if (hasAny) {
      return {
        country: meta.country,
        low: meta.inflation_target_low,
        high: meta.inflation_target_high,
        label: meta.note ?? null,
      };
    }
  }
  return undefined;
}

/**
 * قالب‌بندی هدف برای Meta Panel:
 *   target ثابت  → "2%"
 *   بازه       → "2% – 3%"
 *   بدون هدف   → "—"
 */
export function formatTarget(
  low: number | null | undefined,
  high: number | null | undefined,
  digits = 2,
): string {
  if (low == null && high == null) return "—";
  const f = (v: number) => {
    const s = v.toFixed(digits);
    return `${parseFloat(s)}%`; // حذف صفرهای انتهایی
  };
  if (low != null && high != null && low !== high) {
    return `${f(low)} – ${f(high)}`;
  }
  const single = low != null ? low : (high as number);
  return f(single);
}
