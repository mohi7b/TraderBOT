/** ابزارهای قالب‌بندی — خالص، بدون وابستگی دامنه. */

export function formatNumber(
  v: number | null | undefined,
  locale = "en",
  digits = 2,
): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(Number(v));
}

export function formatPercent(
  v: number | null | undefined,
  locale = "en",
  digits = 2,
): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(Number(v));
  return `${n}%`;
}

export function formatDate(date: string | null | undefined, locale = "en"): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
  }).format(d);
}

/**
 * پارسر cadence-aware تاریخ بک‌اند ماکرو → timestamp (ms).
 * بک‌اند سه شکل تاریخ می‌دهد:
 *   ماهانه:  "2026-07"
 *   فصلی:    "2026-Q1"
 *   سالانه:  "2026"
 * `new Date("2026-Q1")` در JS نامعتبر است، پس این‌جا دستی پارس می‌شود.
 * اگر قابل پارس نبود → NaN (چارت‌ها باید آن را رد کنند).
 */
export function parseSeriesDate(date: string | null | undefined): number {
  if (!date) return NaN;
  const s = String(date).trim();

  // ماهانه: YYYY-MM
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return Date.UTC(y, mo - 1, 1);
    return NaN;
  }

  // فصلی: YYYY-Qn
  const q = /^(\d{4})-Q([1-4])$/.exec(s);
  if (q) {
    const y = Number(q[1]);
    const qi = Number(q[2]);
    return Date.UTC(y, (qi - 1) * 3, 1);
  }

  // سالانه: YYYY
  const yOnly = /^(\d{4})$/.exec(s);
  if (yOnly) return Date.UTC(Number(yOnly[1]), 0, 1);

  // تلاش نهایی با Date معمولی (ایزو کامل)
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** قالب‌بندی تاریخ cadence-aware برای نمایش (بدون تبدیل به Date نامعتبر). */
export function formatSeriesDate(
  date: string | null | undefined,
  freq?: string,
  locale = "en",
): string {
  if (!date) return "—";
  const s = String(date).trim();
  const t = parseSeriesDate(s);
  if (Number.isNaN(t)) return s;
  const d = new Date(t);
  if (freq === "A") {
    return new Intl.DateTimeFormat(locale, { year: "numeric" }).format(d);
  }
  if (freq === "Q") {
    return s; // "2026-Q1" خودش گویاست
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
  }).format(d);
}

/** کلاس رنگ معنایی برای اعداد علامت‌دار. */
export function signClass(v: number | null | undefined): "text-pos" | "text-neg" | "text-muted" {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "text-muted";
  if (Number(v) > 0) return "text-pos";
  if (Number(v) < 0) return "text-neg";
  return "text-muted";
}
