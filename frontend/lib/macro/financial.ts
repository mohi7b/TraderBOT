/**
 * هستهٔ خالص چارت «شرایط مالی» (Financial Conditions) — FAS و سیگنال‌های مالی.
 * frontend/lib/macro/financial.ts
 * ============================================================
 * طبق پرامپت کاربر (2026-09-23) — **ساختار عیناً مثل PAS/GAS**:
 *   · `FAS` (بج اصلی، `fill`) = پس‌زمینه از **FCI** (۴ سطح) · فلش از جهت
 *     `ΔY10 + ΔCredit` · زاویه از بزرگی همان · تعداد از |FCI| · رنگ متن از
 *     وضعیت · مقدار = **Hardness% = normalize(FCI)**.
 *   · شش سیگنال فرعی `Y10 · Credit · DXY · Equity · Liquidity · Vol`
 *     (بدون پس‌زمینه، بدون شدت، فلش مثلثی + رنگ متن + مقدار).
 *
 * **ورودی‌ها و اینکه کشوری‌اند یا جهانی:**
 * | سیگنال | سری | دامنه |
 * |---|---|---|
 * | `Y10` | `YIELD_10Y` | **کشوری** (۱۲ از ۱۷ کشور) |
 * | `Credit` | `BAMLC0A0CM` (اسپرد IG آمریکا) | **جهانی** |
 * | `DXY` | `DTWEXBGS` (دلار مؤثر) | **جهانی** |
 * | `Equity` | `SP500` | **جهانی** |
 * | `Liquidity` | `M2SL` (M2 آمریکا) → YoY | **جهانی** |
 * | `Vol` | `VIXCLS` | **جهانی** |
 *
 * **FCI (ترکیب استاندارد، علامت‌دار: مثبت = سخت‌تر):**
 *   `FCI = Σ wᵢ · signᵢ · norm(Δᵢ)` با وزن‌های مستند `FINANCIAL_WEIGHTS`
 *   و مقیاس هر مؤلفه `FINANCIAL_SCALES`؛ اجزای ناموجود از جمع حذف و وزن‌ها
 *   **دوباره نرمال** می‌شوند. `norm` = z-naïve (تقسیم بر مقیاس) و در بازهٔ ±۱
 *   بریده می‌شود تا یک جهش شدید، کل شاخص را نبلعد.
 *
 * **نبود داده:** هیچ مقدار ساختگی ساخته نمی‌شود و سیگنال **حذف نمی‌شود**:
 *   `مقدار = "N/A"` · `رنگ = سفید` · `فلش = ندارد` (طبق پرامپت).
 *   (تفاوت با `noDataSignal` چارت رشد که مقدارش `—` است.)
 * ============================================================
 */
import type { ChartSignal } from "@/lib/chart/types";
import { missingSignal } from "@/lib/chart/spec/missing";
import { pointsOfSeries } from "@/lib/macro/policy";

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** نقطهٔ سبک سری. */
export interface FinPoint {
  date: string;
  value: number;
}

/** آستانه/وزن‌های FCI (یک‌جا و قابل‌تنظیم — منبع حقیقت شاخص). */
export const FINANCIAL_WEIGHTS = {
  y10: 0.25,
  credit: 0.25,
  vol: 0.2,
  equity: 0.15,
  dxy: 0.075,
  liquidity: 0.075,
} as const;

/**
 * مقیاس هر مؤلفه برای نرمال‌سازی (تغییرِ «معنادار»):
 * مثلاً ۰٫۵ واحد درصد تغییر در بازدهی ۱۰ساله یا اسپرد اعتباری، ۵٪ در سهام/دلار،
 * ۱۰٪ در VIX و ۱ واحد درصد در رشد نقدینگی.
 */
export const FINANCIAL_SCALES = {
  y10: 0.5,
  credit: 0.5,
  dxy: 5,
  equity: 5,
  liquidity: 1,
  vol: 10,
} as const;

/** آستانه‌های سطح FAS (Hardness%): آسان · کمی‌سخت · سخت · بسیار‌سخت. */
export const FINANCIAL_LEVELS = { easy: 0.25, mild: 0.5, hard: 0.75 } as const;

