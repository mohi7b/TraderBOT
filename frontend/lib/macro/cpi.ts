import { parseSeriesDate } from "@/lib/format";
import type { SeriesKind, SeriesPoint } from "@/lib/types/series";

export interface YoyPoint {
  date: string;
  yoy: number;
}

/**
 * ============================================================
 * قرارداد «منبع YoY» (Type Guard) — مبنای CPI_YOY_DATA_AUDIT.md
 * ============================================================
 * بک‌اند هر سری را با `series_kind` برچسب می‌زند و معنای مقدار خام
 * کاملاً متفاوت است:
 *
 *   rate    → مقدار خام **خودش YoY ٪ است** (BIS برای USA/CAN/DEU/IND/TUR/MEX/BRA/ZAF،
 *             IMF::PCPIPCH، WB::FP.CPI.TOTL.ZG، EUROSTAT::HICP_ANR)
 *             ⇒ هیچ محاسبهٔ ریاضی مجاز نیست؛ همان مقدار خام رسم می‌شود.
 *   percent → مقدار خام نسبت در ٪ است (مثل UNEMP 4.1)
 *             ⇒ آن هم یک «نرخ» است و YoY‌سازی بی‌معناست ⇒ خام.
 *   index   → سطح شاخص (مثل BIS::CPI برای CHN/JPN/GBR/FRA/ITA/AUS/KOR/RUS/SAU، FRED::CPIAUCSL)
 *             ⇒ YoY = درصد تغییر نسبت به offset فرکانس.
 *   level   → سطح عددی (مثل OWID::CPI ≈148، GDP به میلیون دلار)
 *             ⇒ درصد تغییر معنا دارد (رشد) ⇒ همان مسیر index.
 *
 * ریشهٔ باگ تاریخی: `registry.cjs` مقدار `BIS::CPI` را برای **هر ۱۷ کشور**
 * هاردکد `index` می‌کرد، در حالی که ۸ کشور داده را به‌صورت rate ذخیره
 * کرده‌اند؛ نتیجه YoY‌سازیِ دوباره روی یک نرخ → اعداد بی‌معنا
 * (yoy=75.5 برای کانادا، 90.0 برای هند، …).
 * ============================================================
 */
export type YoySource = "raw" | "computed";

/** انواعی که مقدار خامشان از قبل «نرخ/درصد» است و نباید تبدیل شوند. */
const RAW_RATE_KINDS: readonly SeriesKind[] = ["rate", "percent"];

/**
 * Type Guard: آیا مقدار خام این سری از قبل «نرخ سالانه/درصد» است؟
 * اگر true باشد **هیچ محاسبهٔ YoY نباید اجرا شود**.
 */
export function isPrecomputedRate(
  kind: SeriesKind | string | null | undefined,
): boolean {
  return RAW_RATE_KINDS.includes((kind ?? "") as SeriesKind);
}

/** تعیین مسیر تبدیل: `raw` = بدون محاسبه، `computed` = درصد تغییر. */
export function classifyYoySource(
  kind: SeriesKind | string | null | undefined,
): YoySource {
  return isPrecomputedRate(kind) ? "raw" : "computed";
}

/** ورودی مشترک سری (فقط فیلدهایی که برای تبدیل لازم است). */
export interface YoySourceInput {
  series_kind?: SeriesKind | string | null;
  frequency?: string | null;
  history?:
    | {
        full?: SeriesPoint[] | null;
        display?: SeriesPoint[] | null;
      }
    | null;
}

function offsetForFrequency(freq: string | null | undefined): number {
  switch (freq) {
    case "M":
      return 12;
    case "Q":
      return 4;
    case "A":
      return 1;
    default:
      return 12;
  }
}

/** مرتب‌سازی + حذف نقاط نامعتبر (مشترک همهٔ مسیرها). */
function cleanPoints(history: SeriesPoint[] | null | undefined) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history
    .map((p) => ({ date: p.date, value: p.value, t: parseSeriesDate(p.date) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value))
    .sort((a, b) => a.t - b.t);
}

