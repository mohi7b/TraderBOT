/**
 * هستهٔ خالص چارت «رشد اقتصادی» (GDP Growth) — GAS و سیگنال‌های رشد.
 * frontend/lib/macro/growth.ts
 * ============================================================
 * همهٔ توابع **خالص** و مستندند: ورودی سری‌های ٪ چهارفصلی، خروجی عدد/سیگنال.
 * هیچ مقدار «ساختگی» ساخته نمی‌شود؛ اگر داده‌ای نباشد `null` برمی‌گردد و بج
 * به‌شکل `N/A —` رسم می‌شود (`noDataSignal` در `macroSignals.ts`).
 *
 * **تعریف‌ها (طبق پرامپت کاربر 2026-09-22):**
 * | کلید | فرمول |
 * |---|---|
 * | `GMI` | مومنتوم رشد = Δ رشد YoY (۱ و ۳ فصل) + Δ رشد QoQ (۱ و ۳ فصل) |
 * | `OGI` | شکاف تولید = انحراف **سطح** GDP (زنجیره‌شده از QoQ) از روند ۴فصلی |
 * | `GSI` | شاخص پایداری = σ گام‌های رشد (کمتر = پایدارتر) |
 * | `GAPg` | شکاف روند = GDP YoY − میانگین ۴ فصل قبل |
 * | `GFT` | = ۰٫۴×Current + ۰٫۶×Future (پایهٔ **پس‌زمینهٔ** GAS) |
 * | `PMI`/`NOW` | Combo PMI و Nowcast — **منبع داده موجود نیست** ⇒ `N/A` |
 *
 * **چرا مشتق‌گیری؟** دادهٔ OECD/FRED/Eurostat هر کشور متفاوت است:
 *   · `GDP_VPV_YOY` (٪ سالانه) · `GDP_VPV_QOQ` (٪ فصلی) · `GDP_YOY` (٪ سالانه)
 *   · `GDP_CLV_PCH_SM` (Eurostat: ٪ فصلی فصلی‌تعدیل‌شده) · `GDPC1` (سطح واقعی، USA)
 * برای اینکه همهٔ کشورها **دو خط قابل‌مقایسه** داشته باشند، در نبود سری خام:
 *   · YoY از ایندکس سطح یا از زنجیرهٔ QoQ محاسبه می‌شود
 *   · QoQ از سطح محاسبه می‌شود
 * این‌ها تبدیل ریاضی دادهٔ منتشرشده‌اند (نه جعل) و در tooltip علامت‌گذاری می‌شوند.
 * ============================================================
 */
import type { ChartSignal } from "@/lib/chart/types";
import { pointsOfSeries } from "@/lib/macro/policy";
import { noDataSignal } from "@/lib/macro/macroSignals";

