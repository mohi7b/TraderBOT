/**
 * ============================================================
 * Policy math — هستهٔ محاسباتی چارت «Policy Rate vs Inflation»
 * frontend/lib/macro/policy.ts
 * ============================================================
 * توابع **خالص** و مستند: RMI · IM · GAP · PRF · EFT · PAS
 *
 * ورودی‌ها (ماهانه، هم‌تراز روی تقویم مشترک):
 *   Rate_t : نرخ سیاستی بانک مرکزی (%)  — BIS::POLICY_RATE (kind = rate)
 *   CPI_t  : تورم کل YoY (%)            — همان مسیر چارت تورم (seriesYoyPoints)
 *   Target : دامنهٔ هدف تورمی (اختیاری) — از macro.db
 *
 * ⚠️ قاعدهٔ پروژه: هیچ مقدار ساختگی. کمبود داده ⇒ `null` و حذف همان سیگنال.
 * ============================================================
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export interface SeriesPointLite {
  date: string;
  value: number;
}

/** تغییر مقدار بین «n ماه قبل» و آخرین ماه (واحد: واحد درصد). */
function deltaAt(points: SeriesPointLite[], backMonths: number): number | null {
  const n = points.length;
  if (n < backMonths + 1) return null;
  const last = points[n - 1]!;
  const prev = points[n - 1 - backMonths]!;
  if (!Number.isFinite(last.value) || !Number.isFinite(prev.value)) return null;
  return last.value - prev.value;
}

/**
 * **RMI — Rate Momentum Index** = ΔRate(۱ماه) + ΔRate(۳ماه)
 *   مثبت = نرخ سیاستی در حال بالا رفتن (سیاست انقباضی) · منفی = انبساطی
 */
export function rateMomentum(ratePoints: SeriesPointLite[]): number | null {
  const d1 = deltaAt(ratePoints, 1);
  const d3 = deltaAt(ratePoints, 3);
  if (d1 === null || d3 === null) return null;
  return round(d1 + d3, 3);
}

/**
 * **IM — Inflation Momentum** = ΔCPI(۱ماه) + ΔCPI(۳ماه)
 *   مثبت = تورم شتاب گرفته · منفی = تورم در حال کاهش
 */
export function inflationMomentum(cpiPoints: SeriesPointLite[]): number | null {
  const d1 = deltaAt(cpiPoints, 1);
  const d3 = deltaAt(cpiPoints, 3);
  if (d1 === null || d3 === null) return null;
  return round(d1 + d3, 3);
}

/**
 * **GAP — Policy Gap** = نرخ سیاستی − تورم کل (واحد درصد)
 *   مثبت = نرخ حقیقی مثبت (سیاست انقباضی) · منفی = نرخ حقیقی منفی (انبساطی)
 * روی آخرین **ماه مشترک** دو سری محاسبه می‌شود.
 */
export function policyGap(
  ratePoints: SeriesPointLite[],
  cpiPoints: SeriesPointLite[],
): number | null {
  const byDate = new Map(cpiPoints.map((p) => [p.date, p.value]));
  for (let i = ratePoints.length - 1; i >= 0; i--) {
    const r = ratePoints[i]!;
    const c = byDate.get(r.date);
    if (c !== undefined && Number.isFinite(c)) return round(r.value - c, 3);
  }
  return null;
}

/**
 * **PRF — Policy Reliability Factor** (۰..۱۰۰٪) = «سیاست چقدر قابل‌اعتماد است»
 *   ۱) نزدیکی تورم به دامنهٔ هدف ⇒ وزن ۶۰٪ (بدون هدف: حذف و وزن کامل به ۲)
 *   ۲) پایداری گام‌های نرخ در ۲۴ ماه اخیر (سهم ماه‌های بدون تغییر) ⇒ ۴۰٪
 */
