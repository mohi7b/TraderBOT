/**
 * ============================================================
 * Chart Signals — کتابخانهٔ سیگنال‌های داده‌محور
 * frontend/lib/chart/signals.ts
 * ============================================================
 * هر سیگنال یک تابع **خالص** است: `(ctx) => ChartSignal | null`.
 * هیچ‌کدام ظاهر/رنگ هاردکد ندارند؛ فقط `tone` برمی‌گردانند و رنگ
 * tone از تم گرفته می‌شود (`signalPos`/`signalNeg`/…).
 *
 * کتابخانهٔ داخلی:
 *   trend · momentum · deviation · volatility · pressure ·
 *   divergence (Core vs Headline) · reversal · stability
 *
 * افزودن سیگنال جدید = یک ورودی در `SIGNAL_LIBRARY` (بدون تغییر چارت).
 * ============================================================
 */
import type {
  ChartPoint,
  ChartSeriesInput,
  ChartSignal,
  SignalBias,
  SignalContext,
  SignalTone,
} from "./types";

// ------------------------------------------------------------------
// ابزارهای آماری (خالص)
// ------------------------------------------------------------------
function values(points?: ChartPoint[]): number[] {
  return (points ?? []).map((p) => p.value).filter((v) => Number.isFinite(v));
}

/**
 * ⚠️ **D11 (A2-2):** آمار مشترک (`mean/stdev/slope/round/clamp`) از AL می‌آید
 * (`lib/analysis/signals/compute/stats.ts`) ⇒ یک ریاضی برای ماکرو و بازار.
 * تعریف‌ها عیناً حفظ شده‌اند (σ نمونه‌ای) تا رفتار سیگنال‌های ماکرو تغییر نکند.
 */
import { clamp, mean, round, slope, stdev } from "@/lib/analysis/signals/compute/stats";

/**
 * tone **آگاه به قرارداد جهت دامنه**: «بالا» برای تورم نامطلوب است،
 * برای سری‌های عمومی مطلوب. (رنگ همیشه از تم می‌آید.)
 */
function toneOfDir(v: number, eps: number, bias: SignalBias = "up-is-good"): SignalTone {
  if (!Number.isFinite(v)) return "neutral";
  if (v > eps) return bias === "up-is-bad" ? "neg" : "pos";
  if (v < -eps) return bias === "up-is-bad" ? "pos" : "neg";
  return "neutral";
}

/** زمینهٔ لازم برای رنگِ «حرکت» (جهت) — شامل هدف و قرارداد دامنه. */
interface MoveToneCtx {
  bias?: SignalBias;
  target?: { low: number | null; high: number | null } | null;
  last: number;
}

/**
 * tone **حرکت** با آگاهی از دامنهٔ هدف — «مطلوب» = حرکت به سمت هدف:
 *   • بالای سقف هدف ⇒ نزول مطلوب (pos)، صعود نامطلوب (neg)
 *   • زیر کف هدف   ⇒ صعود مطلوب (pos)، نزول نامطلوب (neg) ← ریسک رکود/تورم منفی
 *   • داخل دامنهٔ هدف ⇒ جهت بی‌طرف (neutral)
 * بدون دامنهٔ هدف ⇒ قرارداد `bias` (تورم: صعود نامطلوب).
 */
function toneOfMove(v: number, eps: number, c: MoveToneCtx): SignalTone {
  if (!Number.isFinite(v)) return "neutral";
  const up = v > eps;
  const down = v < -eps;
  if (!up && !down) return "neutral";
  const hi = c.target?.high ?? null;
  const lo = c.target?.low ?? null;
  if (hi !== null && c.last > hi) return down ? "pos" : "neg";
  if (lo !== null && c.last < lo) return up ? "pos" : "neg";
  if (hi !== null || lo !== null) return "neutral"; // داخل دامنهٔ هدف
  return up ? (c.bias === "up-is-bad" ? "neg" : "pos") : c.bias === "up-is-bad" ? "pos" : "neg";
}

/** گلیف جهت — یک منبع مشترک برای نمایش «▲ up / ▼ down / ■ flat». */
export function dirGlyph(dir: "up" | "down" | "flat"): string {
  return dir === "up" ? "▲ up" : dir === "down" ? "▼ down" : "■ flat";
}