/** نقطهٔ سبک سری (هم‌شکل `SeriesPointLite`). */
export interface GrowthPoint {
  date: string;
  value: number;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * رتبهٔ فصلی تاریخ برای مقایسه/گارد کهنگی.
 *   · `YYYY-Qn` ⇒ سال×۴ + (فصل−۱)
 *   · `YYYY` (سری **سالانه** مثل World Bank) ⇒ سال×۴ + ۳ (فصل ۴)
 * ⚠️ بدون حالت دوم، سری سالانه رتبهٔ `-∞` می‌گرفت و **همیشه کهنه** تشخیص داده
 *    می‌شد (باگ واقعی کشف‌شده در fallback سالانهٔ SAU/CAN/GBR/KOR).
 */
export function rankOfQuarter(date: string): number {
  const mq = /^(\d{4})-Q([1-4])/.exec(String(date ?? ""));
  if (mq) return Number(mq[1]) * 4 + (Number(mq[2]) - 1);
  const my = /^(\d{4})/.exec(String(date ?? ""));
  return my ? Number(my[1]) * 4 + 3 : Number.NEGATIVE_INFINITY;
}

/** حداقل نقاط لازم برای یک خط رشد. */
export const GROWTH_MIN_POINTS = 8;
/** حداکثر فاصلهٔ مجاز آخرین نقطهٔ سری از مرجع (فصل) — جلوگیری از دادهٔ مُرده. */
export const GROWTH_MAX_STALE_QUARTERS = 6;

/**
 * مقیاس‌های نرمال‌سازی (یک‌جا و قابل‌تنظیم — منبع حقیقت نرمال‌سازی GFT).
 *   `level`    : رشد YoY از −۲٪ تا +۶٪ ⇒ ۰..۱ (۰٪ ≈ ۰٫۲۵)
 *   `momentum` : GMI از −۱ تا +۱ ⇒ ۰..۱
 *   `sigmaRef` : σ مرجع برای «پایداری» (۲٪ ⇒ پایداری ۰٪)
 */
export const GROWTH_SCALES = {
  level: { min: -2, max: 6 },
  momentum: { min: -1, max: 1 },
  sigmaRef: 2.0,
  /** آستانه‌های تُن متن سیگنال‌ها (۴ سطح) */
  tone: { gmi: 0.3, ogi: 0.5, gapg: 0.5, sigma: { good: 0.4, mid: 0.9, high: 1.6 } },
  /** وزن‌های GFT (پرامپت: ۰٫۴ فعلی + ۰٫۶ آینده) */
  gft: { current: 0.4, future: 0.6 },
  /** وزن اجزای «آینده» = مومنتوم ۰٫۶ + شکاف روند ۰٫۴ */
  future: { momentum: 0.6, gap: 0.4 },
} as const;

/** نرمال‌سازی خطی به ۰..۱ با بریدن در بازه (پایهٔ GFT). */
export function norm01(v: number, scale: { min: number; max: number }): number {
  if (!Number.isFinite(v) || scale.max === scale.min) return Number.NaN;
  return clamp((v - scale.min) / (scale.max - scale.min), 0, 1);
}

// ------------------------------------------------------------------
// ۲) شاخص‌های مشتق رشد
// ------------------------------------------------------------------
/** گام‌های متوالی یک سری (Δ فصل‌به‌فصل). */
export function diffsOf(vals: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < vals.length; i++) out.push(vals[i]! - vals[i - 1]!);
  return out;
}

/**
 * **GMI** = مومنتوم رشد = Δ۱+Δ۳ رشد YoY **به‌علاوهٔ** Δ۱+Δ۳ رشد QoQ.
 * اگر سری QoQ نباشد فقط YoY استفاده می‌شود (مستند؛ بدون جعل).
 */
export function growthMomentum(yoy: number[], qoq: number[]): number | null {
  if (yoy.length < 4) return null;
  const n = yoy.length;
  const yoyMom = yoy[n - 1]! - yoy[n - 2]! + (yoy[n - 1]! - yoy[n - 4]!);
  if (qoq.length < 4) return round(yoyMom, 2);
  const m = qoq.length;
  const qoqMom = qoq[m - 1]! - qoq[m - 2]! + (qoq[m - 1]! - qoq[m - 4]!);
  return round(yoyMom + qoqMom, 2);
}

/**
 * **OGI** = شکاف تولید (٪) = انحراف سطح از **روند ۴فصلی قبلی**.
 * چرا این پروکسی: سری «GDP بالقوه» منتشر نمی‌شود؛ روند ۴فصلی سطح، همان
 * تعریف استاندارد شکاف در نبود potential است (روش مستند، نه دادهٔ ساختگی).
 */
export function outputGap(level: number[]): number | null {
  if (level.length < GROWTH_MIN_POINTS) return null;
  const last = level[level.length - 1]!;
  const trend = mean(level.slice(-5, -1));
  if (!Number.isFinite(trend) || trend === 0) return null;
  return round((last / trend - 1) * 100, 2);
}