/**
 * مسیر `rate`/`percent`: مقدار خام **همان YoY است** ⇒ صفر محاسبه.
 * فقط اعتبارسنجی، مرتب‌سازی و یکتاسازی تاریخ‌ها.
 */
export function rawRatePoints(
  history: SeriesPoint[] | null | undefined,
): YoyPoint[] {
  const clean = cleanPoints(history);
  const out: YoyPoint[] = [];
  const seen = new Set<string>();
  for (const p of clean) {
    if (seen.has(p.date)) continue; // آخرین مقدار هر تاریخ، یک‌بار
    seen.add(p.date);
    out.push({ date: p.date, yoy: p.value });
  }
  return out;
}

/**
 * کلید «همان دوره، یک سال قبل» برای هر cadence:
 *   2026-07 → 2025-07 · 2026-Q1 → 2025-Q1 · 2026 → 2025 · 2026-07-15 → 2025-07-15
 *
 * چرا لازم است (باگ کشف‌شده در P0): پیاده‌سازی قبلی از آفست **مکانی** (i-12)
 * استفاده می‌کرد؛ اگر یک نقطهٔ میانی غایب باشد (شاهد واقعی: سری BIS شاخص CPI
 * آمریکا نقطهٔ 2025-10 را ندارد) مبنا یک ماه جابجا می‌شد و YoY اشتباه می‌شد
 * (3.52٪ به‌جای 3.36٪) — در حالی که بک‌اند همان لحظه 3.3648٪ می‌داد.
 */
