/**
 * Chart Engine v3 — نسخه‌ها و کلید چارت
 * frontend/lib/chart/spec/version.ts
 * ============================================================
 * **چرا نسخهٔ ریاضی جدا از نسخهٔ قرارداد؟**
 *   اگر وزن‌های FCI یا آستانه‌های GFT/PAS عوض شوند، **عدد روی چارت عوض می‌شود**
 *   در حالی که ساختار قرارداد همان است. بدون ثبت این، تحلیل دیروز قابل
 *   بازتولید نیست. پس هر دامنه `mathVersion` خودش را دارد و در SSR به‌صورت
 *   `data-math-version` منتشر می‌شود.
 *
 * ⚠️ قاعدهٔ تیم: هر تغییر در فایل‌های `lib/macro/{policy,growth,financial}.ts`
 *    که آستانه/وزن/فرمول را عوض کند ⇒ نسخه را +۱ کنید (minor).
 * ============================================================
 */
import { CHART_SPEC_VERSION } from "./types";

export { CHART_SPEC_VERSION };

/** دامنه‌های رسمی چارت (کلید ثابت برای spec/تست/لاگ). */
export type ChartDomain = "cpi" | "policy" | "growth" | "financial";

/**
 * نسخهٔ ریاضی هر دامنه — تاریخچه در `lib/chart/spec/README.md`.
 *  · `cpi`       : ISS + پنج سیگنال کتابخانه (`lib/chart/signals.ts`)
 *  · `policy`    : PAS (EFT=0.4C+0.6F) + Real/Yld/Rmi/Im/Gap/Prf
 *  · `growth`    : GAS (GFT=0.4/0.6) + GMI/OGI/GSI/PMI/NOW/GAPg
 *  · `financial` : FAS (FCI وزنی) + Y10/Credit/DXY/Equity/Liquidity/Vol
 */
export const MATH_VERSIONS: Record<ChartDomain, string> = {
  cpi: "1.0",
  policy: "1.0",
  growth: "1.0",
  financial: "1.0",
};

/** کلید پایدار چارت: `macro.<domain>.<COUNTRY>` (برای override/لاگ/تست). */
export function chartKeyOf(domain: ChartDomain, country?: string | null): string {
  return `macro.${domain}.${(country ?? "ALL").toUpperCase()}`;
}
