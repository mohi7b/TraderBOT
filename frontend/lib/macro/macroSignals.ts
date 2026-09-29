/**
 * سیگنال‌های دامنه‌ای **Real** (نرخ بهرهٔ واقعی) و **Yld** (بازدهی ۱۰ساله)
 * برای چارت «Policy Rate vs CPI» — چارت **نرخ بهره**.
 * frontend/lib/macro/macroSignals.ts
 * ============================================================
 * **چرا این‌جا و نه در کتابخانهٔ موتور؟**
 *   مثل PAS، این دو سیگنال چندسری‌اند (نرخ سیاستی − تورم کل، و بازدهی ۱۰ساله)
 *   ⇒ طبق الگوی PAS **در دامنه** ساخته و با `signals.custom` به چارت داده
 *   می‌شوند. آستانه/تُن رنگ از `lib/chart/signals.ts` می‌آید تا یک تعریف مشترک
 *   بین موتور و دامنه بماند.
 *
 * **ظاهر:** دقیقاً مثل بقیهٔ سیگنال‌های چارت — بدون پس‌زمینه، بدون فلش، بدون
 *   شدت؛ فقط **نام کوتاه** (`Real` / `Yld`) + مقدار با رنگ چهارسطحی.
 *
 * **قرارداد داده:** canon واقعی سری در `indicator.code` است، نه در `id`
 *   (مثال واقعی: `FRED_USA_DGS10_M` با canon=`YIELD_10Y`).
 *
 * **گارد کهنگی:** سری‌ای که آخرین نقطه‌اش بیش از ۱۸ ماه از آخرین نقطهٔ تورم
 *   عقب‌تر است «دادهٔ مُرده» است و `null` می‌دهد (تجربهٔ واقعی: بازدهی روسیه
 *   روی FRED تا 2018-06 متوقف شده ⇒ بدون گارد، «۷.۶٪ امروز» جعل می‌شد).
 * ============================================================
 */
import type { ChartSignal } from "@/lib/chart/types";
import { missingSignal } from "@/lib/chart/spec/missing";
import {
  REAL_RATE_BANDS,
  YIELD_10Y_BANDS,
  realRateTone,
  yield10yTone,
} from "@/lib/chart/signals";
import { pointsOfSeries } from "@/lib/macro/policy";