export function priorYearKey(date: string | null | undefined): string | null {
  const s = String(date ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // روزانه
  if (m) return `${Number(m[1]) - 1}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s); // ماهانه
  if (m) return `${Number(m[1]) - 1}-${m[2]}`;
  m = /^(\d{4})-Q([1-4])$/i.exec(s); // فصلی
  if (m) return `${Number(m[1]) - 1}-Q${m[2]!.toUpperCase()}`;
  m = /^(\d{4})-S([1-2])$/i.exec(s); // نیم‌سال
  if (m) return `${Number(m[1]) - 1}-S${m[2]}`;
  m = /^(\d{4})$/.exec(s); // سالانه
  if (m) return `${Number(m[1]) - 1}`;
  return null;
}

/** کلید ماهِ n ماه قبل برای تاریخ‌های ماهانه (YYYY-MM). */
export function shiftMonthKey(
  date: string | null | undefined,
  months: number,
): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!m) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const y = Math.floor(total / 12);
  const mo = (((total % 12) + 12) % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * از **سطح شاخص** → آرایهٔ YoY (مسیر `computed`).
 * ⚠️ فقط برای سری‌های سطحی (kind = index/level) فراخوانی شود؛
 * برای سری‌های `rate`/`percent` از `rawRatePoints` استفاده کن.
 *
 * تطبیق **تاریخ‌محور** است (نه آفست مکانی) ⇒ نسبت به گپ‌های داده مقاوم است.
 * `offsetOverride` فقط برای تست/سازگاری عقب‌رو نگه داشته شده و در آن حالت
 * رفتار قدیمی (آفست مکانی) اعمال می‌شود.
 */
export function computeYoyRows(
  history: SeriesPoint[] | null | undefined,
  frequency: string | null | undefined,
  offsetOverride?: number,
): YoyPoint[] {
  const clean = cleanPoints(history);
  if (clean.length === 0) return [];

  // مسیر سازگاری عقب‌رو: آفست مکانی (فقط اگر صریح درخواست شود)
  const legacyOffset = offsetOverride ?? offsetForFrequency(frequency);
  if (offsetOverride !== undefined) {
    const out: YoyPoint[] = [];
    for (let i = legacyOffset; i < clean.length; i++) {
      const cur = clean[i]!;
      const prev = clean[i - legacyOffset]!;
      if (!prev.value || prev.value <= 0) continue;
      const yoy = (cur.value / prev.value - 1) * 100;
      if (Number.isFinite(yoy)) out.push({ date: cur.date, yoy });
    }
    return out;
  }

  // مسیر اصلی: همان دورهٔ یک سال قبل، بر اساس **تاریخ دقیق**
  const byDate = new Map<string, number>();
  for (const p of clean) byDate.set(p.date, p.value);

  const out: YoyPoint[] = [];
  for (const p of clean) {
    const prevKey = priorYearKey(p.date);
    if (!prevKey) continue;
    const prev = byDate.get(prevKey);
    if (prev === undefined || !(prev > 0)) continue;
    const yoy = (p.value / prev - 1) * 100;
    if (Number.isFinite(yoy)) out.push({ date: p.date, yoy });
  }
  return out;
}

/**
 * سری «annualized 3M» روی سطح شاخص (rolling):
 *   ((v_t / v_{t-3})^(4/3) - 1) * 100
 *
 * ⚠️ فقط برای سری **ماهانه** معنا دارد (برای Q/A خروجی خالی است؛ پیش‌تر آفست
 * مکانی i-3 روی سری فصلی، عملاً «۹ماههٔ annualized» می‌ساخت که غلط بود).
 * مبنا هم تاریخ‌محور است (3 ماه قبل)، پس نسبت به گپ داده مقاوم است.
 * ⚠️ فقط از **سطح** محاسبه می‌شود؛ روی سری `rate` بی‌معناست.
 */
export function computeAnnualized3m(
  history: SeriesPoint[] | null | undefined,
  frequency?: string | null,
): YoyPoint[] {
  const clean = cleanPoints(history);
  if (clean.length < 4) return [];
  if ((frequency ?? "M").toUpperCase() !== "M") return [];

  const byDate = new Map<string, number>();
  for (const p of clean) byDate.set(p.date, p.value);

  const out: YoyPoint[] = [];
  for (const p of clean) {
    const key = shiftMonthKey(p.date, -3);
    if (!key) continue;
    const a = byDate.get(key);
    if (a === undefined || a <= 0 || p.value <= 0) continue;
    const v = (Math.pow(p.value / a, 4 / 3) - 1) * 100;
    if (Number.isFinite(v)) out.push({ date: p.date, yoy: v });
  }
  return out;
}

/**
 * ============================================================
 * لایهٔ ۲ — Safeguard داده-محور (چون بک‌اند kind را اشتباه می‌زند)
 * ============================================================
 * شاهد مستند (`CPI_YOY_DATA_AUDIT.md` بند ۳ و ۴): `registry.cjs` مقدار
 * `BIS::CPI` را برای همهٔ ۱۷ کشور `index` هاردکد کرده، در حالی که ۸ کشور
 * (USA, DEU, CAN, IND, TUR, MEX, BRA, ZAF) داده را به‌صورت **نرخ** ذخیره
 * کرده‌اند. پس اعتماد صرف به `series_kind` کافی نیست و این لایهٔ دوم
 * (قابل خاموش‌کردن) اضافه شده است.
 *
 * قاعده (اندازه‌گیری‌شده روی همان ۱۷ کشور، بدون حدس):
 *   سری شبیه «نرخ» است ⇔ |median(۱۲ نقطهٔ آخر)| ≤ 60
 *                          و  سهم گام‌های صعودی در پنجرهٔ اخیر < 0.85
 *
 *   نتیجهٔ اندازه‌گیری: ۸ کشور rate با median ∈ [2.33, 31.93] و share ∈ [0.42, 0.54]
 *                       ۹ کشور index با median ∈ [119, 294]
 *   ⇒ فاصلهٔ ایمن بسیار زیاد است و قاعده ۱۷/۱۷ درست جواب می‌دهد.
 *
 * ⚠️ این لایه پس از اصلاح `registry.cjs` (سمت بک‌اند) بی‌اثر و بی‌خطر است،
 *    چون لایهٔ ۱ (`series_kind === "rate"`) اول از همه بررسی می‌شود.
 * ============================================================
 */
export interface RateGuardConfig {
  /** سقف «مقدار شاخص» — بالاتر از این یعنی سطح شاخص، نه نرخ */
  maxRateMedian: number;
  /** اگر سری این‌قدر صعودی باشد، یک سطح رونددار است نه نرخ */
  maxPositiveStepShare: number;
  /** حداقل نقاط لازم تا قاعده اعمال شود */
  minPoints: number;
}

/** پیکربندی اثبات‌شده برای دامنهٔ CPI (بند ۳ ممیزی). */
export const CPI_RATE_GUARD: RateGuardConfig = {
  maxRateMedian: 60,
  maxPositiveStepShare: 0.85,
  minPoints: 24,
};

export type RateLikeReason =
  | "empty"
  | "insufficient-points"
  | "level-magnitude"
  | "trending-level"
  | "rate-magnitude";

export interface RateLikeDetection {
  isRate: boolean;
  reason: RateLikeReason;
  points: number;
  last12Median: number | null;
  positiveStepShare: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? 0;
  if (s.length % 2 === 1) return hi;
  const lo = s[mid - 1] ?? hi;
  return (lo + hi) / 2;
}

function positiveStepShare(values: number[]): number | null {
  if (values.length < 2) return null;
  let up = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[i - 1]!) up++;
  }
  return up / (values.length - 1);
}

/**
 * تشخیص «سری نرخ‌مانند» از روی خود اعداد (نه از روی برچسب بک‌اند).
 * خالص و مستقل ⇒ قابل تست و قابل استفاده در هر چارت.
 */
export function detectRateLike(
  history: SeriesPoint[] | null | undefined,
  cfg: RateGuardConfig = CPI_RATE_GUARD,
): RateLikeDetection {
  const values = cleanPoints(history).map((p) => p.value);
  if (values.length === 0) {
    return {
      isRate: false,
      reason: "empty",
      points: 0,
      last12Median: null,
      positiveStepShare: null,
    };
  }
  if (values.length < cfg.minPoints) {
    return {
      isRate: false,
      reason: "insufficient-points",
      points: values.length,
      last12Median: null,
      positiveStepShare: null,
    };
  }

  // فقط پنجرهٔ اخیر (نیاز به تاریخ اولیه — مثلاً ابرتورم دههٔ ۸۰ — نداریم)
  const window = values.slice(-cfg.minPoints);
  const med = median(window.slice(-12));
  const share = positiveStepShare(window);
  const base = { points: values.length, last12Median: med, positiveStepShare: share };

  if (med !== null && Math.abs(med) > cfg.maxRateMedian) {
    return { ...base, isRate: false, reason: "level-magnitude" };
  }
  if (share !== null && share >= cfg.maxPositiveStepShare) {
    return { ...base, isRate: false, reason: "trending-level" };
  }
  return { ...base, isRate: true, reason: "rate-magnitude" };
}

/**
 * تصمیم نهایی منبع YoY:
 *   ۱) `series_kind === "rate" | "percent"` ⇒ `raw` (اعلام صریح بک‌اند)
 *   ۲) اگر `guard: "cpi"` فعال باشد و داده نرخ‌مانند باشد ⇒ `raw`
 *   ۳) در غیر این صورت ⇒ `computed`
 */
export function resolveYoySource(
  input: YoySourceInput | null | undefined,
  opts?: { guard?: "off" | "cpi" },
): YoySource {
  if (!input) return "computed";
  if (isPrecomputedRate(input.series_kind)) return "raw";
  if (opts?.guard === "cpi" && detectRateLike(input.history?.full).isRate) {
    return "raw";
  }
  return "computed";
}

/**
 * ✅ نقطهٔ ورود واحد چارت‌ها برای تبدیل سری → نقاط YoY.
 *
 * قاعدهٔ قطعی (مبنا: `CPI_YOY_DATA_AUDIT.md`):
 *   - `series_kind === "rate"` (یا `percent`) ⇒ **هیچ محاسبه‌ای انجام نمی‌شود**؛
 *     مقدار خام عیناً به‌عنوان YoY برگردانده می‌شود.
 *   ۲) اگر `guard: "cpi"` روشن باشد و خودِ داده نرخ‌مانند باشد (بک‌اند kind را
 *      اشتباه زده) ⇒ همان مسیر `raw`، بدون محاسبه.
 *   - `index` / `level` ⇒ درصد تغییر نسبت به offset فرکانس محاسبه می‌شود.
 *
 * @example
 * // کانادا (BIS، برچسب index ولی داده نرخ) → 3.03 (نه 75.5)
 * seriesYoyPoints(canadaCpi, { guard: "cpi" });
 * // آمریکا (FRED، شاخص واقعی) → 3.30
 * seriesYoyPoints(usCpi, { guard: "cpi" });
 */
export function seriesYoyPoints(
  input: YoySourceInput | null | undefined,
  opts?: {
    window?: "full" | "display";
    offsetOverride?: number;
    /** "cpi" = فعال‌سازی لایهٔ ۲ (safeguard نرخ‌مانند). پیش‌فرض "off". */
    guard?: "off" | "cpi";
  },
): YoyPoint[] {
  if (!input) return [];
  const history =
    opts?.window === "display" ? input.history?.display : input.history?.full;

  if (resolveYoySource(input, { guard: opts?.guard }) === "raw") {
    return rawRatePoints(history);
  }
  return computeYoyRows(history, input.frequency, opts?.offsetOverride);
}

/**
 * نسخهٔ kind-aware برای «۳ ماههٔ annualized».
 * اگر منبع سری `raw` باشد (نرخ آمادهٔ بک‌اند یا تشخیص نرخ‌مانند) خالی
 * برمی‌گرداند — چون annualize فقط از **سطح** معنا دارد.
 */
export function seriesAnnualized3m(
  input: YoySourceInput | null | undefined,
  opts?: {
    window?: "full" | "display";
    /** "cpi" = فعال‌سازی لایهٔ ۲ (safeguard نرخ‌مانند). پیش‌فرض "off". */
    guard?: "off" | "cpi";
  },
): YoyPoint[] {
  if (!input) return [];
  if (resolveYoySource(input, { guard: opts?.guard }) === "raw") return [];
  const history =
    opts?.window === "display" ? input.history?.display : input.history?.full;
  return computeAnnualized3m(history, input.frequency);
}

/**
 * «۳ماههٔ سالانه‌شده» برای سری **فصلی** (Q) — از سطح شاخص فصلی.
 * `((idx_t / idx_{t-1})^4 − 1) × 100` ⇒ همان مفهوم مومنتوم سالانه‌شده،
 * ولی روی دوره‌های واقعی فصل (بدون دادهٔ ماهانهٔ تکرارشده).
 * ⚠️ روی سری `rate` خالی برمی‌گردد (سطح ندارد).
 */
export function computeAnnualizedQuarterly(
  history: SeriesPoint[] | null | undefined,
): YoyPoint[] {
  const clean = cleanPoints(history);
  if (clean.length < 3) return [];
  const out: YoyPoint[] = [];
  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1];
    const cur = clean[i];
    if (!prev || !cur) continue;
    if (!(prev.value > 0) || !(cur.value > 0)) continue;
    const v = (Math.pow(cur.value / prev.value, 4) - 1) * 100;
    if (Number.isFinite(v)) out.push({ date: cur.date, yoy: v });
  }
  return out;
}

/**
 * سطح‌های **فصلی** از یک سری ماهانهٔ «پله‌ای» (padded):
 * فقط ماه پایانی هر فصل (۳/۶/۹/۱۲) و تاریخش به `YYYY-Qn` تبدیل می‌شود.
 * (بدون اختراع داده — همان مقادیر واقعی، فقط با دورهٔ درست)
 */
export function quarterlyLevelsFromPadded(history: SeriesPoint[] | null | undefined): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const p of cleanPoints(history)) {
    const m = /^(\d{4})-(\d{2})$/.exec(p.date);
    if (!m) continue;
    const month = Number(m[2]);
    if (month % 3 !== 0) continue;
    out.push({ date: `${m[1]}-Q${month / 3}`, value: p.value });
  }
  return out;
}

/**
 * نسخهٔ kind-aware «۳ماههٔ سالانه‌شده» برای منبع **فصلی**.
 * @param opts.padded اگر منبع، ماهانهٔ تکرارشده (پله‌ای) است: اول سطح‌ها به
 *        فصل تجمیع می‌شوند و بعد annualize می‌شود (وگرنه گام‌های صفر ماهانه
 *        نتیجه را بی‌معنا می‌کرد).
 */
export function seriesAnnualizedQuarterly(
  input: YoySourceInput | null | undefined,
  opts?: { guard?: "off" | "cpi"; padded?: boolean },
): YoyPoint[] {
  if (!input) return [];
  if (resolveYoySource(input, { guard: opts?.guard }) === "raw") return [];
  const history = opts?.padded
    ? quarterlyLevelsFromPadded(input.history?.full)
    : input.history?.full;
  return computeAnnualizedQuarterly(history);
}

// ------------------------------------------------------------------
// P3: کادنس واقعی — رتبهٔ تاریخ + تجمیع سری «پله‌ای»
// ------------------------------------------------------------------
/**
 * رتبهٔ عددی یک تاریخ cadence-aware (ماه‌محور) برای مقایسهٔ تازگی.
 * `2026-Q2` → ژوئن ۲۰۲۶ (پایان فصل) · `2026` → دسامبر ۲۰۲۶.
 * ⚠️ مقایسهٔ رشته‌ای «YYYY-Qn» با «YYYY-MM» اشتباه است؛ این تابع آن را
 *    به یک عدد قابل‌مقایسه تبدیل می‌کند.
 */
export function dateRankOf(date: string | null | undefined): number {
  const s = String(date ?? "").trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  m = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]) * 3;
  m = /^(\d{4})-S([1-2])$/i.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]) * 6;
  m = /^(\d{4})$/.exec(s);
  if (m) return Number(m[1]) * 12 + 12;
  return Number.NEGATIVE_INFINITY;
}

/**
 * تجمیع ردیف‌های ماهانهٔ «پله‌ای» به دوره‌های واقعی (P3 — بدون اختراع داده).
 *
 * وقتی منبع، دادهٔ **فصلی** را روی کلیدهای ماهانه تکرار کرده است
 * (بک‌اند: `cadence.padded === true` و `effective === "Q"`)، فقط ماه‌های
 * پایانی فصل (۳/۶/۹/۱۲) می‌مانند و تاریخ به `YYYY-Qn` تبدیل می‌شود:
 *
 *   2026-04:3.94 · 2026-05:3.94 · 2026-06:3.94   →   2026-Q2:3.94
 *
 * چرا: خط «پله‌ای» روی محور ماهانه گمراه‌کننده است، و `3M-annualized` روی
 * دادهٔ تکراری بی‌معنا می‌شود؛ ولی مقدار واقعی فصل حفظ می‌شود.
 */
export function collapsePaddedRows(rows: YoyPoint[], effective: string): YoyPoint[] {
  if (effective !== "Q") return rows;
  const out: YoyPoint[] = [];
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})$/.exec(r.date);
    if (!m) continue; // تاریخ غیرماهانه (Q/A) دست‌نخورده رد می‌شود
    const month = Number(m[2]);
    if (month % 3 !== 0) continue; // فقط ماه پایانی فصل
    out.push({ date: `${m[1]}-Q${month / 3}`, yoy: r.yoy });
  }
  return out;
}