export type SignalComputer = (ctx: SignalContext) => ChartSignal | null;

/** چهار سطح وضعیت تورمی ISS: سالم · هشدار · پرخطر · خطرناک */
const ISS_TONES: SignalTone[] = ["pos", "warn", "risk", "neg"];

// ------------------------------------------------------------------
// ابزارهای مشترک سیگنال‌های مرکب (ISS) — یک‌بار نوشته، چندجا استفاده
// ------------------------------------------------------------------
/** گام‌های متوالی سری (Δ). */
export function diffsOf(xs: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) out.push(xs[i]! - xs[i - 1]!);
  return out;
}

/**
 * امتیاز پایداری ۰..۱۰۰ = همان فرمول سیگنال `stability`
 * (نسبت نوسان گام‌های ۱۲دورهٔ اخیر به نوسان کل سری).
 */
export function stabilityScore(xs: number[]): number {
  if (xs.length < 8) return Number.NaN;
  const d = diffsOf(xs);
  const v12 = stdev(d.slice(-12));
  const vall = stdev(d) || 1e-9;
  return clamp(100 - (v12 / vall) * 60, 0, 100);
}

/**
 * احتمال بازگشت ۰..۹۵٪ = همان هیوریستیک سیگنال `reversal`
 * (|z| نسبت به میانگین ۱۲دوره + ناهم‌راستایی شیب ۶دوره با گام اخیر).
 */
export function reversalProbability(xs: number[]): number {
  if (xs.length < 12) return Number.NaN;
  const win = xs.slice(-12);
  const m = mean(win);
  const sd = stdev(win) || 1e-9;
  const last = xs[xs.length - 1]!;
  const z = Math.abs((last - m) / sd);
  const sl6 = slope(xs, 6);
  const signFlip = Math.sign(sl6) !== Math.sign(last - xs[xs.length - 7]!);
  return clamp(10 + z * 22 + (signFlip ? 12 : 0), 0, 95);
}

/**
 * نوسان «گام‌های» ۱۲دورهٔ اخیر (σ(Δ12)) — مقیاس طبیعی نویز سری.
 * این تنها منبع سنجش نویز است تا همهٔ سیگنال‌ها هم‌مقیاس بمانند.
 */
export function stepNoise(xs: number[]): number {
  const d = diffsOf(xs);
  return stdev(d.slice(-12)) || 1e-9;
}

/** نتیجهٔ سنجش جهت اخیر سری. */
export interface RecentDirection {
  dir: "up" | "down" | "flat";
  /** امتیاز جهت‌محور = میانگین وزندار Δ1 (وزن ۲) و Δ3 (وزن ۱) */
  score: number;
  /** آستانهٔ «افقی» (بر پایهٔ نویز واقعی گام‌ها) */
  eps: number;
  /** شدت مومنتوم = میانگین |Δ1| و |Δ3| */
  mag: number;
  d1: number;
  d3: number;
  sdStep: number;
}

/**
 * جهت اخیر سری — **یک منبع حقیقت** برای سیگنال «روند» و «ISS» تا هرگز
 * ناهمخوان نشوند (مشکل قبلی: روند از slope سه‌نقطه‌ای می‌آمد و با ISS
 * اختلاف پیدا می‌کرد).
 *
 *   d1 = آخرین − دورهٔ قبل            (وزن ۲ — تازه‌ترین اطلاعات)
 *   d3 = آخرین − دورهٔ سه‌قبل         (وزن ۱)
 *   score = (2·d1 + d3) / 3
 *   eps   = max(0.02, σ(Δ12) × 0.35)  ← آستانه از نویز واقعی سری
 */
export function recentDirection(xs: number[]): RecentDirection | null {
  if (xs.length < 4) return null;
  const n = xs.length;
  const d1 = xs[n - 1]! - xs[n - 2]!;
  const d3 = xs[n - 1]! - xs[n - 4]!;
  const sdStep = stepNoise(xs);
  const score = (2 * d1 + d3) / 3;
  const eps = Math.max(0.02, sdStep * 0.35);
  const dir: RecentDirection["dir"] = score > eps ? "up" : score < -eps ? "down" : "flat";
  return { dir, score, eps, mag: (Math.abs(d1) + Math.abs(d3)) / 2, d1, d3, sdStep };
}

