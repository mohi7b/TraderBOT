/**
 * ============================================================
 * TimeShift Engine — موتور مرکزی زمان پلتفرم
 * frontend/lib/time/TimeShift.ts
 * ============================================================
 * نقش: تبدیل یک لحظهٔ UTC به «ساعتِ مرجع بازار» (پیش‌فرض: NY Close)
 * و تولید timestamp مناسب برای موتورهای چارت (LWC از ثانیهٔ UNIX
 * استفاده می‌کند؛ Visx از میلی‌ثانیه).
 *
 * اصول:
 *  - **یک‌بار ساخته شود، همه‌جا استفاده شود** (ماکرو، مارکت، ری‌تایم).
 *  - DST خودکار (با timeZone از Intl؛ بدون محاسبهٔ دستی).
 *  - کاملاً قابل‌پیکربندی (در آینده توسط کاربر از Settings).
 *  - خالص و بدون وابستگی به دامنه/داده.
 * ============================================================
 */

export interface TimeShiftConfig {
  /** منطقهٔ مرجع برای «close» (پیش‌فرض: NY) */
  timeZone: string;
  /** ساعت مرجع (پیش‌فرض ۱۶:۰۰ = NY Close سهام) */
  closeHour: number;
}

export const DEFAULT_TIME_SHIFT: TimeShiftConfig = {
  timeZone: "America/New_York",
  closeHour: 16,
};

/**
 * اجزای تاریخ/ساعت یک لحظه در منطقهٔ مرجع.
 * از `Intl.DateTimeFormat` استفاده می‌کنیم تا DST خودکار لحاظ شود.
 */
export function getZonedParts(
  utcInput: number | Date | string,
  cfg: TimeShiftConfig = DEFAULT_TIME_SHIFT,
): {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0=Sunday
} {
  const d = toDate(utcInput);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const hourRaw = get("hour");
  // en-US با hour12:false ممکن است "24" بدهد بجای "00"
  const hour = Number(hourRaw === "24" ? "0" : hourRaw);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/**
 * آفست منطقهٔ مرجع نسبت به UTC بر حسب **دقیقه** در یک لحظهٔ مشخص.
 * (با مقایسهٔ اجزای zoned و utc محاسبه می‌شود؛ DST را درست درمی‌آورد.)
 */
export function getZoneOffsetMinutes(
  utcInput: number | Date | string,
  cfg: TimeShiftConfig = DEFAULT_TIME_SHIFT,
): number {
  const d = toDate(utcInput);
  const z = getZonedParts(d, cfg);
  // همان اجزا را در UTC می‌سازیم و تفاضل می‌گیریم
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
  return Math.round((asUtc - d.getTime()) / 60000);
}

/**
 * «زمانِ NY Close» متناظر با یک لحظهٔ UTC:
 * همان تاریخِ محلی در منطقهٔ مرجع، تنظیم‌شده روی ساعت closeHour.
 * خروجی: ثانیهٔ UNIX (مناسب LWC).
 */
export function toNyCloseTime(
  utcInput: number | Date | string,
  cfg: TimeShiftConfig = DEFAULT_TIME_SHIFT,
): number {
  const d = toDate(utcInput);
  // محافظ: ورودی غیرقابل‌پارس ⇒ NaN (به‌جای RangeError که SSR را می‌اندازد)
  if (Number.isNaN(d.getTime())) return NaN;
  const z = getZonedParts(d, cfg);
  const offsetMin = getZoneOffsetMinutes(d, cfg);
  // ساخت «ساعت close» در وقت محلی، سپس برگرداندن به UTC
  const localMs = Date.UTC(
    z.year,
    z.month - 1,
    z.day,
    cfg.closeHour,
    0,
    0,
  );
  const utcMs = localMs - offsetMin * 60000;
  return Math.floor(utcMs / 1000);
}

/** timestamp ثانیهٔ UNIX از هر ورودی (برای محور زمانی چارت). */
export function toUnixSeconds(utcInput: number | Date | string): number {
  return Math.floor(toDate(utcInput).getTime() / 1000);
}

/** timestamp میلی‌ثانیهٔ UNIX (برای Visx). */
export function toUnixMillis(utcInput: number | Date | string): number {
  return toDate(utcInput).getTime();
}

/**
 * برچسب نمایش‌پذیر در منطقهٔ مرجع (برای tickMarkFormatter / tooltip).
 */
export function formatInZone(
  utcInput: number | Date | string,
  opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
  },
  cfg: TimeShiftConfig = DEFAULT_TIME_SHIFT,
): string {
  const d = toDate(utcInput);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timeZone,
    ...opts,
  }).format(d);
}

/** یکپارچه‌سازی ورودی به Date معتبر.
 *
 * ⚠️ باگ کشف‌شده در P1 (2026-09-20): `new Date("2026-Q2")` در JS **نامعتبر**
 * است و `Intl.DateTimeFormat.formatToParts()` روی تاریخ نامعتبر
 * `RangeError: Invalid time value` می‌دهد ⇒ کل صفحهٔ SSR با ۵۰۰ می‌افتاد.
 * این حالت با اضافه‌شدن سری هستهٔ **فصلی** (OECD `_TXCP01_NRG` برای AUS) و
 * سری‌های سالانه (وزن‌های سبد) به خط لوله واقعی شد.
 * پس cadenceهای بک‌اند (YYYY-MM / YYYY-Qn / YYYY-Sn / YYYY / ISO) این‌جا
 * دستی پارس می‌شوند — آینهٔ `parseSeriesDate` در `lib/format.ts`.
 */
function toDate(input: number | Date | string): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") {
    // اگر ثانیه بود (کمتر از 1e12) به ms تبدیل کن
    return new Date(input < 1e12 ? input * 1000 : input);
  }
  const s = String(input ?? "").trim();
  if (!s) return new Date(NaN);
  // فصلی: 2026-Q2 → اول فصل
  const q = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (q) return new Date(Date.UTC(Number(q[1]), (Number(q[2]) - 1) * 3, 1));
  // نیم‌سال: 2026-S1
  const h = /^(\d{4})-S([1-2])$/i.exec(s);
  if (h) return new Date(Date.UTC(Number(h[1]), (Number(h[2]) - 1) * 6, 1));
  // ماهانه: 2026-07 (JS خودش می‌فهمد، ولی صریح می‌سازیم تا UTC قطعی باشد)
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  // سالانه: 2026
  if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
  return new Date(s);
}

/**
 * API سطح‌بالا: یک نمونهٔ TimeShift با پیکربندی مشخص.
 * چارت‌ها این نمونه را می‌گیرند تا در آینده با تنظیمات کاربر عوض شود.
 */
export function createTimeShift(cfg: Partial<TimeShiftConfig> = {}) {
  const config: TimeShiftConfig = { ...DEFAULT_TIME_SHIFT, ...cfg };
  return {
    config,
    parts: (t: number | Date | string) => getZonedParts(t, config),
    offsetMinutes: (t: number | Date | string) =>
      getZoneOffsetMinutes(t, config),
    closeSec: (t: number | Date | string) => toNyCloseTime(t, config),
    unixSec: toUnixSeconds,
    unixMs: toUnixMillis,
    format: (
      t: number | Date | string,
      opts?: Intl.DateTimeFormatOptions,
    ) => formatInZone(t, opts, config),
  };
}

export type TimeShift = ReturnType<typeof createTimeShift>;
