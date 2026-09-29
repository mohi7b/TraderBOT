/**
 * AL · ابزارهای آماری مشترک (خالص)
 * frontend/lib/analysis/signals/compute/stats.ts
 * ============================================================
 * **چرا این‌جا (D11):** این توابع قبلاً **دو بار** وجود داشتند (در کتابخانهٔ
 * سیگنال ماکرو `lib/chart/signals.ts`). از A2-2 تنها منبع حقیقت همین‌جاست و
 * کتابخانهٔ ماکرو از AL import می‌کند ⇒ یک ریاضی، دو مصرف‌کننده.
 * انحراف معیار عمداً **نمونه‌ای** (`n−1`) است — همان تعریفی که ماکرو از قبل
 * داشت و تست‌های چارت ماکرو بر آن استوارند (تغییر آن = تغییر معنایی).
 * ============================================================
 */

/** میانگین (آرایهٔ خالی ⇒ `NaN` تا با مقدار جعلی اشتباه نشود). */
export function mean(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** انحراف معیار **نمونه‌ای** (`n−1`) — کمتر از دو نقطه ⇒ ۰. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** شیب خط رگرسیون آخرین `n` نقطه (کمترین مربعات). */
export function slope(xs: number[], n: number): number {
  const s = xs.slice(-n);
  if (s.length < 2) return 0;
  const m = mean(s);
  let num = 0;
  let den = 0;
  for (let i = 0; i < s.length; i++) {
    const dx = i - (s.length - 1) / 2;
    num += dx * (s[i]! - m);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

/** گرد کردن با d رقم اعشار. */
export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** محدودکردن به بازه. */
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