/** **GSI** = σ گام‌های رشد (۸ فصل اخیر) — کمتر = پایدارتر. */
export function growthSigma(yoy: number[]): number | null {
  if (yoy.length < 6) return null;
  const sd = stdev(diffsOf(yoy).slice(-8));
  return Number.isFinite(sd) ? round(sd, 2) : null;
}

/** پایداری ۰..۱۰۰ = نرمال‌سازی معکوس σ (`sigmaRef` ⇒ ۰٪). */
export function growthStability(sigma: number | null): number | null {
  if (sigma == null || !Number.isFinite(sigma)) return null;
  return Math.round(clamp(100 - (sigma / GROWTH_SCALES.sigmaRef) * 100, 0, 100));
}

/** **GAPg** = رشد YoY − میانگین ۴ فصل قبل (٪). */
export function trendGap(yoy: number[]): number | null {
  if (yoy.length < 5) return null;
  const last = yoy[yoy.length - 1]!;
  const trend = mean(yoy.slice(-5, -1));
  return Number.isFinite(trend) ? round(last - trend, 2) : null;
}

// ------------------------------------------------------------------
// ۳) تُن رنگ (۴ سطح)
// ------------------------------------------------------------------
/** تُن چهارسطحی برای مقادیر «بزرگ‌تر بهتر» (رشد): سبز/زرد/سفید/قرمز. */
export function growthTone(v: number | null, hi: number): ChartSignal["tone"] {
  if (v == null || !Number.isFinite(v)) return "neutral";
  if (v >= hi) return "pos";
  if (v >= 0) return "warn";
  if (v > -hi) return "neutral";
  return "neg";
}

/** تُن چهارسطحی **معکوس** برای σ (کمتر = بهتر). */
export function sigmaTone(sigma: number | null): ChartSignal["tone"] {
  if (sigma == null || !Number.isFinite(sigma)) return "neutral";
  const t = GROWTH_SCALES.tone.sigma;
  if (sigma <= t.good) return "pos";
  if (sigma <= t.mid) return "warn";
  if (sigma <= t.high) return "neutral";
  return "neg";
}

/** گلیف جهت رشد (پرامپت: ▲ بالا · ▼ پایین · ▷ ثابت). */
export type GasGlyph = "▲" | "▼" | "▷";
/** گلیف با زاویه (سرعت/شتاب): عمودی `▲▼` · مورب `↗↘` · افقی `▷`. */
export type GasAngleGlyph = GasGlyph | "↗" | "↘";

/** خروجی محاسبهٔ GAS (همه اجزا برای tooltip شفاف). */
export interface GasParts {
  gmi: number | null;
  ogi: number | null;
  sigma: number | null;
  stability: number | null;
  gapg: number | null;
  current01: number | null;
  future01: number | null;
  /** GFT نرمال‌شده ۰..۱ (پایهٔ **پس‌زمینه**) */
  gft: number | null;
  /** سطح ۰..۳ (قرمز..سبز) */
  gftLevel: 0 | 1 | 2 | 3;
  direction: "up" | "down" | "flat";
  /** گلیف با زاویه */
  glyph: GasAngleGlyph;
  /** شدت ۱..۳ (تعداد فلش ⇒ ضخامت متن بج) */
  count: 1 | 2 | 3;
  /** فشار ۰..۱ (شدت مرکب GMI+OGI) */
  pressure: number;
  /** اثر بر بازارهای مالی (رنگ متن بج) */
  effectTone: ChartSignal["tone"];
}

/**
 * محاسبهٔ کامل اجزای **GAS** از دو خط رشد.
 * ⚠️ **PMI** و **Nowcast** منبع داده ندارند ⇒ سهمشان در فرمول صفر است
 *    (در tooltip صریح گفته می‌شود) و هیچ عدد ساختگی جایشان نمی‌نشیند.
 */
