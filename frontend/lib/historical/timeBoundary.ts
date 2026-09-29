/**
 * TAMC.Historical — مرز زمانی کندل‌ها (NY Close) · H1
 * frontend/lib/historical/timeBoundary.ts
 * ============================================================
 * **تصمیم قطعی (D6 · مصوب کاربر 2026-09-23):** مرز کندل‌ها در دیتابیس و موتور
 * تاریخی **دست‌نخورده** می‌ماند (`bucketFloor` روی UTC) و اصلاح مرز **فقط در
 * لایهٔ TAMC و در مرحلهٔ read → transform → render** انجام می‌شود:
 *
 *       کندل خام (UTC) ──► toNyAxisTime() ──► محور زمان چارت (NY close)
 *
 * ⇒ نه `collector`، نه دیتابیس ۴٫۳۶GB، نه ساختار کندل خام تغییر نمی‌کند
 *   (اصل پروژه: «دادهٔ خام را تغییر نده؛ مشتق را در خواندن حساب کن»).
 *
 * **تابع/پیکربندی موجود که استفاده می‌شود:** `lib/time/TimeShift.ts`
 *   (`DEFAULT_TIME_SHIFT` = `America/New_York` + `closeHour:16` · `getZonedParts`)
 *   و قانون «R1 — مرجع زمانی = NY Close» در `_legacy/DESIGN.md`. این‌جا فقط
 *   **نسخهٔ تاریخی** همان مفهوم ساخته می‌شود: نگاشت «زمان باز شدن باکت UTC» به
 *   «لحظهٔ بسته‌شدن NY» با **DST خودکار** (بدون dependency).
 * ============================================================
 */
import { DEFAULT_TIME_SHIFT } from "@/lib/time/TimeShift";

/** منطقه و ساعت مرجع (از همان منبع حقیقت TimeShift — هاردکد جدید نداریم). */
export const NY_TZ = DEFAULT_TIME_SHIFT.timeZone;
export const NY_CLOSE_HOUR = DEFAULT_TIME_SHIFT.closeHour;

const MIN_MS = 60_000;

/** تایم‌فریم‌های «روزانه و بالاتر» (مرز روزانه + close NY). */
const DAILY_OR_HIGHER = new Set(["1d", "3d", "5d", "1w", "1mo", "1y"]);

export function isDailyOrHigher(tf: string): boolean {
  return DAILY_OR_HIGHER.has(tf);
}

/** اجزای تاریخ/ساعت یک لحظه در منطقهٔ NY (DST خودکار با Intl). */
function zonedParts(utcMs: number) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
  };
}

/** اختلاف NY با UTC به **دقیقه** در آن لحظه (EST=−300 · EDT=−240). */
export function nyOffsetMinutes(utcMs: number): number {
  const z = zonedParts(utcMs);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm);
  return Math.round((asUtc - utcMs) / MIN_MS);
}

/**
 * لحظهٔ **۱۶:۰۰ NY** روی همان روزِ UTC داده‌شده (ms).
 * مقدار مرجع پروژه (`scripts/test-timeshift.mjs`):
 *   `2026-07-15` (EDT) ⇒ **۲۰:۰۰ UTC** = `1784232000` ثانیه.
 */
export function nyCloseMsOfUtcDay(dayStartUtcMs: number): number {
  const offMin = nyOffsetMinutes(dayStartUtcMs);
  return dayStartUtcMs + (NY_CLOSE_HOUR * 60 - offMin) * MIN_MS;
}

/**
 * **نقطهٔ کلیدی TAMC:** تبدیل زمان باز شدن باکت UTC به زمان نمایش روی محور:
 *   · `1d` و بالاتر ⇒ **لحظهٔ NY close همان باکت** (استاندارد بازار جهانی)
 *   · داخل‌روزی (`1m…4h`) ⇒ **جابه‌جایی شبکه به لنگر NY** (۱۶:۰۰ NY = مرز روز)
 * DST per-bucket محاسبه می‌شود؛ در لحظهٔ تغییر ساعت حداکثر یک باکت ±۱h اختلاف
 * دارد (مستند و پذیرفته — بدون دست‌زدن به دادهٔ خام).
 */
/** **S5:** مبدأ ثابت روز = **۲۱:۰۰ UTC** (بدون DST · تصمیم صریح کاربر) */
export const AXIS_ORIGIN_HOUR_UTC = 21;
export const AXIS_ORIGIN_MS = AXIS_ORIGIN_HOUR_UTC * 60 * MIN_MS;