/** نگاشت سطح ۰..۳ (سبز→قرمز) به تُن — همان نردبان شهریور. */
export const FCI_TONE: Record<number, ChartSignal["tone"]> = {
  0: "pos",
  1: "warn",
  2: "risk",
  3: "neg",
};

/** حداقل فاصلهٔ مجاز آخرین نقطه از مرجع (ماه) — گارد کهنگی. */
export const FIN_MAX_STALE_MONTHS = 6;
/** آستانهٔ «جهت مؤثر» روی `ΔY10 + ΔCredit` (واحد درصد). */
export const FAS_DIR_EPS = 0.15;

interface SeriesLike {
  id: string;
  country: { code: string };
  indicator?: { code?: string; provider_code?: string };
}

const rankOfMonth = (date: string): number => {
  const m = /^(\d{4})-(\d{2})/.exec(String(date ?? ""));
  return m ? Number(m[1]) * 12 + Number(m[2]) : Number.NEGATIVE_INFINITY;
};

/** بهترین سری برای یک canon (کشوری یا جهانی) — پرنقطه‌ترین سری **تازه**. */
function pickSeries<T extends SeriesLike>(
  series: T[],
  canon: string,
  country: string | null,
  refRank: number,
): FinPoint[] | null {
  const cc = country ? country.toUpperCase() : null;
  let best: FinPoint[] | null = null;
  for (const s of series) {
    /**
     * تطبیق با **همهٔ** هویت‌های سری: canon (`indicator.code` مثل `YIELD_10Y`)
     * و کد provider (`indicator.provider_code` مثل `VIXCLS`/`IRLTLT01DEM156N`)
     * و خود `id`. ⚠️ درس تکرارشدهٔ پروژه: canon و provider code همیشه یکی
     * نیستند (مثال: `FRED_USA_VIXCLS_M` با canon=`MARKET_GLOBAL`) و تطبیق
     * تنها با یکی از آن‌ها، سیگنال را بی‌داده نشان می‌دهد.
     */
    const identities = [
      s.indicator?.code,
      s.indicator?.provider_code,
      s.id,
    ]
      .filter(Boolean)
      .map((x) => String(x).toUpperCase());
    if (!identities.some((x) => x.includes(canon.toUpperCase()))) continue;
    if (cc && s.country?.code?.toUpperCase() !== cc) continue;
    const pts = pointsOfSeries(s).map((p) => ({ date: p.date, value: p.value }));
    if (pts.length < 4) continue;
    if (Number.isFinite(refRank) && refRank - rankOfMonth(pts[pts.length - 1]!.date) > FIN_MAX_STALE_MONTHS) {
      continue;
    }
    if (!best || pts.length > best.length) best = pts;
  }
  return best;
}

/** تغییر مطلق یک سری بین آخرین نقطه و `back` دورهٔ قبل (واحد = واحد سری). */
export function deltaAt(pts: FinPoint[] | null, back = 1): number | null {
  if (!pts || pts.length <= back) return null;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 1 - back]!;
  return last.value - prev.value;
}

/** تغییر درصدی یک سری (برای سری‌های شاخصی مثل DXY/SP500/VIX/M2). */
export function pctAt(pts: FinPoint[] | null, back = 1): number | null {
  if (!pts || pts.length <= back) return null;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 1 - back]!;
  return prev.value === 0 ? null : ((last.value - prev.value) / Math.abs(prev.value)) * 100;
}

/** رشد سالانه (۱۲ دوره) یک سری سطحی — برای نقدینگی (M2). */
export function yoyOfLevel(pts: FinPoint[] | null): number | null {
  return pctAt(pts, 12);
}

/**
 * پارامترهای «یادداشت منبع» (v3: به‌جای متن آمادهٔ فارسی).
 * قالب جمله از i18n می‌آید: `signals.financial.sourceNote`.
 */
export interface FinNoteParams extends Record<string, string | number> {
  country: string;
  y10Date: string;
  /** `yes`/`no` — توکن فنی (در هر دو زبان یکسان) */
  y10Available: "yes" | "no";
}