/** فاصلهٔ Core − Headline در آخرین دورهٔ مشترک (اگر سری دوم باند). */
export function coreHeadGap(
  primary?: ChartSeriesInput,
  secondary?: ChartSeriesInput,
): number {
  const a = values(primary?.points);
  const b = values(secondary?.points);
  if (a.length < 2 || b.length < 2) return 0;
  const lastT = primary?.points?.[primary.points.length - 1]?.t;
  const byT = new Map((secondary?.points ?? []).map((p) => [p.t, p.value]));
  const lastA = a[a.length - 1]!;
  const lastB = lastT !== undefined && byT.has(lastT) ? byT.get(lastT)! : b[b.length - 1]!;
  return lastA - lastB;
}


// ------------------------------------------------------------------
// کتابخانهٔ سیگنال‌ها
// ------------------------------------------------------------------
export const SIGNAL_LIBRARY: Record<string, { label: string; compute: SignalComputer }> = {
  // ---- ۱) Trend Arrow: جهت اخیر سری (همان مبنای ISS) ----
  /**
   * جهت = میانگین وزندار Δ1 (وزن ۲) و Δ3 (وزن ۱) با آستانهٔ برگرفته از
   * نویز واقعی گام‌ها ⇒ برخلاف شیب سه‌نقطه‌ای، با یک افت/جهش میانی سوییچ نمی‌کند.
   * رنگ: با `bias="up-is-bad"` (تورم) صعود = نامطلوب/قرمز و نزول = مطلوب/سبز.
   */
  trend: {
    label: "Trend",
    compute: ({ primary, bias, target }) => {
      const xs = values(primary?.points);
      const dir = recentDirection(xs);
      if (!dir) return null;
      return {
        id: "trend",
        label: "Trend",
        display: dirGlyph(dir.dir),
        value: round(dir.score, 3),
        tone: toneOfMove(dir.score, dir.eps, { bias, target, last: xs[xs.length - 1]! }),
        hint:
          `Δ1=${round(dir.d1)} · Δ3=${round(dir.d3)} · امتیاز=${round(dir.score, 3)}` +
          ` (آستانه=${round(dir.eps, 3)}) · slope6=${round(slope(xs, 6), 3)}`,
      };
    },
  },

  // ---- ۲) Momentum: تغییر نسبت به ۱ و ۳ دوره قبل ----
  momentum: {
    label: "Momentum",
    compute: ({ primary, bias, target }) => {
      const xs = values(primary?.points);
      if (xs.length < 4) return null;
      const last = xs[xs.length - 1]!;
      const m1 = last - xs[xs.length - 2]!;
      const m3 = last - xs[xs.length - 4]!;
      return {
        id: "momentum",
        label: "Mom",
        display: `${m1 >= 0 ? "+" : ""}${round(m1)}`,
        value: round(m1, 3),
        tone: toneOfMove(m1, 0.01, { bias, target, last }),
        hint: `Δ1=${round(m1)} · Δ3=${round(m3)}`,
      };
    },
  },

  // ---- ۳) Deviation: فاصله از میانگین ۱۲دوره‌ای (σ) ----
  deviation: {
    label: "Deviation",
    compute: ({ primary, bias }) => {
      const xs = values(primary?.points);
      if (xs.length < 6) return null;
      const win = xs.slice(-12);
      const m = mean(win);
      const sd = stdev(win) || 1e-9;
      const z = (xs[xs.length - 1]! - m) / sd;
      return {
        id: "deviation",
        label: "Dev",
        display: `${z >= 0 ? "+" : ""}${round(z, 1)}σ`,
        value: round(z, 3),
        tone: toneOfDir(z, 0.5, bias),
        hint: `mean12=${round(m)} · σ=${round(sd)}`,
      };
    },
  },

  // ---- ۴) Volatility: انحراف معیار گام‌ها + هشدار نوسان ----
  volatility: {
    label: "Volatility",
    compute: ({ primary }) => {
      const xs = values(primary?.points);
      if (xs.length < 6) return null;
      const diffs: number[] = [];
      for (let i = 1; i < xs.length; i++) diffs.push(xs[i]! - xs[i - 1]!);
      const vol = stdev(diffs.slice(-12));
      const hist = stdev(diffs);
      const ratio = hist > 0 ? vol / hist : 1;
      const hot = ratio > 1.3; // آستانهٔ یکسان برای نشانگر ⚠ و رنگ (هم‌خوانی بصری)
      return {
        id: "volatility",
        label: "Vol",
        display: `${round(vol)}${hot ? " ⚠" : ""}`,
        value: round(vol, 3),
        tone: hot ? "warn" : "info",
        hint: `σ(Δ12)=${round(vol)} · σ(Δall)=${round(hist)} · ratio=${round(ratio)}`,
      };
    },
  },
  // ---- ۵) Pressure: امتیاز فشرده ۰..۱۰۰ (انحراف + جهت) ----
  pressure: {
    label: "Pressure",
    compute: ({ primary }) => {
      const xs = values(primary?.points);
      if (xs.length < 12) return null;
      const win = xs.slice(-12);
      const m = mean(win);
      const sd = stdev(win) || 1e-9;
      const last = xs[xs.length - 1]!;
      const z = clamp((last - m) / sd, -2, 2);
      const dir = recentDirection(xs);
      if (!dir) return null;
      // جهت از همان تابع مشترک (Δ1/Δ3) ⇒ هم‌خوان با سیگنال «روند»
      const score = clamp(50 + z * 20 + clamp(dir.score / sd, -1, 1) * 15, 0, 100);
      return {
        id: "pressure",
        label: "Pressure",
        display: `${round(score, 0)}`,
        value: round(score, 1),
        tone: score > 65 ? "warn" : score < 35 ? "info" : "neutral",
        hint: `z=${round(z)} · جهت=${round(dir.score, 3)} ⇒ فشار ۰..۱۰۰`,
      };
    },
  },

  // ---- ۶) Core vs Headline Divergence ----
  divergence: {
    label: "Divergence",
    compute: ({ primary, secondary, bias }) => {
      const a = values(primary?.points);
      const b = values(secondary?.points);
      if (a.length < 2 || b.length < 2) return null;
      const lastT = primary?.points?.[primary.points.length - 1]?.t;
      const byT = new Map((secondary?.points ?? []).map((p) => [p.t, p.value]));
      const lastA = a[a.length - 1]!;
      const lastB = lastT !== undefined && byT.has(lastT) ? byT.get(lastT)! : b[b.length - 1]!;
      const diff = lastA - lastB;
      return {
        id: "divergence",
        label: "Core−Head",
        display: `${diff >= 0 ? "+" : ""}${round(diff)}`,
        value: round(diff, 3),
        tone: toneOfDir(diff, 0.05, bias),
        hint: `headline=${round(lastA)} · core=${round(lastB)} · gap=${round(diff)}`,
      };
    },
  },

  // ---- ۷) Reversal Probability (هیوریستیک شفاف و مستند) ----
  reversal: {
    label: "Reversal",
    compute: ({ primary }) => {
      const xs = values(primary?.points);
      if (xs.length < 12) return null;
      const win = xs.slice(-12);
      const m = mean(win);
      const sd = stdev(win) || 1e-9;
      const last = xs[xs.length - 1]!;
      const z = Math.abs((last - m) / sd);
      const sl6 = slope(xs, 6);
      const p = reversalProbability(xs); // فرمول مشترک (همان ورودی)
      return {
        id: "reversal",
        label: "Reversal",
        display: `${round(p, 0)}%`,
        value: round(p, 1),
        tone: p > 60 ? "warn" : "info",
        hint: `|z|=${round(z)} · slope6=${round(sl6)} ⇒ احتمال بازگشت (هیوریستیک)`,
      };
    },
  },

  // ---- ۸) Stability Score: پایداری ۰..۱۰۰ ----
  stability: {
    label: "Stability",
    compute: ({ primary }) => {
      const xs = values(primary?.points);
      if (xs.length < 8) return null;
      const diffs = diffsOf(xs);
      const v12 = stdev(diffs.slice(-12));
      const vall = stdev(diffs) || 1e-9;
      const score = stabilityScore(xs); // فرمول مشترک (همان ورودی)
      return {
        id: "stability",
        label: "Stability",
        display: `${round(score, 0)}`,
        value: round(score, 1),
        tone: score > 65 ? "pos" : score < 35 ? "neg" : "neutral",
        hint: `σ(Δ12)/σ(Δall)=${round(v12 / vall)} ⇒ پایداری ۰..۱۰۰`,
      };
    },
  },

  // ---- ۹) ISS — Integrated Inflation Signal (سیگنال جامع تورمی) ----
  /**
   * ISS = **رنگ (وضعیت تورمی)** + **فلش جامع** + **درصد پایداری**.
   *
   * فلش جامع از چهار مؤلفه ساخته می‌شود (`display` فقط فلش + درصد است):
   *   ۱) جهت  : بالا/پایین/افقی — از Δ1 و Δ3
   *   ۲) زاویه: عمودی (مومنتوم قوی) · مورب (مومنتوم ضعیف) · افقی (≈صفر)
   *   ۳) تعداد: ۱..۳ فلش بر پایهٔ **شدت شیب** (میانگین |slope3| و |slope6|
   *             نسبت به مقیاس طبیعی گام‌های سری)
   *   ۴) ضخامت (فشار): ۱=نازک … ۳=ضخیم — از ترکیب نوسان (CV گام‌ها)،
   *      انحراف از میانگین ۱۲دوره (|z|) و شکاف Core−Headline
   *
   * درصد = **پایداری روند** (۰..۱۰۰):
   *   `0.6 × stability + 0.4 × (100 − reversal)`  → ۱۰۰ = پایدار و قابل‌اعتماد
   *
   * رنگ = **وضعیت کلی تورم** (۴ سطح):
   *   سبز `pos` = سالم · زرد `warn` = هشدار · نارنجی `risk` = پرخطر · قرمز `neg` = خطرناک
   *   قاعده (شفاف و قابل‌توضیح): فاصلهٔ فراتر از دامنهٔ هدف ⇒
   *   `≤۰٫۵pp` سالم · `≤۱٫۵pp` هشدار · `≤۳pp` پرخطر · `>۳pp` خطرناک
   *   و اگر فشار ≥۰٫۶۷ یا احتمال بازگشت ≥۶۰٪ باشد، **یک پله ارتقا** (هشدار زودهنگام).
   *   بدون دامنهٔ هدف: مقیاس |z| با برش‌های ۰٫۷۵ / ۱٫۵ / ۲٫۲۵.
   *   دامنهٔ هدف از `ChartSignalsConfig.target` (پراپ `signals={{ target }}`) تزریق می‌شود.
   *
   * نمونهٔ خروجی بج: `↘↘ 39%` با رنگ قرمز و ضخامت متناسب فشار.
   */
  iss: {
    label: "Iss", // برچسب کوتاه هم‌شکل بقیهٔ سیگنال‌ها
    compute: ({ primary, secondary, target, bias }) => {
      const xs = values(primary?.points);
      if (xs.length < 13) return null;
      const n = xs.length;
      const last = xs[n - 1]!;
      const sl3 = slope(xs, 3);
      const sl6 = slope(xs, 6);
      const win12 = xs.slice(-12);
      const m12 = mean(win12);
      const sd12 = stdev(win12) || 1e-9;
      const z = (last - m12) / sd12;

      // ۱+۲) جهت و زاویه — از **همان تابع مشترک** سیگنال «روند» (هرگز ناهمخوان نمی‌شوند)
      const dir = recentDirection(xs);
      if (!dir) return null;
      const vertical = dir.mag >= Math.max(0.15, dir.sdStep); // مومنتوم قوی ⇒ فلش عمودی
      const arrow =
        dir.dir === "flat" ? "→" : dir.dir === "up" ? (vertical ? "↑" : "↗") : vertical ? "↓" : "↘";
      const strength = dir.dir === "flat" ? "flat" : vertical ? "strong" : "weak";

      // ۳) شدت شیب ⇒ تعداد فلش (۱..۳)
      const slopeScale = Math.max(0.03, dir.sdStep * 0.5);
      const slopeIntensity = (Math.abs(sl3) + Math.abs(sl6)) / 2 / slopeScale;
      const count = slopeIntensity < 0.6 ? 1 : slopeIntensity < 1.6 ? 2 : 3;

      // ۴) فشار ⇒ ضخامت (۱..۳)
      // ⚠️ شکاف Core−Headline باید **هم‌مقیاس** باشد: برای سری‌های نرخ، واحد
      //    درصد است؛ برای سری‌های «سطح شاخص» (مقادیر بزرگ مثل ۱۳۰) نسبی می‌شود.
      const rawGap = coreHeadGap(primary, secondary);
      const gap = Math.abs(m12) > 50 ? (rawGap / Math.abs(m12)) * 100 : rawGap;
      const volCv = dir.sdStep / Math.max(0.05, Math.abs(m12));
      const pressure = clamp(
        0.45 * clamp(volCv / 0.25, 0, 1) +
          0.35 * clamp(Math.abs(z) / 1.6, 0, 1) +
          0.2 * clamp(Math.abs(gap) / 1.0, 0, 1),
        0,
        1,
      );
      const weight: 1 | 2 | 3 = pressure < 0.34 ? 1 : pressure < 0.67 ? 2 : 3;

      // درصد = پایداری روند
      const stab = stabilityScore(xs);
      const rev = reversalProbability(xs);
      const pct = Math.round(clamp(0.6 * stab + 0.4 * (100 - rev), 0, 100));

      // رنگ = وضعیت کلی تورم (۴ سطح): سبز سالم · زرد هشدار · نارنجی پرخطر · قرمز خطرناک
      // معیار اصلی: **فاصلهٔ فراتر از دامنهٔ هدف** (واحد درصد) — همان چیزی که بازار
      // و بانک مرکزی می‌خوانند. بدون دامنهٔ هدف: مقیاس |z| (انحراف از میانگین ۱۲دوره).
      const hasTarget = Boolean(target && (target.low !== null || target.high !== null));
      const hi = target?.high ?? null;
      const lo = target?.low ?? null;
      const over = hasTarget
        ? Math.max(
            hi !== null ? Math.max(0, last - hi) : 0,
            lo !== null ? Math.max(0, lo - last) : 0,
          )
        : Math.abs(z);
      const cuts = hasTarget ? [0.5, 1.5, 3] : [0.75, 1.5, 2.25];
      let level = over <= cuts[0]! ? 0 : over <= cuts[1]! ? 1 : over <= cuts[2]! ? 2 : 3;
      // فشار یا احتمال بازگشت بالا ⇒ یک پله ارتقا (هشدار زودهنگام)
      const escalated = level < 3 && (pressure >= 0.67 || rev >= 60);
      if (escalated) level += 1;
      const tone = ISS_TONES[level]!;
      /**
       * رنگ **متن مقدار** = همان منطق سه‌حالتهٔ سیگنال «روند»
       * (بالای هدف: نزول سبز/صعود قرمز · زیر هدف: برعکس · داخل هدف: خنثی).
       * پس‌زمینه (tone) همان ۴ سطح وضعیت تورمی است ⇒ بج دو لایهٔ معنایی دارد.
       */
      const moveTone = toneOfMove(dir.score, dir.eps, { bias, target, last });

      return {
        id: "iss",
        label: "Iss",
        weight,
        valueTone: moveTone,
        fill: true,
        display: `${arrow.repeat(count)} ${pct}%`,
        value: pct,
        tone,
        hint:
          `ISS · ${arrow}×${count} (${strength}) · فشار=${round(pressure)} (ضخامت ${weight}) · ` +
          `پایداری=${pct}% · ` +
          (hasTarget
            ? `فاصله از هدف=${round(over)}pp · سطح ${level}`
            : `|z|=${round(over)} (بدون هدف) · سطح ${level}`) +
          (escalated ? " · یک پله ارتقا (فشار/بازگشت بالا)" : "") +
          ` · رنگ متن مقدار=${moveTone} (منطق روند) · z=${round(z)} · gap=${round(gap)}`,
      };
    },
  },

};