/**
 * **S5 — نگاشت محور با مبدأ ثابت UTC (بدون DST):**
 *   · داخل‌روزی (`1m…4h`): **بدون شیفت** — مبدأ روز (۲۱:۰۰ UTC) از پیش درست است ✓
 *   · روزانه و بالاتر: لحظهٔ **۲۱:۰۰ UTC همان روز UTC** (close ثابت ✓)
 *
 * تضمین ریاضی: `axisTime = ts` یا `ts + K` (K ثابت) ⇒ برای دو باکت متمایز،
 * زمان‌های محور هم متمایزند ⇒ **هیچ برخورد/ادغامی رخ نمی‌دهد** ✓ (حتی در لحظهٔ
 * تغییر ساعت نیویورک ✗). `collapseAxisCollisions` فقط **نگهبان دفاعی** می‌ماند.
 * ⚠️ دادهٔ خام UTC و `bucketFloor` موتور **دست‌نخورده** (D6 ✓).
 */
export function toAxisTime(openUtcMs: number, tf: string): number {
  return isDailyOrHigher(tf) ? openUtcMs + AXIS_ORIGIN_MS : openUtcMs;
}

/** @deprecated **S5** — نام قدیمی (NY close)؛ حفظ برای سازگاری فراخوان‌ها (هم‌رفتار با `toAxisTime`) */
export const toNyAxisTime = toAxisTime;

/** یک کندل خام سرور (شکل واقعی `/tf/:symbol/:tf`). */
export interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  quoteVolume?: number;
  trades?: number;
  exchange?: string;
}

export interface AxisCandle extends RawCandle {
  /** زمان اصلی UTC (دست‌نخورده — برای tooltip/دیباگ) */
  utcTime: number;
  /** زمانی که روی محور چارت می‌نشیند (NY close) */
  axisTime: number;
}

/** تبدیل فهرست کندل باکت‌UTC به فهرست محورِ NY (خالص · بدون mutation). */
export function toNyAxisCandles(candles: RawCandle[], tf: string): AxisCandle[] {
  return candles.map((c) => ({
    ...c,
    utcTime: c.timestamp,
    axisTime: toNyAxisTime(c.timestamp, tf),
  }));
}

/**
 * **ادغام برخورد محور (DST)** — پیش‌نیاز رندر (خطای واقعی 2026-09-23):
 * در لحظهٔ تغییر ساعت، دو باکت متوالی می‌توانند به **یک زمان NY** نگاشت شوند
 * (مثال واقعی: `2026-03-08T06:00Z` و `07:00Z` هر دو ⇒ `11:00Z`).
 * LWC داده با زمان تکراری/نزولی را **نمی‌پذیرد** و چارت با
 * `Assertion failed: data must be asc ordered by time` کرش می‌کند.
 * ادغام، دقیقاً همان کاری است که بازار می‌کند: `open` = اول، `high` = بیشینه،
 * `low` = کمینه، `close` = آخر، حجم = جمع — **هیچ کندل ساختگی ساخته نمی‌شود**
 * (فقط دو باکت هم‌زمان‌شده به یک کندل تبدیل می‌شوند).
 */
export function collapseAxisCollisions(candles: AxisCandle[]): AxisCandle[] {
  const out: AxisCandle[] = [];
  for (const c of candles) {
    const prev = out[out.length - 1];
    if (prev && prev.axisTime === c.axisTime) {
      out[out.length - 1] = {
        ...prev,
        high: Math.max(prev.high, c.high),
        low: Math.min(prev.low, c.low),
        close: c.close,
        volume: (prev.volume ?? 0) + (c.volume ?? 0),
        quoteVolume: (prev.quoteVolume ?? 0) + (c.quoteVolume ?? 0),
        trades: (prev.trades ?? 0) + (c.trades ?? 0),
      };
    } else {
      out.push(c);
    }
  }
  return out;
}

// ------------------------------------------------------------------
// گپ‌ها (A7) — کندل ساختگی نمی‌سازیم؛ فقط **می‌شماریم و گزارش می‌کنیم**
// ------------------------------------------------------------------
export interface GapStats {
  /** تعداد شکاف‌های زمانی بین کندل‌های پیوسته */
  gaps: number;
  /** بزرگ‌ترین شکاف به واحد «کندل غایب» */
  maxGapBars: number;
  /** پوشش = کندل‌های موجود ÷ کندل‌های انتظار در بازه */
  coverage: number;
}

