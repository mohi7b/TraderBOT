/**
 * قرارداد دادهٔ مشترک همهٔ دامنه‌ها (Contract).
 * این تایپ‌ها **دقیقاً** منطبق با payload واقعی بک‌اند ماکرو هستند:
 *   collector/macro/backend/core/picker_lib.cjs
 *   collector/macro/backend/processors/{trend,summary,risk}.cjs
 * Visx/LWC و همهٔ Domain Components فقط با این ساختار کار می‌کنند.
 */

export type TrendDirection = "up" | "down" | "flat";
export type TrendStrength = "low" | "medium" | "high";
export type SeriesKind = "index" | "rate" | "percent" | "level";

export type GlobalTrend = "heating" | "cooling" | "stable" | "mixed";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface SeriesLatest {
  date: string;
  value: number;
  mom: number | null;
  yoy: number | null;
}

export interface SeriesTrend {
  direction: TrendDirection;
  strength: TrendStrength;
  momentum: number | null;
  volatility: number | null;
  slope_3m: number | null;
  slope_6m: number | null;
  slope_12m: number | null;
}

export interface SeriesRiskFlags {
  /** قرارداد مشخص: سه بولین */
  high_volatility: boolean;
  sharp_reversal: boolean;
  /** = vol_spike: |آخرین گام| > 2.5× انحراف پنجره */
  abnormal_momentum: boolean;
  /** جزئیات غنی (افزونهٔ داشبورد) */
  vol_spike: boolean;
  near_peak: boolean;
  near_trough: boolean;
  has_risk: boolean;
  notes: string[];
}

export interface SeriesHistory {
  full: SeriesPoint[];
  display: SeriesPoint[];
}

export interface CountryRef {
  /** ISO3 */
  code: string;
  name: string;
}

export interface IndicatorRef {
  code: string;
  label: string;
  category?: string;
  unit_hint?: string | null;
  /**
   * کد provider واقعی سری (مثل `CPI_IDX_TXCP01_NRG` یا `HICP_ANR_TOT_X_NRG_FOOD`).
   * بک‌اند آن را همیشه می‌فرستد (picker_lib `_enrich`) و برای تشخیص
   * «کیفیت منبع» (P2) و کلید اسلات رنگ استفاده می‌شود.
   */
  provider_code?: string;
}

export interface DatasetMeta {
  code: string;
  label?: string;
  /** نام انگلیسی/فارسی دیتاست از رجیستری بک‌اند */
  name_en?: string;
  name_fa?: string;
  [k: string]: unknown;
}

/**
 * کادنس واقعی سری (P3).
 * بعضی منابع، دادهٔ فصلی را روی کلیدهای **ماهانه** تکرار می‌کنند
 * (شاهد: `BIS.AU.CPI_IDX.M` → هر ۳ ماه یک‌بار تغییر ⇒ پله‌ای، flat_ratio≈0.7).
 * بک‌اند این را تشخیص می‌دهد تا:
 *   · برچسب فرکانس در چارت درست باشد (`effective`)
 *   · فرانت‌اند سری را به دوره‌های واقعی تجمیع کند (بدون اختراع داده)
 */
export interface SeriesCadence {
  /** فرکانس اعلامی در DB (مثلاً "M") */
  declared: string;
  /** فرکانس مؤثر بر پایهٔ داده (مثلاً "Q") */
  effective: string;
  /** آیا ماه‌های تخت (تکرارشده) غالب‌اند؟ */
  padded: boolean;
  /** نسبت ماه‌های «بدون تغییر» در ۲۴ نقطهٔ آخر (۰..۱) */
  flat_ratio: number;
}

export interface Series {
  id: string;
  series_id?: string;
  dataset: string;
  dataset_meta?: DatasetMeta;
  country: CountryRef;
  indicator: IndicatorRef;
  unit: string | null;
  /** متن خام واحد از core.db (روش ساخت سری‌های DERIVED این‌جاست) */
  unit_raw?: string | null;
  series_kind: SeriesKind;
  unit_origin?: string;
  frequency: string; // "M" | "Q" | "A" | "W" | "D"
  cadence?: SeriesCadence;
  /**
   * P2: رتبهٔ کیفیت منبع (۰ = بهتر). ترتیب: Eurostat HICP-ANR > FRED core >
   * OECD `_TXCP01_NRG` > … > DERIVED. انتخاب سری در باند تازگی از این رتبه
   * استفاده می‌کند (فرانت‌اند و picker بک‌اند یکسان).
   */
  quality_rank?: number;
  /** برچسب خوانای کیفیت منبع (مثلاً «Eurostat HICP-ANR (official core YoY)») */
  quality_label?: string | null;
  source?: string | null;
  latest: SeriesLatest | null;
  trend: SeriesTrend | null;
  risk_flags: SeriesRiskFlags | null;
  history: SeriesHistory;
}

export interface GroupCoverage {
  series: number;
  countries: string[];
  datasets: string[];
  as_of: string | null;
}

export interface GroupSummary {
  global_trend: GlobalTrend;
  avg_yoy: number | null;
  avg_mom: number | null;
  rising: number;
  falling: number;
  flat: number;
  coverage: GroupCoverage;
}

export interface GroupMeta {
  title: string;
  canonical_indicators: string[];
  max_series: number;
  generated_at: string;
  /** رویدادهای «منبع منتشر نکرده» (P4) — برای حاشیه‌نویسی چارت */
  known_gaps?: KnownGap[];
}

/** یک بریدگی شناخته‌شدهٔ داده (منبع منتشر نکرده — نه خطای ingest). */
export interface KnownGap {
  country: string; // ISO3
  canon: string; // CPI | CORE_CPI | …
  date: string; // "YYYY-MM"
  label?: string;
  reason?: string;
}

export interface Group {
  group: string;
  meta: GroupMeta;
  summary: GroupSummary;
  available: number;
  series_count: number;
  series: Series[];
}

export interface ApiError {
  error: string;
  status: number;
  detail?: string;
}

/** متادیتای کشور از MAIN DB (هدف تورمی دوکرانه). */
export interface CountryMeta {
  country: string; // ISO3
  inflation_target_low: number | null;
  inflation_target_high: number | null;
  note?: string | null;
}