/** حداقل شکل موردنیاز یک سری برای این ماژول. */
interface SeriesLike {
  id: string;
  country: { code: string };
  /**
   * canon واقعی سری (`indicator.code`) — **جای اصلی تشخیص**.
   * ⚠️ `id` به‌شکل `{DATASET}_{COUNTRY}_{providerCode}_{FREQ}` ساخته می‌شود و
   *    providerCode همیشه برابر canon نیست (مثال واقعی: `FRED_USA_DGS10_M`
   *    برای canon=`YIELD_10Y`). تطبیق فقط روی `id` ⇒ سیگنال هرگز پیدا نمی‌شد.
   */
  indicator?: { code?: string };
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
/** عدد با علامت — مثل بقیهٔ سیگنال‌های چارت (مثل `+0.27`). */
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${round(v, d)}`;

/** رتبهٔ ماه‌محور تاریخ (`YYYY-MM` یا `YYYY-MM-DD`) برای مقایسهٔ تازگی. */
function rankOfMonth(date: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(String(date ?? ""));
  return m ? Number(m[1]) * 12 + Number(m[2]) : Number.NEGATIVE_INFINITY;
}

/** آخرین نقطهٔ یک سری (یا `null` اگر داده‌ای نباشد). */
function lastPoint(s: unknown): { date: string; value: number } | null {
  const pts = pointsOfSeries(s);
  if (!pts.length) return null;
  const p = pts[pts.length - 1]!;
  return { date: p.date, value: p.value };
}

/**
 * آخرین مقدار سریِ یک canon برای یک کشور.
 * اگر چند سری باشد (چند منبع/فرکانس)، سری‌ای انتخاب می‌شود که
 * **تازه‌ترین** نقطه را دارد (بدون میانگین‌گیری یا درون‌یابی).
 *
 * **گارد کهنگی (`maxAgeMonths`):** اگر آخرین نقطهٔ سری بیش از این تعداد ماه
 * از `refDate` عقب‌تر باشد، مقدار `null` برمی‌گردد تا **دادهٔ مُرده** به‌جای
 * مقدار امروز نمایش داده نشود (تجربهٔ واقعی: سری بازدهی روسیه OECD تا
 * 2018-06 متوقف شده ⇒ بدون گارد، «۷.۶٪ امروز» جعل می‌شد).
 */
export function latestOfCanon<T extends SeriesLike>(
  series: T[],
  canon: string,
  country: string,
  opts: { refDate?: string; maxAgeMonths?: number } = {},
): { value: number | null; series: T | null; date: string | null } {
  const cc = country.toUpperCase();
  const key = canon.toUpperCase();
  const candidates = series.filter((s) => {
    if (s.country?.code?.toUpperCase() !== cc) return false;
    // ۱) canon واقعی (`indicator.code`) ۲) fallback روی id (سازگاری با
    //    سری‌هایی که providerCodeشان برابر canon است مثل BIS POLICY_RATE)
    const code = s.indicator?.code?.toUpperCase();
    return code ? code === key : s.id.toUpperCase().includes(key);
  });
  let best: T | null = null;
  let bestPt: { date: string; value: number } | null = null;
  for (const s of candidates) {
    const pt = lastPoint(s);
    if (!pt) continue;
    if (!bestPt || rankOfMonth(pt.date) > rankOfMonth(bestPt.date)) {
      best = s;
      bestPt = pt;
    }
  }
  if (!best || !bestPt) return { value: null, series: null, date: null };
  const refRank = rankOfMonth(opts.refDate ?? "");
  const maxAge = opts.maxAgeMonths ?? 18;
  if (Number.isFinite(refRank) && refRank - rankOfMonth(bestPt.date) > maxAge) {
    return { value: null, series: best, date: bestPt.date };
  }
  return { value: bestPt.value, series: best, date: bestPt.date };
}

/**
 * سیگنال **بدون داده** (نمونه: `Yld` برای کشورهایی که سری بازدهی ندارند).
 * طبق قرارداد پروژه: هیچ مقدار ساختگی/صفر ساخته نمی‌شود، اما بج هم حذف نمی‌شود
 * (حذف بج، ساختار سطر سیگنال‌ها را بین کشورها جابه‌جا می‌کند).
 * ظاهر: **مقدار `—`** · **رنگ متن سفید/خنثی** · **بدون فلش** · **متن `N/A`**.
 * ⚠️ «متن» همان اسلات **برچسب** است (مثل `Rmi`/`Gap`) و برای نبودِ داده
 *    `N/A` می‌شود؛ `id` ثابت می‌ماند تا tooltip/تشخیص حفظ شود.
 */
/**
 * سیگنال «بدون داده» با سیاست **`dash`** (مقدار `—`) — طبق `spec/missing.ts`.
 * ⚠️ v3: پارامتر دوم **کلید i18n** است، نه متن آماده (هیچ متن ثابتی در دامنه).
 * نمونه: `PMI`/`NOW` در چارت رشد و `Yld`/`Real` در چارت نرخ بهره.
 */
export function noDataSignal(
  id: string,
  hintKey: string,
  label = "N/A",
  hintParams?: Record<string, string | number>,
): ChartSignal {
  /**
   * ⚠️ سیاست `na` (مقدار `N/A`) — به‌درخواست کاربر 2026-09-23 **همهٔ چارت‌ها
   * یکپارچه** شدند: پیش‌تر چارت رشد `—` نشان می‌داد و چارت مالی `N/A`.
   * سیاست `dash` در قرارداد باقی است (سازگاری) ولی دیگر استفاده نمی‌شود.
   * **برچسب ثابت می‌ماند** (`Yld`/`Real`/`PMI`/`NOW`) و فقط **مقدار** `N/A` می‌شود.
   */
  const s = missingSignal({ policy: "na", id, label, hintKey, hintParams });
  /* policy=na همیشه بج می‌سازد؛ fallback فقط برای رضایت تایپ */
  return s ?? { id, label, display: "N/A", value: null, tone: "neutral", valueTone: "neutral" };
}

/**
 * **Real** = نرخ بهرهٔ واقعی = نرخ سیاستی − تورم کل (٪).
 * معنای اقتصادی: سیاست پولی **در عمل** انقباضی است یا انبساطی.
 * نبودِ هر یک از دو ورودی ⇒ بج «بدون داده» (`N/A —`، بدون مقدار ساختگی).
 */
export function realRateSignal(
  policyRate: number | null,
  cpiYoY: number | null,
): ChartSignal {
  if (policyRate == null || cpiYoY == null) {
    return noDataSignal(
      "realrate",
      "signals.real.noData",
      "Real",
    );
  }
  if (!Number.isFinite(policyRate) || !Number.isFinite(cpiYoY)) {
    return noDataSignal("realrate", "signals.real.invalid", "Real");
  }
  const real = policyRate - cpiYoY;
  const tone = realRateTone(real);
  return {
    id: "realrate",
    /** نام کوتاه مثل بقیهٔ سیگنالها (`Rmi`/`Im`/`Gap`/`Prf`) — بدون نماد */
    label: "Real",
    display: `${signed(real)}pp`,
    value: round(real, 2),
    tone,
    /** رنگ متن مقدار = همان نردبان چهارسطحی (🟥🟨⚪🟩) */
    valueTone: tone,
    /** v3: توضیح از i18n (بدون متن ثابت در دامنه) */
    hintKey: "signals.real.hint",
    hintParams: {
      policy: round(policyRate, 2),
      cpi: round(cpiYoY, 2),
      real: round(real, 2),
      strongNeg: REAL_RATE_BANDS.superExpansionary,
      mildNeg: REAL_RATE_BANDS.expansionary,
      neutral: REAL_RATE_BANDS.neutralBand,
    },
  };
}

/**
 * **Yld** = بازدهی اوراق دولتی ۱۰ساله (٪) — شرایط مالی و هم‌راهی بازار با
 * سیاست پولی. ورودی: سری‌های گروه ماکرو + کشور + تاریخ مرجع (گارد کهنگی).
 *
 * نبودِ سری (مثل BRA/CHN/SAU/TUR) یا سری کهنه (RUS تا 2018-06) ⇒ بج
 * **`N/A —`** با رنگ سفید و بدون فلش (به‌درخواست کاربر 2026-09-22).
 */
export function yield10ySignal<T extends SeriesLike>(
  series: T[],
  country: string,
  refDate: string,
  opts: { maxAgeMonths?: number } = {},
): ChartSignal {
  const pick = latestOfCanon(series, "YIELD_10Y", country, {
    refDate,
    maxAgeMonths: opts.maxAgeMonths ?? 18,
  });
  const y = pick.value;
  if (y == null || !Number.isFinite(y)) {
    const stale = pick.date
      ? "signals.yld.noDataStale"
      : "signals.yld.noDataSource";
    /* ⚠️ برچسب **ثابت** `Yld` می‌ماند؛ فقط مقدار `N/A` می‌شود (درخواست کاربر) */
    return noDataSignal("yield10y", stale, "Yld", {
      date: pick.date ?? "—",
      maxAge: opts.maxAgeMonths ?? 18,
    });
  }
  const tone = yield10yTone(y);
  return {
    id: "yield10y",
    label: "Yld",
    display: `${round(y, 2)}%`,
    value: round(y, 2),
    tone,
    valueTone: tone,
    hintKey: "signals.yld.hint",
    hintParams: {
      value: round(y, 2),
      date: pick.date ?? "—",
      low: YIELD_10Y_BANDS.low,
      neutralHigh: YIELD_10Y_BANDS.neutralHigh,
      tightHigh: YIELD_10Y_BANDS.tightHigh,
    },
  };
}