/** شمارش گپ بر پایهٔ زمان **UTC** (معیار داده، نه نمایش). */
export function detectGaps(candles: RawCandle[], tfWidthMs: number): GapStats {
  if (candles.length < 2 || !Number.isFinite(tfWidthMs) || tfWidthMs <= 0) {
    return { gaps: 0, maxGapBars: 0, coverage: candles.length ? 1 : 0 };
  }
  let gaps = 0;
  let missing = 0;
  let maxGapBars = 0;
  for (let i = 1; i < candles.length; i++) {
    const step = Math.round((candles[i]!.timestamp - candles[i - 1]!.timestamp) / tfWidthMs);
    if (step > 1) {
      gaps++;
      missing += step - 1;
      if (step - 1 > maxGapBars) maxGapBars = step - 1;
    }
  }
  const expected = candles.length + missing;
  return { gaps, maxGapBars, coverage: expected ? candles.length / expected : 0 };
}

/**
 * **تست طلایی خود-بررسی (DEV/CI سبک)** — مقادیر مرجع پروژه:
 *   EST = −۳۰۰ · EDT = −۲۴۰ · `2026-07-15` (EDT) ⇒ ۲۰:۰۰ UTC = `1784232000`s
 * @returns فهرست خطاها (خالی = سالم)
 */
export function timeBoundarySelfTest(): string[] {
  const errs: string[] = [];
  const jan = Date.UTC(2026, 0, 15, 0, 0, 0);
  const jul = Date.UTC(2026, 6, 15, 0, 0, 0);
  if (nyOffsetMinutes(jan) !== -300) errs.push(`EST offset=${nyOffsetMinutes(jan)} (انتظار -300)`);
  if (nyOffsetMinutes(jul) !== -240) errs.push(`EDT offset=${nyOffsetMinutes(jul)} (انتظار -240)`);
  const close = Math.floor(nyCloseMsOfUtcDay(jul) / 1000);
  if (close !== 1784232000) errs.push(`NY close 2026-07-15=${close} (انتظار 1784232000)`);
  /** **S5:** داخل‌روزی بدون شیفت · روزانه = ۲۱:۰۰ UTC همان روز */
  if (toAxisTime(jul, "1h") !== jul) errs.push("S5: شیفت داخل‌روزی باید صفر باشد");
  if (toAxisTime(jul, "1d") !== Date.UTC(2026, 6, 15, 21, 0, 0)) {
    errs.push(`S5: close روزانه=${new Date(toAxisTime(jul, "1d")).toISOString()} (انتظار 21:00Z)`);
  }
  if (toAxisTime(jul, "1d") !== jul + AXIS_ORIGIN_MS) errs.push("S5: close روزانه ناهم‌خوان با مبدأ ثابت");
  const g = detectGaps(
    [
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 4 * MIN_MS, open: 1, high: 1, low: 1, close: 1 },
    ],
    MIN_MS,
  );
  if (g.gaps !== 1 || g.maxGapBars !== 3) errs.push(`detectGaps=${JSON.stringify(g)}`);

  /**
   * **S5 — ناورد تازه (جای تست برخورد قدیمی):** با مبدأ ثابت ۲۱:۰۰ UTC، در لحظهٔ
   * تغییر ساعت نیویورک **نباید** هیچ برخوردی رخ دهد و محور باید اکیداً صعودی و
   * با فاصلهٔ دقیق یک تایم‌فریم بماند ✓ (تست قبلی انتظار برخورد داشت ✗ — آن
   * برخورد خودش منبع اختلاف سیستماتیک اندیکاتورها بود · §S5).
   */
  const dstDay = toNyAxisCandles(
    [
      { timestamp: Date.UTC(2026, 2, 8, 6, 0, 0), open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { timestamp: Date.UTC(2026, 2, 8, 7, 0, 0), open: 11, high: 15, low: 10, close: 14, volume: 2 },
    ],
    "1h",
  );
  if (dstDay.length !== 2) errs.push(`S5: انتظار ۲ کندل محور (${dstDay.length})`);
  if (dstDay[1]!.axisTime - dstDay[0]!.axisTime !== 3600_000) {
    errs.push("S5: فاصلهٔ محور در گذر DST باید دقیقاً ۱ ساعت باشد");
  }
  const merged = collapseAxisCollisions(dstDay);
  if (merged.length !== 2) errs.push(`S5: هیچ ادغامی نباید رخ دهد (${merged.length}) ✓`);
  const ascending = toNyAxisCandles(
    [
      { timestamp: Date.UTC(2026, 2, 8, 6, 0, 0), open: 1, high: 1, low: 1, close: 1 },
      { timestamp: Date.UTC(2026, 2, 8, 12, 0, 0), open: 1, high: 1, low: 1, close: 1 },
      { timestamp: Date.UTC(2026, 2, 9, 0, 0, 0), open: 1, high: 1, low: 1, close: 1 },
    ],
    "1h",
  );
  for (let i = 1; i < ascending.length; i++) {
    if (ascending[i]!.axisTime <= ascending[i - 1]!.axisTime) errs.push("محور اکیداً صعودی نیست");
  }
  return errs;
}