// ------------------------------------------------------------------
// آستانه‌های سیگنال‌های «نرخ بهرهٔ واقعی» و «بازدهی ۱۰ساله»
// ------------------------------------------------------------------
// ⚠️ این دو سیگنال **در چارت «Policy Rate vs CPI»** نمایش داده می‌شوند و
//    چون سری‌شان (نرخ سیاستی/بازدهی) داخل آن چارت رسم می‌شود، طبق الگوی
//    PAS **در دامنه** ساخته می‌شوند: `lib/macro/macroSignals.ts`
//    (`realRateSignal` · `yield10ySignal`) و به‌صورت `signals.custom` تزریق
//    می‌شوند. این‌جا فقط **آستانه + تُن** (منبع حقیقت رنگ) می‌ماند تا موتور و
//    دامنه یک تعریف مشترک داشته باشند.
/**
 * آستانه‌های **RealRate** (نرخ بهرهٔ واقعی = نرخ سیاستی − تورم کل، ٪):
 *   🟥 `real < −3.0`         ⇒ سیاست **فوق‌انبساطی** (`neg`)
 *   🟨 `−3.0 ≤ real < −0.5`  ⇒ **انبساطی**             (`warn`)
 *   ⚪ `|real| ≤ 0.5`         ⇒ **خنثی**                (`neutral`)
 *   🟩 `real > +0.5`         ⇒ **انقباضیِ واقعی**       (`pos`)
 */