export function buildGas(input: {
  yoy: GrowthPoint[];
  qoqSaar: GrowthPoint[];
  /** ایندکس سطح (اختیاری — مثل FRED GDPC1) برای OGI دقیق‌تر */
  level?: GrowthPoint[];
}): GasParts | null {
  const yoyVals = input.yoy.map((p) => p.value);
  if (yoyVals.length < 5) return null;
  const qoqVals = input.qoqSaar.map((p) => p.value);
  const lastYoy = yoyVals[yoyVals.length - 1]!;

  const gmi = growthMomentum(yoyVals, qoqVals);
  // سطح: ایندکس داده‌شده یا زنجیرهٔ QoQ خودمان (تبدیل ریاضی، نه دادهٔ ساختگی)
  const level = input.level?.length
    ? input.level.map((p) => p.value)
    : chainIndex(
        input.qoqSaar.map((p) => ({ date: p.date, value: ((1 + p.value / 100) ** 0.25 - 1) * 100 })),
      ).map((p) => p.value);
  const ogi = outputGap(level);
  const sigma = growthSigma(yoyVals);
  const stability = growthStability(sigma);
  const gapg = trendGap(yoyVals);

  // ---- GFT = ۰٫۴×Current + ۰٫۶×Future (پرامپت) ----
  const current01 = norm01(lastYoy, GROWTH_SCALES.level);
  const futureRaw =
    (gmi ?? 0) * GROWTH_SCALES.future.momentum + (gapg ?? 0) * GROWTH_SCALES.future.gap;
  const future01 = norm01(futureRaw, GROWTH_SCALES.momentum);
  const gft =
    Number.isFinite(current01) && Number.isFinite(future01)
      ? round(GROWTH_SCALES.gft.current * current01 + GROWTH_SCALES.gft.future * future01, 3)
      : null;
  const gftLevel: GasParts["gftLevel"] =
    gft == null ? 1 : gft >= 0.75 ? 3 : gft >= 0.5 ? 2 : gft >= 0.25 ? 1 : 0;

  // ---- جهت = sign(GMI + PMI) · PMI موجود نیست ⇒ فقط GMI (مستند) ----
  const dirScore = gmi ?? 0;
  const direction: GasParts["direction"] =
    dirScore > 0.15 ? "up" : dirScore < -0.15 ? "down" : "flat";
  // ---- زاویه از |GMI|: زیاد = عمودی · متوسط = مورب · ~صفر = افقی ----
  const mag = Math.abs(dirScore);
  const glyph: GasParts["glyph"] =
    direction === "flat"
      ? "▷"
      : mag >= 0.6
        ? direction === "up"
          ? "▲"
          : "▼"
        : direction === "up"
          ? "↗"
          : "↘";
  // ---- شدت (تعداد فلش) از GMI + OGI ----
  const pressure = clamp((Math.abs(dirScore) + Math.abs(ogi ?? 0)) / 1.7, 0, 1);
  const count: GasParts["count"] = pressure < 0.35 ? 1 : pressure < 0.67 ? 2 : 3;

  return {
    gmi,
    ogi,
    sigma,
    stability,
    gapg,
    current01: Number.isFinite(current01) ? round(current01, 3) : null,
    future01: Number.isFinite(future01) ? round(future01, 3) : null,
    gft,
    gftLevel,
    direction,
    glyph,
    count,
    pressure: round(pressure, 2),
    /** اثر بر بازار = GMI (+ PMI/Nowcast که موجود نیستند ⇒ سهم صفر) */
    effectTone: growthTone(gmi, GROWTH_SCALES.tone.gmi),
  };
}