/** ورودی‌های چارت شرایط مالی برای یک کشور. */
export interface FinInputs {
  /** بازدهی ۱۰ساله (کشوری) */
  y10: FinPoint[] | null;
  /** پنج سری بازار جهانی (کشور سری = USA؛ برای همهٔ کشورها یکسان) */
  credit: FinPoint[] | null;
  dxy: FinPoint[] | null;
  equity: FinPoint[] | null;
  liquidity: FinPoint[] | null;
  vol: FinPoint[] | null;
  /** پارامترهای یادداشت منبع (برای i18n) */
  note: FinNoteParams;
}

/**
 * انتخاب ورودی‌ها: `Y10` **کشوری** و پنج شاخص **جهانی** (فیلتر کشور ندارند).
 * `refDate` = آخرین تاریخ موجود تورم/رشد کشور (مبنای گارد کهنگی).
 */
export function pickFinancialSeries<T extends SeriesLike>(
  series: T[],
  country: string,
  refDate: string,
): FinInputs {
  const refRank = rankOfMonth(refDate);
  const y10 = pickSeries(series, "YIELD_10Y", country, refRank);
  const credit = pickSeries(series, "BAMLC0A0CM", null, refRank);
  const dxy = pickSeries(series, "DTWEXBGS", null, refRank);
  const equity = pickSeries(series, "SP500", null, refRank);
  const liquidity = pickSeries(series, "M2SL", null, refRank);
  const vol = pickSeries(series, "VIXCLS", null, refRank);
  return {
    y10,
    credit,
    dxy,
    equity,
    liquidity,
    vol,
    note: {
      country: country.toUpperCase(),
      y10Date: y10 && y10.length ? y10[y10.length - 1]!.date : "—",
      y10Available: y10 ? "yes" : "no",
    },
  };
}

// ------------------------------------------------------------------
// ۲) FCI — ترکیب استاندارد شرایط مالی (مثبت = سخت‌تر)
// ------------------------------------------------------------------
/** مؤلفه‌های FCI (نرمال‌شده و در ±۱ بریده). */
export interface FciComponents {
  y10: number | null;
  credit: number | null;
  vol: number | null;
  equity: number | null;
  dxy: number | null;
  liquidity: number | null;
}

/**
 * محاسبهٔ مؤلفه‌ها با **علامتِ سخت‌شوندگی**:
 *   `+ΔY10` · `+ΔCredit` · `+ΔVol` (بالا رفتن = سخت‌تر)
 *   `−ΔEquity` · `−ΔLiquidity` · `+ΔDXY` (بالا رفتن سهام/نقدینگی = آسان‌تر)
 * میانگین **۱ و ۳ ماه** (مجموع) گرفته می‌شود تا هم تکان کوتاه‌مدت و هم روند
 * کوتاه دیده شود (مثل RMI/GMI در دو چارت قبلی). سری‌های سطحی (DXY/سهام/VIX/M2)
 * با **تغییر درصدی** و سری‌های نرخی (بازدهی/اسپرد) با **تغییر مطلق (واحد درصد)**.
 */
export function fciComponents(i: FinInputs): FciComponents {
  const n = (v: number | null, scale: number): number | null =>
    v == null || !Number.isFinite(v) ? null : clamp(v / scale, -1, 1);
  const sum = (a: number | null, b: number | null): number | null =>
    a == null || b == null ? null : a + b;

  const y10 = n(sum(deltaAt(i.y10, 1), deltaAt(i.y10, 3)), FINANCIAL_SCALES.y10);
  const credit = n(sum(deltaAt(i.credit, 1), deltaAt(i.credit, 3)), FINANCIAL_SCALES.credit);
  const vol = n(sum(pctAt(i.vol, 1), pctAt(i.vol, 3)), FINANCIAL_SCALES.vol);
  const equity = n(sum(pctAt(i.equity, 1), pctAt(i.equity, 3)), FINANCIAL_SCALES.equity);
  const dxy = n(sum(pctAt(i.dxy, 1), pctAt(i.dxy, 3)), FINANCIAL_SCALES.dxy);
  const liquidity = n(sum(pctAt(i.liquidity, 1), pctAt(i.liquidity, 3)), FINANCIAL_SCALES.liquidity);
  return {
    y10,
    credit,
    vol,
    equity: equity == null ? null : -equity,
    dxy,
    liquidity: liquidity == null ? null : -liquidity,
  };
}

