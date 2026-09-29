/**
 * Chart Engine v3 — سیاست واحد «بدون داده»
 * frontend/lib/chart/spec/missing.ts
 * ============================================================
 * پیش از v3 سه رفتار موازی داشتیم و همین باعث سردرگمی می‌شد:
 *   · چارت تورمی: سیگنال بدون‌داده **حذف** می‌شد
 *   · چارت رشد  : بج با مقدار `—` و برچسب خودش (PMI/NOW)
 *   · چارت مالی : بج با مقدار `N/A` و برچسب خودش (درخواست کاربر)
 * این فایل **تنها** جای پیاده‌سازی این سه حالت است؛ همهٔ دامنه‌ها از این‌جا
 * می‌سازند تا رفتار یکسان و قابل‌تست بماند.
 *
 * ⚠️ در همهٔ حالت‌ها: **هیچ مقدار ساختگی/صفر** ساخته نمی‌شود و رنگ متن
 *    «سفید خنثی» (اسلات `valueFlat`) است و فلش ندارد.
 * ============================================================
 */
import type { ChartSignal } from "@/lib/chart/types";
import type { MissingPolicy, SeriesStatus } from "./types";

/** متن نمایشی هر سیاست (فقط مقدار — فلش ندارد). */
export const MISSING_DISPLAY: Record<MissingPolicy, string> = {
  hide: "",
  dash: "—",
  na: "N/A",
};

/** آیا با این سیاست، بج رسم می‌شود؟ */
export function rendersWhenMissing(policy: MissingPolicy): boolean {
  return policy !== "hide";
}

/**
 * ساخت بج «بدون داده» با سیاست مشخص.
 * @param policy `hide` ⇒ `null` برمی‌گرداند (دامنه خودش بج را حذف می‌کند)
 * @param label  برچسب کوتاه سیگنال (`Real`/`PMI`/`Yld`/…)
 * @param hintKey کلید i18n توضیح (نه متن هاردکد)
 */
export function missingSignal(input: {
  policy: MissingPolicy;
  id: string;
  label: string;
  hintKey?: string;
  hintParams?: Record<string, string | number>;
}): ChartSignal | null {
  if (!rendersWhenMissing(input.policy)) return null;
  return {
    id: input.id,
    label: input.label,
    display: MISSING_DISPLAY[input.policy],
    value: null,
    tone: "neutral",
    valueTone: "neutral",
    ...(input.hintKey ? { hintKey: input.hintKey } : {}),
    ...(input.hintParams ? { hintParams: input.hintParams } : {}),
  };
}

/** تبدیل وضعیت داده به سیاست مؤثر (کمکی برای دامنه‌ها). */
export function statusOf(ok: boolean, stale = false): SeriesStatus {
  return stale ? { kind: "stale" } : ok ? { kind: "ok" } : { kind: "missing" };
}