export const REAL_RATE_BANDS = {
  superExpansionary: -3.0,
  expansionary: -0.5,
  neutralBand: 0.5,
} as const;

/**
 * آستانه‌های **Yield10Y** (بازدهی اوراق دولتی ۱۰ساله، ٪):
 *   🟩 `y < 2.0`      ⇒ شرایط مالی **آسان** (`pos`)
 *   ⚪ `2.0 ≤ y < 3.5`  ⇒ **خنثی** (`neutral`)
 *   🟨 `3.5 ≤ y < 5.0`  ⇒ شرایط مالی **سخت** (`warn`)
 *   🟥 `y ≥ 5.0`       ⇒ **فشار بر بازارهای مالی / ریسک رکود** (`neg`)
 */
export const YIELD_10Y_BANDS = {
  low: 2.0,
  neutralHigh: 3.5,
  tightHigh: 5.0,
} as const;

/** تُن چهارسطحی نرخ بهرهٔ واقعی (منفیِ زیاد ⇒ قرمز … مثبت ⇒ سبز). */
export function realRateTone(real: number): SignalTone {
  if (!Number.isFinite(real)) return "neutral";
  if (real < REAL_RATE_BANDS.superExpansionary) return "neg";
  if (real < REAL_RATE_BANDS.expansionary) return "warn";
  if (real <= REAL_RATE_BANDS.neutralBand) return "neutral";
  return "pos";
}