/**
 * FCI = میانگین وزنی مؤلفه‌های **موجود** (وزن‌ها دوباره نرمال می‌شوند).
 * اگر هیچ مؤلفه‌ای موجود نباشد ⇒ `null` (بج FAS به حالت `N/A` می‌رود).
 */
export function fciOf(c: FciComponents): { fci: number | null; used: string[] } {
  const entries: [string, number | null, number][] = [
    ["y10", c.y10, FINANCIAL_WEIGHTS.y10],
    ["credit", c.credit, FINANCIAL_WEIGHTS.credit],
    ["vol", c.vol, FINANCIAL_WEIGHTS.vol],
    ["equity", c.equity, FINANCIAL_WEIGHTS.equity],
    ["dxy", c.dxy, FINANCIAL_WEIGHTS.dxy],
    ["liquidity", c.liquidity, FINANCIAL_WEIGHTS.liquidity],
  ];
  const used = entries.filter(([, v]) => v != null) as [string, number, number][];
  const wsum = used.reduce((a, [, , w]) => a + w, 0);
  if (!used.length || wsum <= 0) return { fci: null, used: [] };
  const fci = used.reduce((a, [, v, w]) => a + v * w, 0) / wsum;
  return { fci, used: used.map(([k]) => k) };
}

/** `Hardness%` = نرمال‌سازی FCI از (−۱..+۱) به ۰..۱۰۰ (بالا = سخت‌تر). */
export function hardnessPct(fci: number | null): number | null {
  if (fci == null || !Number.isFinite(fci)) return null;
  return Math.round(clamp((fci + 1) / 2, 0, 1) * 100);
}

/** سطح چهارگانهٔ شرایط مالی (۰ = آسان … ۳ = بسیار سخت). */
export function fciLevel(fci: number | null): 0 | 1 | 2 | 3 {
  if (fci == null || !Number.isFinite(fci)) return 1;
  const hardness = clamp((fci + 1) / 2, 0, 1);
  if (hardness >= FINANCIAL_LEVELS.hard) return 3;
  if (hardness >= FINANCIAL_LEVELS.mild) return 2;
  if (hardness >= FINANCIAL_LEVELS.easy) return 1;
  return 0;
}

// ------------------------------------------------------------------
// ۳) FAS — سیگنال اصلی (بج با پس‌زمینه، مثل PAS/GAS)
// ------------------------------------------------------------------
export type FasGlyph = "▲" | "▼" | "▷" | "↗" | "↘";

/** اجزای محاسبه‌شدهٔ FAS (همه برای tooltip شفاف). */
export interface FasParts {
  fci: number | null;
  /** ۰..۱۰۰ (بالا = سخت‌تر) */
  hardness: number | null;
  level: 0 | 1 | 2 | 3;
  direction: "up" | "down" | "flat";
  glyph: FasGlyph;
  count: 1 | 2 | 3;
  /** رنگ متن (اثر بر بازارها) */
  effectTone: ChartSignal["tone"];
  /** مجموع Δ۱+Δ۳ بازدهی و اسپرد (واحد درصد) — پایهٔ جهت/زاویه */
  deltaSum: number | null;
  components: FciComponents;
  used: string[];
}

/** تُن متن FAS از سطح شرایط مالی + جهت (۴ حالت: سبز/زرد/قرمز/سفید). */
export function fasEffectTone(
  level: 0 | 1 | 2 | 3,
  direction: FasParts["direction"],
): ChartSignal["tone"] {
  if (level === 0) return direction === "down" ? "warn" : "pos";
  if (level >= 2) return "neg";
  return direction === "down" ? "warn" : "neutral";
}

/**
 * محاسبهٔ کامل FAS:
 *   · جهت = `sign(ΔY10 + ΔCredit)` (منفی ⇒ آسان‌شدن ▲ · مثبت ⇒ سخت‌شدن ▼)
 *   · زاویه از `|ΔY10 + ΔCredit|` (زیاد ⇒ عمودی · متوسط ⇒ مورب · ~صفر ⇒ افقی)
 *   · تعداد از `|FCI|` · پس‌زمینه از سطح FCI · مقدار = `Hardness%`
 * `null` ⇒ دادهٔ کافی نیست (بج به حالت `N/A` سفید می‌رود — طبق پرامپت).
 */