export function policyReliability(
  ratePoints: SeriesPointLite[],
  cpiPoints: SeriesPointLite[],
  target?: { low: number | null; high: number | null } | null,
): number | null {
  if (ratePoints.length < 4 || cpiPoints.length < 4) return null;

  const lastCpi = cpiPoints[cpiPoints.length - 1]!.value;
  const hi = target?.high ?? null;
  const lo = target?.low ?? null;
  let targetPart: number | null = null;
  if (hi !== null || lo !== null) {
    const over = hi !== null ? Math.max(0, lastCpi - hi) : 0;
    const under = lo !== null ? Math.max(0, lo - lastCpi) : 0;
    const dist = Math.max(over, under); // واحد درصد فراتر از دامنهٔ هدف
    targetPart = clamp(100 - dist * 25, 0, 100); // هر ۱ واحد فراتر = −۲۵
  }

  const win = ratePoints.slice(-24);
  let flat = 0;
  for (let i = 1; i < win.length; i++) {
    if (Math.abs(win[i]!.value - win[i - 1]!.value) < 1e-9) flat++;
  }
  const stability = win.length > 1 ? (flat / (win.length - 1)) * 100 : 0;

  const prf = targetPart === null ? stability : 0.6 * targetPart + 0.4 * stability;
  return Math.round(clamp(prf, 0, 100));
}

// ------------------------------------------------------------------
// ۲) نرمال‌سازی مشترک (۰..۱) — مقیاس‌ها مستند و قابل‌تنظیم
// ------------------------------------------------------------------
/** مقیاس‌های نرمال‌سازی (واحد درصد) — تغییر هرکدام همهٔ آستانه‌ها را جابه‌جا می‌کند. */
export const POLICY_SCALES = {
  /** RMI: ۱٫۵ واحد درصد تغییر نرخ ⇒ اشباع */
  rmi: 1.5,
  /** IM: ۱٫۰ واحد درصد تغییر تورم ⇒ اشباع */
  im: 1.0,
  /** GAP: ۲٫۰ واحد درصد ⇒ اشباع */
  gap: 2.0,
};

const norm01 = (v: number, scale: number) => clamp(0.5 + v / (2 * scale), 0, 1);

/** امتیاز «وضعیت فعلی» = میانگین نرمال‌شدهٔ RMI + IM + GAP. */
export function currentScore(
  rmi: number | null,
  im: number | null,
  gap: number | null,
): number | null {
  const parts: number[] = [];
  if (rmi !== null) parts.push(norm01(rmi, POLICY_SCALES.rmi));
  if (im !== null) parts.push(norm01(-im, POLICY_SCALES.im)); // تورم بالا = وضعیت بد
  if (gap !== null) parts.push(norm01(gap, POLICY_SCALES.gap)); // نرخ حقیقی مثبت = سالم‌تر
  if (!parts.length) return null;
  return round(parts.reduce((a, b) => a + b, 0) / parts.length, 4);
}

/** امتیاز «آینده» = RMI + IM + PRF (PRF به ۰..۱ نگاشت می‌شود). */
export function futureScore(
  rmi: number | null,
  im: number | null,
  prf: number | null,
): number | null {
  const parts: number[] = [];
  if (rmi !== null) parts.push(norm01(rmi, POLICY_SCALES.rmi));
  if (im !== null) parts.push(norm01(-im, POLICY_SCALES.im));
  if (prf !== null) parts.push(clamp(prf / 100, 0, 1));
  if (!parts.length) return null;
  return round(parts.reduce((a, b) => a + b, 0) / parts.length, 4);
}

/**
 * **EFT — Economic Future Trend** = ۰٫۴ × وضعیت فعلی + ۰٫۶ × آینده
 * خروجی ۰..۱ و تنها تعیین‌کنندهٔ **رنگ پس‌زمینهٔ** بج PAS:
 *   🟥 وضعیت بد و آیندهٔ بدتر · 🟨 متوسط/نامطمئن · ⚪ خنثی · 🟩 خوب و رو به بهبود
 */
export function economicFutureTrend(
  current: number | null,
  future: number | null,
): number | null {
  if (current === null && future === null) return null;
  const c = current ?? future!;
  const f = future ?? current!;
  return round(0.4 * c + 0.6 * f, 4);
}