/** تُن چهارسطحی بازدهی ۱۰ساله (بالا ⇒ قرمز … پایین ⇒ سبز). */
export function yield10yTone(y: number): SignalTone {
  if (!Number.isFinite(y)) return "neutral";
  if (y >= YIELD_10Y_BANDS.tightHigh) return "neg";
  if (y >= YIELD_10Y_BANDS.neutralHigh) return "warn";
  if (y >= YIELD_10Y_BANDS.low) return "neutral";
  return "pos";
}

export const SIGNAL_IDS = Object.keys(SIGNAL_LIBRARY);

/** سیگنال‌های پیشنهادی برای چارت‌های تورمی/اقتصادی. */
export const DEFAULT_INFLATION_SIGNALS = [
  "trend", "momentum", "deviation", "volatility",
  "pressure", "divergence", "reversal", "stability",
];

/**
 * محاسبهٔ سیگنال‌ها از شناسه‌ها + سیگنال‌های سفارشی دامنه.
 * سیگنال ناموجود یا بی‌داده حذف می‌شود (هیچ خانهٔ خالی رسم نمی‌شود).
 */
export function computeSignals(
  ids: string[],
  ctx: SignalContext,
  custom?: ChartSignal[],
): ChartSignal[] {
  const out: ChartSignal[] = [];
  for (const id of ids) {
    const entry = SIGNAL_LIBRARY[id];
    if (!entry) continue;
    try {
      const s = entry.compute(ctx);
      if (s) out.push(s);
    } catch {
      /* یک سیگنال خراب، چارت را نمی‌شکند */
    }
  }
  if (custom?.length) out.push(...custom);
  return out;
}