export function buildFas(i: FinInputs): FasParts | null {
  const components = fciComponents(i);
  const { fci, used } = fciOf(components);
  if (fci == null) return null;
  const level = fciLevel(fci);
  const d1 = deltaAt(i.y10, 1) ?? 0;
  const d3 = deltaAt(i.y10, 3) ?? 0;
  const c1 = deltaAt(i.credit, 1);
  const c3 = deltaAt(i.credit, 3);
  const hasCredit = c1 != null && c3 != null;
  const hasY = i.y10 != null;
  const deltaSum =
    hasY || hasCredit ? (hasY ? d1 + d3 : 0) + (hasCredit ? c1 + c3 : 0) : null;

  const dirScore = deltaSum ?? 0;
  const direction: FasParts["direction"] =
    dirScore > FAS_DIR_EPS ? "down" : dirScore < -FAS_DIR_EPS ? "up" : "flat";
  const mag = Math.abs(dirScore);
  const glyph: FasGlyph =
    direction === "flat"
      ? "▷"
      : mag >= 0.6
        ? direction === "up"
          ? "▲"
          : "▼"
        : direction === "up"
          ? "↗"
          : "↘";
  const a = Math.abs(fci);
  const count: FasParts["count"] = a >= 0.6 ? 3 : a >= 0.3 ? 2 : 1;

  return {
    fci: round(fci, 3),
    hardness: hardnessPct(fci),
    level,
    direction,
    glyph,
    count,
    effectTone: fasEffectTone(level, direction),
    deltaSum: deltaSum == null ? null : round(deltaSum, 2),
    components,
    used,
  };
}