// ------------------------------------------------------------------
// ۴) ساخت بج‌های سیگنال چارت رشد (GAS + ۶ فرعی)
// ------------------------------------------------------------------
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${round(v, d)}`;
const dirArrow = (v: number | null, eps = 0.15): string =>
  v == null ? "" : v > eps ? "▲" : v < -eps ? "▼" : "▷";

/**
 * بج‌های سیگنال چارت رشد **به‌ترتیب پرامپت**:
 *   `GAS` (پس‌زمینه‌دار، بج اصلی) → `GMI` · `OGI` · `GSI` · `PMI` · `NOW` · `GAPg`.
 *
 * قواعد ظاهر (مثل دو چارت قبلی): فقط `GAS` پس‌زمینهٔ رنگی و «شدت» دارد؛
 * بقیه بدون پس‌زمینه، بدون شدت، فقط فلش مثلثی (برای جهت‌محورها) + رنگ متن + مقدار.
 *
 * ⚠️ سیگنال‌های **PMI** و **NOW** منبع داده ندارند ⇒ بج `—` با رنگ سفید
 *    (برچسبشان می‌ماند تا جای سیگنال در سطر مشخص باشد — برخلاف `Yld` که
 *    کاربر صریحاً «N/A» خواست).
 */
export function growthSignals(input: {
  gas: GasParts | null;
  yoy: GrowthPoint[];
  qoqSaar: GrowthPoint[];
  origin: { yoy: GrowthPick["yoyOrigin"]; qoq: GrowthPick["qoqOrigin"]; sources: string[] };
}): ChartSignal[] {
  const { gas, origin } = input;
  const out: ChartSignal[] = [];
  /**
   * v3: به‌جای متن آمادهٔ فارسی، **پارامترهای ترجمه** ساخته می‌شود.
   * `raw`/`derived`/`none` توکن‌های فنی‌اند (در هر دو زبان یکسان می‌مانند) و
   * شناسهٔ سری‌ها هم ترجمه‌نشدنی است؛ فقط قالب جمله از i18n می‌آید.
   */
  const srcParams = {
    yoySrc: origin.yoy,
    qoqSrc: origin.qoq,
    sources: origin.sources.join(" , ") || "—",
  };

  if (!gas) {
    out.push(noDataSignal("gas", "signals.gas.noData", "Gas", srcParams));
    return out;
  }

  const stability = gas.stability;
  out.push({
    id: "gas",
    label: "Gas",
    display: `${gas.glyph} ${stability == null ? "—" : `${stability}%`}`,
    tone: GFT_TONE[gas.gftLevel]!,
    valueTone: gas.effectTone,
    weight: gas.count,
    fill: true,
    value: stability,
    hintKey: "signals.gas.hint",
    hintParams: {
      gft: gas.gft ?? "—",
      level: gas.gftLevel,
      current: gas.current01 ?? "—",
      future: gas.future01 ?? "—",
      direction: gas.direction,
      count: gas.count,
      pressure: gas.pressure,
      gmi: gas.gmi ?? "—",
      ogi: gas.ogi ?? "—",
      sigma: gas.sigma ?? "—",
      stability: stability ?? "—",
      gapg: gas.gapg ?? "—",
      ...srcParams,
    },
  });

  out.push({
    id: "gmi",
    label: "GMI",
    display: `${dirArrow(gas.gmi)} ${signed(gas.gmi ?? 0)}`,
    value: gas.gmi,
    tone: growthTone(gas.gmi, GROWTH_SCALES.tone.gmi),
    valueTone: growthTone(gas.gmi, GROWTH_SCALES.tone.gmi),
    hintKey: "signals.gmi.hint",
    hintParams: { value: gas.gmi ?? "—", ...srcParams },
  });

  out.push({
    id: "ogi",
    label: "OGI",
    display: `${dirArrow(gas.ogi, 0.2)} ${gas.ogi == null ? "—" : `${signed(gas.ogi)}%`}`,
    value: gas.ogi,
    tone: growthTone(gas.ogi, GROWTH_SCALES.tone.ogi),
    valueTone: growthTone(gas.ogi, GROWTH_SCALES.tone.ogi),
    hintKey: "signals.ogi.hint",
    hintParams: { value: gas.ogi ?? "—" },
  });

  out.push({
    id: "gsi",
    label: "GSI",
    display: `σ ${gas.sigma == null ? "—" : round(gas.sigma, 2)}`,
    value: gas.sigma,
    tone: sigmaTone(gas.sigma),
    valueTone: sigmaTone(gas.sigma),
    hintKey: "signals.gsi.hint",
    hintParams: {
      sigma: gas.sigma ?? "—",
      stability: stability ?? "—",
      sigmaRef: GROWTH_SCALES.sigmaRef,
    },
  });

  /* ---- PMI و NOW: بدون منبع داده (سیاست dash: مقدار `—`، رنگ سفید) ---- */
  out.push(noDataSignal("pmi", "signals.pmi.noData", "PMI"));
  out.push(noDataSignal("now", "signals.now.noData", "NOW"));

  out.push({
    id: "gapg",
    label: "GAPg",
    display: `${dirArrow(gas.gapg)} ${gas.gapg == null ? "—" : `${signed(gas.gapg)}pp`}`,
    value: gas.gapg,
    tone: growthTone(gas.gapg, GROWTH_SCALES.tone.gapg),
    valueTone: growthTone(gas.gapg, GROWTH_SCALES.tone.gapg),
    hintKey: "signals.gapg.hint",
    hintParams: { value: gas.gapg ?? "—" },
  });

  return out;
}
/** نگاشت سطح GFT (۰..۳) به تُن پس‌زمینهٔ بج اصلی — همان نردبان چارت‌های قبلی. */
export const GFT_TONE: Record<number, ChartSignal["tone"]> = {
  0: "neg",
  1: "risk",
  2: "warn",
  3: "pos",
};


// ------------------------------------------------------------------
// ۱) انتخاب/مشتق سری‌های رشد یک کشور
// ------------------------------------------------------------------
interface SeriesLike {
  id: string;
  country: { code: string };
  indicator?: { code?: string; provider_code?: string };
}

/** کدهای provider که «رشد سالانه» هستند. */
const YOY_CODES = ["GDP_VPV_YOY", "GDP_YOY"];
/** کدهای provider که «رشد فصلی» هستند (`GDP_CLV_PCH_SM` = QoQ فصلی‌تعدیل‌شده). */
const QOQ_CODES = ["GDP_VPV_QOQ", "GDP_CLV_PCH_SM"];
/** کد سطح (برای مشتق‌گیری — FRED فقط USA). */
const LEVEL_CODES = ["GDPC1"];
/**
 * **fallback سالانه** برای کشورهایی که سری فصلی‌شان ناقص است
 * (نمونهٔ واقعی: SAU/CAN/GBR/KOR فقط ۱ نقطهٔ فصلی دارند ولی رشد سالانهٔ
 * واقعی World Bank ۶۵ نقطه دارد). `NY.GDP.MKTP.KD.ZG` = رشد سالانهٔ GDP (٪).
 * ⚠️ `NGDP_RPCH` (IMF WEO) عمداً نیست: تا ۲۰۳۱ **پیش‌بینی** دارد.
 */
const ANNUAL_CODES = ["NY.GDP.MKTP.KD.ZG"];
/** کف نقاط **نمایش**: یک خط با ۲ نقطه هم رسم می‌شود (ریاضی GAS کف خودش را دارد). */
export const GROWTH_DISPLAY_MIN_POINTS = 2;

function providerCodeOf(s: SeriesLike): string {
  return String(s.indicator?.provider_code ?? s.id ?? "");
}
function pointsWithDates(s: unknown): GrowthPoint[] {
  return pointsOfSeries(s)
    .map((p) => ({ date: p.date, value: p.value }))
    .filter((p) => Number.isFinite(p.value));
}

/**
 * بهترین سری از یک فهرست کد: **پرنقطه‌ترین** سری تازه (≥ حداقل نقاط).
 * سری‌ای که آخرین نقطه‌اش بیش از `GROWTH_MAX_STALE_QUARTERS` فصل از مرجع
 * عقب‌تر است «دادهٔ مُرده» است و رد می‌شود (تجربه: MEX تا 2022-Q4 · RUS 2010-Q4).
 */
function pickSeries<T extends SeriesLike>(
  series: T[],
  codes: string[],
  country: string,
  refRank: number,
  opts: { minPoints?: number } = {},
): { points: GrowthPoint[]; id: string } | null {
  const cc = country.toUpperCase();
  const minPoints = opts.minPoints ?? GROWTH_DISPLAY_MIN_POINTS;
  let best: { points: GrowthPoint[]; id: string } | null = null;
  for (const s of series) {
    if (s.country?.code?.toUpperCase() !== cc) continue;
    const code = providerCodeOf(s);
    if (!codes.some((c) => code.includes(c))) continue;
    /**
     * ۵) گارد **دادهٔ آینده**: سری‌های IMF/WB پیش‌بینی هم دارند (مثل
     *    `NGDP_RPCH` تا ۲۰۳۱). نقاط جلوتر از مرجع حذف می‌شوند تا «رشد ۲۰۳۱»
     *    به‌عنوان دادهٔ امروز رسم نشود.
     */
    const pts = pointsWithDates(s).filter(
      (p) => !Number.isFinite(refRank) || rankOfQuarter(p.date) <= refRank + 2,
    );
    if (pts.length < minPoints) continue;
    const last = pts[pts.length - 1]!;
    if (Number.isFinite(refRank) && refRank - rankOfQuarter(last.date) > GROWTH_MAX_STALE_QUARTERS) {
      continue;
    }
    if (!best || pts.length > best.points.length) best = { points: pts, id: s.id };
  }
  return best;
}

/** سطح زنجیره‌شده از نرخ‌های فصلی (٪) ⇒ ایندکس (پایه = ۱۰۰ در اولین نقطه). */
export function chainIndex(qoq: GrowthPoint[]): GrowthPoint[] {
  let lvl = 100;
  const out: GrowthPoint[] = [];
  for (const p of qoq) {
    lvl = lvl * (1 + p.value / 100);
    out.push({ date: p.date, value: lvl });
  }
  return out;
}

/** YoY از ایندکس سطح (٪) — نسبت به همان فصل سال قبل (۴ نقطه قبل). */
export function yoyFromIndex(idx: GrowthPoint[]): GrowthPoint[] {
  const out: GrowthPoint[] = [];
  for (let i = 4; i < idx.length; i++) {
    const prev = idx[i - 4]!;
    if (prev.value === 0) continue;
    out.push({ date: idx[i]!.date, value: (idx[i]!.value / prev.value - 1) * 100 });
  }
  return out;
}

/** QoQ از ایندکس سطح (٪). */
export function qoqFromIndex(idx: GrowthPoint[]): GrowthPoint[] {
  const out: GrowthPoint[] = [];
  for (let i = 1; i < idx.length; i++) {
    const prev = idx[i - 1]!;
    if (prev.value === 0) continue;
    out.push({ date: idx[i]!.date, value: (idx[i]!.value / prev.value - 1) * 100 });
  }
  return out;
}

/** نرخ فصلی ⇒ نرخ سالانه‌شده (SAAR): ((1+q/100)^4 − 1)×100. */
export function qoqSaar(qoqPct: number): number {
  return ((1 + qoqPct / 100) ** 4 - 1) * 100;
}

/** خروجی انتخاب سری‌ها برای یک کشور. */
export interface GrowthPick {
  /** خط اصلی: رشد سالانه (٪) */
  yoy: GrowthPoint[];
  /** خط دوم: رشد فصلی **سالانه‌شده** (٪ SAAR) */
  qoqSaar: GrowthPoint[];
  /** مبدأ هر خط: `raw` = سری منتشرشده · `derived` = مشتق از سری دیگر · `none` = بی‌داده */
  yoyOrigin: "raw" | "derived" | "none";
  qoqOrigin: "raw" | "derived" | "none";
  /** شناسهٔ سری‌های استفاده‌شده (شفافیت در tooltip) */
  sources: string[];
  /**
   * کادنس دادهٔ خط اصلی: `Q` = فصلی · `A` = **سالانه** (fallback برای کشورهایی
   * که سری فصلی‌شان ناقص است مثل SAU/CAN/GBR/KOR) ⇒ محور زمان و `futureMargin`
   * چارت باید بر همین اساس تنظیم شود.
   */
  cadence: "Q" | "A";
  /** `true` ⇒ خط اصلی از سری **سالانه** آمده (شونده در ردیف توضیحات) */
  annualFallback: boolean;
}

/**
 * انتخاب خطوط چارت رشد با اولویت و مشتق‌گیری **مستند**:
 *   ۱) YoY خام (`GDP_VPV_YOY` / `GDP_YOY`)
 *   ۲) در نبود آن: YoY از سطح (`GDPC1`) یا از زنجیرهٔ QoQ
 *   ۳) QoQ خام (`GDP_VPV_QOQ` / `GDP_CLV_PCH_SM`)، سپس QoQ از سطح
 */
export function pickGrowthSeries<T extends SeriesLike>(
  series: T[],
  country: string,
  refDate: string,
): GrowthPick {
  const refRank = rankOfQuarter(refDate);
  const yoyRaw = pickSeries(series, YOY_CODES, country, refRank);
  const qoqRaw = pickSeries(series, QOQ_CODES, country, refRank);
  const levelRaw = pickSeries(series, LEVEL_CODES, country, refRank);
  const sources: string[] = [];

  let yoy = yoyRaw?.points ?? [];
  let yoyOrigin: GrowthPick["yoyOrigin"] = yoyRaw ? "raw" : "none";
  if (yoyRaw) sources.push(yoyRaw.id);

  let qoq = qoqRaw?.points ?? [];
  let qoqOrigin: GrowthPick["qoqOrigin"] = qoqRaw ? "raw" : "none";
  if (qoqRaw) sources.push(qoqRaw.id);

  // ایندکس سطح: FRED GDPC1 یا زنجیرهٔ QoQ خام
  let level: GrowthPoint[] = levelRaw?.points ?? [];
  if (levelRaw) sources.push(levelRaw.id);
  else if (qoqRaw) level = chainIndex(qoqRaw.points);

  if (yoyOrigin === "none" && level.length >= GROWTH_MIN_POINTS + 4) {
    yoy = yoyFromIndex(level);
    yoyOrigin = "derived";
  }
  if (qoqOrigin === "none" && level.length >= GROWTH_MIN_POINTS) {
    qoq = qoqFromIndex(level);
    qoqOrigin = "derived";
  }

  /**
   * **پلهٔ آخر: سری سالانه.** برای کشورهایی که سری فصلی‌شان (۱ نقطه) و سطح
   * هم ندارند (SAU/CAN/GBR/KOR)، رشد سالانهٔ واقعی World Bank رسم می‌شود تا
   * چارت «بی‌داده» نماند. کادنس چارت هم `A` می‌شود (محور/فضای آیندهٔ سالانه).
   */
  let annualFallback = false;
  if (yoy.length < GROWTH_DISPLAY_MIN_POINTS) {
    const annual = pickSeries(series, ANNUAL_CODES, country, refRank);
    if (annual) {
      yoy = annual.points;
      yoyOrigin = "raw";
      annualFallback = true;
      if (!sources.includes(annual.id)) sources.push(annual.id);
      // QoQ سالانه معنا ندارد ⇒ خط دوم رسم نمی‌شود (نه صفر ساختگی)
      qoq = [];
      qoqOrigin = "none";
    }
  }
  return {
    yoy,
    qoqSaar: qoq.map((p) => ({ date: p.date, value: qoqSaar(p.value) })),
    yoyOrigin,
    qoqOrigin,
    sources,
    cadence: annualFallback ? "A" : "Q",
    annualFallback,
  };
}