/** سطح رنگ EFT (۰ قرمز · ۱ زرد · ۲ سفید · ۳ سبز) — برش‌های مستند. */
export function eftLevel(eft: number): 0 | 1 | 2 | 3 {
  if (eft < 0.3) return 0;
  if (eft < 0.45) return 1;
  if (eft < 0.6) return 2;
  return 3;
}

// ------------------------------------------------------------------
// ۳) PAS — Policy Action Signal (جهت + زاویه + تعداد + فشار)
// ------------------------------------------------------------------
export type PasArrow = "↑" | "↓" | "→";
/** فلش نمایشی می‌تواند مورب هم باشد (زاویه). */
export type PasGlyph = PasArrow | "↗" | "↘";

/** سطح‌های رنگ (۰ قرمز · ۱ زرد/نارنجی · ۲ سفید/خنثی · ۳ سبز). */
export type Level4 = 0 | 1 | 2 | 3;

export interface PasParts {
  /** جهت سیاست: ↑ انقباضی · ↓ انبساطی · → ثابت */
  direction: PasArrow;
  /** ۱..۳ شدت سیاست (تعداد فلش) */
  count: 1 | 2 | 3;
  /** رنگ **متن**: فشار بر بازارهای ریسکی (۰ قرمز … ۳ سبز) */
  pressureLevel: Level4;
  /** رنگ **پس‌زمینه** از EFT */
  eftLevel: Level4;
  /** فلش نهایی (زاویه × تعداد) — مثال: `↗↗` */
  glyph: string;
  /** EFT به درصد (مقدار نمایشی بج) */
  eft: number;
  current: number;
  future: number;
  /** ورودی‌های خام برای tooltip */
  rmi: number | null;
  im: number | null;
  gap: number | null;
  prf: number | null;
}

/** جهت + زاویه: `sign(RMI + IM)` برای جهت، `|RMI|` برای زاویه. */
export function pasDirection(rmi: number | null, im: number | null): PasArrow {
  const sum = (rmi ?? 0) + (im ?? 0);
  const eps = 0.08; // آستانهٔ «ثابت» (واحد درصد)
  if (sum > eps) return "↑"; // انقباضی
  if (sum < -eps) return "↓"; // انبساطی
  return "→";
}

/** شدت سیاست (تعداد فلش): از GAP + RMI. */
export function pasCount(rmi: number | null, gap: number | null): 1 | 2 | 3 {
  const r = Math.abs(rmi ?? 0) / POLICY_SCALES.rmi;
  const g = Math.abs(gap ?? 0) / POLICY_SCALES.gap;
  const intensity = clamp(0.6 * r + 0.4 * g, 0, 1);
  if (intensity >= 0.66) return 3;
  if (intensity >= 0.33) return 2;
  return 1;
}

/** فشار بر بازارهای ریسکی: از GAP + RMI + IM. */
export function pasPressureLevel(
  rmi: number | null,
  im: number | null,
  gap: number | null,
): Level4 {
  const tighten = clamp(norm01(rmi ?? 0, POLICY_SCALES.rmi), 0, 1); // انقباض
  const infl = clamp(norm01(-(im ?? 0), POLICY_SCALES.im), 0, 1); // تورم بالا
  const realNeg = clamp(norm01(-(gap ?? 0), POLICY_SCALES.gap), 0, 1); // نرخ حقیقی منفی
  const pressure = clamp(0.4 * tighten + 0.3 * infl + 0.3 * realNeg, 0, 1);
  if (pressure >= 0.7) return 0; // فشار زیاد
  if (pressure >= 0.5) return 1; // فشار متوسط
  if (pressure >= 0.35) return 2; // خنثی
  return 3; // رشد
}

