/**
 * AL — تایپ‌های مشترک اندیکاتورها
 * frontend/lib/analysis/indicators/types.ts
 * ============================================================
 * چرا این فایل جدا؟ `registry.ts` توابع `compute` را import می‌کند؛ اگر compute
 * هم تایپ‌ها را از registry بگیرد، **حلقهٔ import** می‌سازیم. پس قرارداد تایپ‌ها
 * این‌جاست و هم registry و هم compute از همین می‌خوانند.
 * ============================================================
 */

/**
 * سری اندیکاتور — **هم‌طول ورودی** با `null` برای دورهٔ گرم‌شدن.
 * قاعدهٔ پروژه: هیچ مقدار جعلی (۰/پیش‌فرض) جای «ناموجود» نمی‌نشیند.
 */
export type IndicatorSeries = (number | null)[];

/** مقدار چندسری (مثل MACD: خط + سیگنال + هیستوگرام). */
export type IndicatorSeriesMap = Record<string, IndicatorSeries>;

/** کندل حداقلی برای اندیکاتورهای OHLC-محور (ATR/BB/VWAP). */
export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** دستهٔ رسمی اندیکاتور (طبق قرارداد پرامپت AL). */
export type IndicatorCategory = "trend" | "momentum" | "volatility" | "volume" | "pattern";

/** مشخصات پارامتر در Descriptor (کلید → قواعد اسکیما). */
export type IndicatorParamSpec = Record<string, { type: "int" | "float"; min: number; max: number; step: number; default: number }>;

/** ورودی یکنواخت همهٔ محاسبات AL. */
export interface IndicatorInput {
  /** سری بسته‌شدن (محور TAMC · بعد از ادغام DST) */
  closes: number[];
  /** کندل‌های همان محور (برای ATR/BB-حجم/VWAP) */
  candles?: OHLC[];
  params: Record<string, number>;
}

/** قرارداد تابع محاسبه: خالص · بدون UI · بدون I/O. */
export type IndicatorComputeFn = (input: IndicatorInput) => IndicatorSeries | IndicatorSeriesMap;

/** خروجی هر اندیکاتور: یک یا چند سری نام‌دار (برای overlay/پنل). */
export interface IndicatorOutputSpec {
  /** شناسهٔ سری خروجی (مثل `ema21` یا `macd.signal`) */
  id: string;
  kind: "line" | "histogram" | "area";
  /** اسلات رنگ تم (هیچ رنگ هاردکدی) */
  colorKey: string;
  /** `true` ⇒ در پنل زیرین رسم شود (نه روی کندل) */
  pane?: boolean;
}

/** Descriptor رسمی (طبق تصویب) + افزودنی‌های لازم پروژه. */
export interface IndicatorDescriptor {
  id: string;
  category: IndicatorCategory;
  params: IndicatorParamSpec;
  compute: IndicatorComputeFn;
  outputs: IndicatorOutputSpec;
  /** افزودنی: نسخهٔ فرمول (provenance + کلید کش · D7/D12) */
  formulaVersion: string;
  /** افزودنی: سیاست مقیاس (قاعدهٔ «حداکثر یک مقیاس دیدنی») */
  scalePolicy: "overlay" | "pane" | "own";
}