// ------------------------------------------------------------------
// ۴) بج‌های سیگنال چارت شرایط مالی (FAS + شش فرعی)
// ------------------------------------------------------------------
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${round(v, d)}`;
/** فلش جهت مقدار یک سری (صعودی/نزولی/ثابت). */
const moveArrow = (d: number | null, eps: number): string =>
  d == null ? "" : d > eps ? "▲" : d < -eps ? "▼" : "▷";
const last = (p: FinPoint[] | null): number | null =>
  p && p.length ? p[p.length - 1]!.value : null;

/** آستانه‌های «حرکت معنادار» هر مؤلفه (Δ۱) برای رنگ متن. */
export const MOVE_EPS = {
  y10: 0.1,
  credit: 0.05,
  dxy: 1,
  equity: 2,
  liquidity: 0.5,
  vol: 5,
} as const;

/**
 * سیگنال «بدون داده» با سیاست **`na`** (مقدار `N/A`) — طبق `spec/missing.ts`.
 * v3: پارامتر سوم **کلید i18n** است (هیچ متن ثابتی در دامنه نمی‌ماند).
 */
export function naSignal(
  id: string,
  label: string,
  hintKey: string,
  hintParams?: Record<string, string | number>,
): ChartSignal {
  const s = missingSignal({ policy: "na", id, label, hintKey, hintParams });
  return (
    s ?? { id, label, display: "N/A", value: null, tone: "neutral", valueTone: "neutral" }
  );
}

// ------------------------------------------------------------------
// ۵) سری زمانی FCI + سری بازدهی (برای دو خط چارت)
// ------------------------------------------------------------------
/** برش سری تا تاریخ `date` (شامل خودش). */
function sliceUntil(pts: FinPoint[] | null, date: string): FinPoint[] | null {
  if (!pts) return null;
  const out = pts.filter((p) => p.date <= date);
  return out.length ? out : null;
}

/** ورودی‌های برش‌خورده تا تاریخ مشخص (برای محاسبهٔ نقطه‌به‌نقطهٔ FCI). */
function inputsAt(i: FinInputs, date: string): FinInputs {
  return {
    y10: sliceUntil(i.y10, date),
    credit: sliceUntil(i.credit, date),
    dxy: sliceUntil(i.dxy, date),
    equity: sliceUntil(i.equity, date),
    liquidity: sliceUntil(i.liquidity, date),
    vol: sliceUntil(i.vol, date),
    note: i.note,
  };
}

/**
 * سری زمانی **FCI** برای رسم خط اصلی (آبی درخشان).
 * برای هر تاریخ مرجع (ماه‌های سری مرجع) مقادیر همین فرمول `fciOf` با دادهٔ
 * «تا آن تاریخ» حساب می‌شود (بدون نگاه به آینده — no look-ahead ✓).
 *
 * @param months تعداد ماه‌های آخر برای رسم (پیش‌فرض ۴۸ ⇒ ۴ سال، بیش از زوم ۳٫۵ سال)
 */
export function fciSeries(i: FinInputs, months = 48): FinPoint[] {
  // مرجع تاریخ: طولانی‌ترین سری ماهانهٔ موجود (معمولاً VIX یا M2)
  const refs = [i.vol, i.credit, i.equity, i.dxy, i.liquidity, i.y10].filter(
    (p): p is FinPoint[] => !!p && p.length > 0,
  );
  if (!refs.length) return [];
  const ref = refs.reduce((a, b) => (b.length > a.length ? b : a));
  const dates = ref.slice(-months).map((p) => p.date);
  const out: FinPoint[] = [];
  for (const d of dates) {
    const { fci } = fciOf(fciComponents(inputsAt(i, d)));
    if (fci != null && Number.isFinite(fci)) out.push({ date: d, value: round(fci, 4) });
  }
  return out;
}

/** سری بازدهی ۱۰سالهٔ **کشوری** برای خط دوم (هم‌پنجرهٔ FCI). */
export function y10Series(i: FinInputs, months = 48): FinPoint[] {
  const fci = fciSeries(i, months);
  if (!i.y10 || !fci.length) return [];
  const from = fci[0]!.date;
  return i.y10.filter((p) => p.date >= from);
}

// ------------------------------------------------------------------
// ۶) بج‌های سیگنال چارت شرایط مالی (FAS + شش فرعی)
// ------------------------------------------------------------------
/**
 * بج‌های چارت شرایط مالی **به‌ترتیب پرامپت**:
 *   `FAS` (پس‌زمینه‌دار) → `Y10` · `Credit` · `DXY` · `Equity` · `Liquidity` · `Vol`
 *
 * هر سیگنال ناموجود ⇒ بج `N/A` سفید **بدون فلش** (هرگز حذف نمی‌شود).
 * `fas === null` ⇒ بج اصلی هم `FAS · N/A` با پس‌زمینهٔ خنثی می‌شود (طبق پرامپت).
 */
export function financialSignals(i: FinInputs, fas: FasParts | null): ChartSignal[] {
  const out: ChartSignal[] = [];
  const noteParams = i.note;

  if (!fas) {
    out.push({
      id: "fas",
      label: "Fas",
      display: "N/A",
      value: null,
      tone: "neutral",
      valueTone: "neutral",
      weight: 1,
      fill: true,
      hintKey: "signals.fas.noData",
      hintParams: { ...noteParams },
    });
  } else {
    out.push({
      id: "fas",
      label: "Fas",
      display: `${fas.glyph} ${fas.hardness == null ? "N/A" : `${fas.hardness}%`}`,
      tone: FCI_TONE[fas.level]!,
      valueTone: fas.effectTone,
      weight: fas.count,
      fill: true,
      value: fas.hardness,
      hintKey: "signals.fas.hint",
      hintParams: {
        fci: fas.fci ?? "N/A",
        level: fas.level,
        hardness: fas.hardness ?? "N/A",
        direction: fas.direction,
        count: fas.count,
        deltaSum: fas.deltaSum ?? "N/A",
        y10: fas.components.y10 ?? "N/A",
        credit: fas.components.credit ?? "N/A",
        vol: fas.components.vol ?? "N/A",
        equity: fas.components.equity ?? "N/A",
        dxy: fas.components.dxy ?? "N/A",
        liquidity: fas.components.liquidity ?? "N/A",
        used: fas.used.join(",") || "—",
        ...noteParams,
      },
    });
  }

  out.push(
    componentSignal({
      id: "y10",
      label: "Y10",
      points: i.y10,
      eps: MOVE_EPS.y10,
      bias: "up-hard",
      format: (v) => `${round(v, 2)}%`,
      hintKey: "signals.y10.hint",
      noDataKey: "signals.y10.noData",
      extraParams: () => ({ country: i.note.country }),
    }),
  );
  out.push(
    componentSignal({
      id: "credit",
      label: "Credit",
      points: i.credit,
      eps: MOVE_EPS.credit,
      bias: "up-hard",
      format: (v) => `${round(v, 2)}%`,
      hintKey: "signals.credit.hint",
      noDataKey: "signals.credit.noData",
    }),
  );
  out.push(
    componentSignal({
      id: "dxy",
      label: "DXY",
      points: i.dxy,
      eps: MOVE_EPS.dxy,
      bias: "up-hard",
      pct: true,
      format: (v) => `${round(v, 1)}`,
      hintKey: "signals.dxy.hint",
      noDataKey: "signals.dxy.noData",
    }),
  );
  out.push(
    componentSignal({
      id: "equity",
      label: "Equity",
      points: i.equity,
      eps: MOVE_EPS.equity,
      bias: "up-easy",
      pct: true,
      format: (v) => `${Math.round(v)}`,
      hintKey: "signals.equity.hint",
      noDataKey: "signals.equity.noData",
    }),
  );
  const liqYoy = yoyOfLevel(i.liquidity);
  const liqD = pctAt(i.liquidity, 3);
  out.push(
    componentSignal({
      id: "liquidity",
      label: "Liquidity",
      points: i.liquidity,
      eps: MOVE_EPS.liquidity,
      bias: "up-easy",
      pct: true,
      format: () => (liqYoy == null ? "N/A" : `${round(liqYoy, 1)}%`),
      hintKey: "signals.liquidity.hint",
      noDataKey: "signals.liquidity.noData",
      extraParams: (v) => ({
        yoy: liqYoy == null ? "N/A" : `${round(liqYoy, 1)}%`,
        delta3: liqD == null ? "N/A" : `${signed(liqD)}%`,
        level: round(v, 0),
      }),
    }),
  );
  out.push(
    componentSignal({
      id: "vol",
      label: "Vol",
      points: i.vol,
      eps: MOVE_EPS.vol,
      bias: "up-hard",
      pct: true,
      format: (v) => `${round(v, 2)}`,
      hintKey: "signals.vol.hint",
      noDataKey: "signals.vol.noData",
    }),
  );

  return out;
}

/** تُن چهارسطحی حرکت یک مؤلفهٔ بازار (۴ حالت: سبز/زرد/سفید/قرمز). */
export function marketMoveTone(
  delta: number | null,
  eps: number,
  bias: "up-hard" | "up-easy",
): ChartSignal["tone"] {
  if (delta == null || !Number.isFinite(delta)) return "neutral";
  const favourable = bias === "up-hard" ? -delta : delta;
  const a = Math.abs(favourable);
  if (a <= eps) return "neutral";
  if (a <= 2 * eps) return "warn";
  return favourable > 0 ? "pos" : "neg";
}

/** بج سیگنال یک مؤلفهٔ بازار (یا `N/A` اگر داده نبود). */
function componentSignal(input: {
  id: string;
  label: string;
  points: FinPoint[] | null;
  eps: number;
  bias: "up-hard" | "up-easy";
  format: (v: number) => string;
  /** کلید i18n حالت «داده موجود» */
  hintKey: string;
  /** کلید i18n حالت «بدون داده» */
  noDataKey: string;
  /** پارامترهای افزودهٔ tooltip (مقدار/دلتا خودکار اضافه می‌شوند) */
  extraParams?: (v: number, d: number | null) => Record<string, string | number>;
  /** تغییر نسبی درصدی (سری‌های شاخصی) یا مطلق (نرخ/اسپرد) */
  pct?: boolean;
}): ChartSignal {
  const v = last(input.points);
  if (v == null) {
    return naSignal(input.id, input.label, input.noDataKey);
  }
  const d = input.pct ? pctAt(input.points, 1) : deltaAt(input.points, 1);
  const tone = marketMoveTone(d, input.eps, input.bias);
  return {
    id: input.id,
    label: input.label,
    display: `${moveArrow(d, input.eps)} ${input.format(v)}`,
    value: v,
    tone,
    valueTone: tone,
    hintKey: input.hintKey,
    hintParams: {
      value: input.format(v),
      delta: d == null ? "—" : signed(d),
      ...(input.extraParams ? input.extraParams(v, d) : {}),
    },
  };
}


