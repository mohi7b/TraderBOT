/**
 * ============================================================
 * Countries — استخراج داینامیک کشورها از سری‌های بک‌اند
 * frontend/lib/macro/countries.ts
 * ============================================================
 * هیچ لیست ثابتی از کشورها وجود ندارد؛ همه از دادهٔ core می‌آید.
 * (سند chart01 بخش ۶: مقیاس‌پذیری برای هر کشور core.)
 * ============================================================
 */
import type { Series } from "@/lib/types/series";

export interface CountryOption {
  /** ISO3 */
  code: string;
  /** نام نمایشی (انگلیسی از بک‌اند) */
  name: string;
}

/**
 * آیا کد این سری با کد شاخص دلخواه هم‌خوان است؟
 * (شبیه pickSeries در CpiYoyChart — تطابق دقیق یا *_CODE_*)
 */
function indicatorMatches(indicatorCode: string, want: string): boolean {
  return (
    indicatorCode === want || indicatorCode.includes(`_${want}_`)
  );
}

/**
 * حداقل نقاط لازم برای یک سری تا در dropdown بیاید — **بر اساس فرکانس**.
 * (سری سالانه به ۱۳ نقطه ماهانه نیازی ندارد؛ سری ماهانه با <۱۳ نقطه
 *  نمی‌تواند YoY بسازد.)
 */
function minPointsForFrequency(freq: string): number {
  switch ((freq || "").toUpperCase()) {
    case "W": return 24;
    case "M": return 13; // یک سال ماهانه (برای YoY)
    case "Q": return 5;  // یک سال فصل + حاشیه
    case "A": return 2;  // حداقل دو نقطه برای YoY سالانه
    case "D": return 60;
    default:  return 3;
  }
}

/**
 * کشورهای موجود در یک گروه، یکتا و مرتب‌شده.
 *
 * @param requireCode اگر داده شود، فقط کشورهایی برگردانده می‌شوند که
 *   حداقل یک سری با این شاخص و **دادهٔ معتبر** دارند.
 *   (گزینهٔ A: dropdown نباید کشورهای بی‌داده را نشان دهد.)
 */
export function countriesFromSeries(
  series: Series[],
  requireCode?: string,
): CountryOption[] {
  const map = new Map<string, string>();
  for (const s of series) {
    const c = s.country;
    if (!c?.code) continue;

    // فقط شاخص معتبر
    if (requireCode) {
      if (!indicatorMatches(s.indicator.code, requireCode)) continue;
      // حداقل نقاط لازم to be chartable — بر اساس فرکانس هر سری، نه
      // آستانهٔ سخت‌کد ماهانه (این باگ سری‌های سالانه/OECD را حذف می‌کرد).
      const n = s.history?.full?.length ?? 0;
      if (n < minPointsForFrequency(s.frequency)) continue;
    }
    if (!map.has(c.code)) map.set(c.code, c.name ?? c.code);
  }
  return Array.from(map.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** آیا این کشور در گروه موجود است؟ */
export function hasCountry(series: Series[], code: string): boolean {
  return series.some((s) => s.country.code.toUpperCase() === code.toUpperCase());
}