/** مونتاژ کامل PAS از ورودی‌های خام (همه چیز خالص و تست‌پذیر). */
export function buildPas(input: {
  ratePoints: SeriesPointLite[];
  cpiPoints: SeriesPointLite[];
  target?: { low: number | null; high: number | null } | null;
}): PasParts | null {
  const rmi = rateMomentum(input.ratePoints);
  const im = inflationMomentum(input.cpiPoints);
  const gap = policyGap(input.ratePoints, input.cpiPoints);
  const prf = policyReliability(input.ratePoints, input.cpiPoints, input.target);
  const current = currentScore(rmi, im, gap);
  const future = futureScore(rmi, im, prf);
  const eft = economicFutureTrend(current, future);
  if (eft === null || current === null) return null;

  const direction = pasDirection(rmi, im);
  const count = pasCount(rmi, gap);
  const rmiMag = Math.abs(rmi ?? 0) / POLICY_SCALES.rmi;
  /**
   * زاویه: |RMI| زیاد ⇒ عمودی · کم ⇒ مورب.
   * ⚠️ «افقی» **فقط** وقتی جهت هم ثابت (→) است؛ وگرنه یک سیاست رو به
   * انقباض/انبساط که نرخ هنوز تکان نخورده باید مورب دیده شود (نه افقی).
   */
  const angled: PasGlyph =
    direction === "→" ? "→" : rmiMag >= 0.55 ? direction : direction === "↑" ? "↗" : "↘";
  const futureNum = future ?? current;

  return {
    direction,
    count,
    pressureLevel: pasPressureLevel(rmi, im, gap),
    eftLevel: eftLevel(eft),
    glyph: angled.repeat(count),
    eft: Math.round(eft * 100),
    current: Math.round(current * 100),
    future: Math.round(futureNum * 100),
    rmi,
    im,
    gap,
    prf,
  };
}

// ------------------------------------------------------------------
// ۴) انتخاب سری نرخ سیاستی (با fallback منطقهٔ یورو)
// ------------------------------------------------------------------
/** استخراج نقاط یک سری از payload API (`history.full`). */
export function pointsOfSeries(s: unknown): SeriesPointLite[] {
  const h =
    (s as { history?: { full?: { date?: unknown; value?: unknown }[] } })?.history?.full ?? [];
  return h
    .map((p) => ({ date: String(p.date ?? ""), value: Number(p.value) }))
    .filter((p) => p.date && Number.isFinite(p.value));
}

/** رتبهٔ عددی تاریخ (ماه‌محور) برای مقایسهٔ تازگی. */
function rankOfDate(date: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(String(date ?? ""));
  return m ? Number(m[1]) * 12 + Number(m[2]) : Number.NEGATIVE_INFINITY;
}

/**
 * سری نرخ سیاستی درست برای یک کشور:
 *   ۱) سری همان کشور؛
 *   ۲) اگر کهنه باشد (بیش از **۱۲ ماه** عقب‌تر از آخرین تورم) ⇒ سری **منطقهٔ
 *      یورو (`XM`)**. دلیل داده‌ای: BIS سری نرخ سیاستی ملی DEU/FRA/ITA را در
 *      دسامبر ۱۹۹۸ متوقف کرده و از آن پس نرخ ECB زیر کشور «XM» منتشر می‌شود؛
 *      پس نرخ معتبر آن سه کشور همان نرخ ECB است (بدون جعل داده).
 */
export function pickPolicyRate<T extends { id: string; country: { code: string } }>(
  series: T[],
  country: string,
  cpiLastDate: string,
): { series: T | null; euroAreaFallback: boolean } {
  const rateSeries = series.filter((s) => s.id.includes("POLICY_RATE"));
  const own =
    rateSeries.find((s) => s.country.code.toUpperCase() === country.toUpperCase()) ?? null;
  const xm = rateSeries.find((s) => s.country.code.toUpperCase() === "XM") ?? null;
  if (!own) return { series: xm, euroAreaFallback: Boolean(xm) };

  const ownRank = rankOfDate(pointsOfSeries(own).slice(-1)[0]?.date ?? "");
  const cpiRank = rankOfDate(cpiLastDate);
  const staleMonths = ownRank === Number.NEGATIVE_INFINITY ? Infinity : cpiRank - ownRank;
  if (staleMonths > 12) return { series: xm ?? own, euroAreaFallback: Boolean(xm && xm !== own) };
  return { series: own, euroAreaFallback: false };
}



