/**
 * AL — نسخه‌گذاری و کلید کش (تصمیم‌های D7 · D12)
 * frontend/lib/analysis/versioning.ts
 * ============================================================
 * هر خروجی AL باید **قابل ردیابی** باشد: «کدام نسخهٔ فرمول + کدام پارامترها».
 * این ماژول همان دو کلید را می‌دهد:
 *   ۱) `formulaVersion` ⇒ provenance هر سری/سیگنال/مارکر (قاعدهٔ اجباری ChartSpec)
 *   ۲) `analysisCacheKey()` ⇒ کلید کش دوگانهٔ D7 (RAM + DB قابل‌بازسازی):
 *        indicatorId + paramsHash + symbol + tf + formulaVersion
 * ⚠️ این کش **هرگز منبع حقیقت نیست**؛ فقط تکرار محاسبه را حذف می‌کند.
 * ============================================================
 */

/** نسخهٔ کل لایهٔ تحلیل (با هر تغییر ناسازگار در AL بالا می‌رود). */
export const AL_VERSION = "1.0.0" as const;

/**
 * نسخهٔ فرمول هر اندیکاتور — با **هر تغییر ریاضی** (نه تغییر ظاهر) bump می‌شود،
 * تا نتیجهٔ قدیم و جدید هرگز با هم قاطی نشوند (D12).
 */
export const FORMULA_VERSIONS = {
  ema: "1.0.0",
  sma: "1.0.0",
  rsi: "1.0.0",
  macd: "1.0.0",
  atr: "1.0.0",
  bbands: "1.0.0",
  vwap: "1.0.0",
  // ساختار بازار (A3) — نسخهٔ فرمول مستقل، چون تعریفش قراردادی است.
  swing: "1.0.0",
  bos: "1.0.0",
  choch: "1.0.0",
  fvg: "1.1.0",
  // سیگنال‌ها (A2) — هر رویداد شناسهٔ مستقل، چون تُن/معنایش جداگانه قفل می‌شود.
  cross: "1.0.0",
  golden_cross: "1.0.0",
  death_cross: "1.0.0",
  volume_spike: "1.0.0",
  atr_breakout: "1.0.0",
  atr_breakout_up: "1.0.0",
  atr_breakout_down: "1.0.0",
  // A2-2: الگوهای کندلی و دایورجنس
  patterns: "1.0.0",
  pattern_doji: "1.0.0",
  pattern_hammer: "1.0.0",
  pattern_shooting_star: "1.0.0",
  pattern_bullish_engulfing: "1.0.0",
  pattern_bearish_engulfing: "1.0.0",
  divergence: "1.0.0",
  divergence_bearish: "1.0.0",
  divergence_bullish: "1.0.0",
  // A3: ساختار بازار (D9) — رویدادهای شکست و شکاف
  structure: "1.0.0",
  bos_up: "1.0.0",
  bos_down: "1.0.0",
  choch_up: "1.0.0",
  choch_down: "1.0.0",
  fvg_zone: "1.1.0",
  fvg_bull: "1.1.0",
  fvg_bear: "1.1.0",
} as const;

export type FormulaId = keyof typeof FORMULA_VERSIONS;

/** نسخهٔ فرمول یک شناسه (ناشناخته ⇒ `unknown` تا پنهان نماند). */
export function formulaVersionOf(id: string): string {
  return (FORMULA_VERSIONS as Record<string, string>)[id] ?? "unknown";
}

/**
 * هش پایدار پارامترها (FNV-1a ۳۲bit روی JSON مرتب‌شده) — قطعی و بدون وابستگی.
 * کاربرد: کلید کش + `paramsHash` در provenance.
 */
export function paramsHash(params: Record<string, number | string> | undefined): string {
  const canonical = JSON.stringify(
    Object.keys(params ?? {})
      .sort()
      .map((k) => [k, params![k]]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * کلید کش تحلیل (D7) — دقیقاً همان ترتیبی که تصویب شد:
 *   `indicatorId + paramsHash + symbol + tf + formulaVersion`
 */
export function analysisCacheKey(input: {
  id: string;
  params?: Record<string, number | string>;
  symbol: string;
  tf: string;
}): string {
  return [
    input.id,
    paramsHash(input.params),
    input.symbol.toUpperCase(),
    input.tf.toLowerCase(),
    formulaVersionOf(input.id),
  ].join("|");
}
