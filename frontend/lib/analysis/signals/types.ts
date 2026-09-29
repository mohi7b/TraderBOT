/**
 * AL — قرارداد سیگنال‌ها (فاز A2)
 * frontend/lib/analysis/signals/types.ts
 * ============================================================
 * سیگنال = **رویداد** (نه سری): یک نقطهٔ زمانی روی کندل‌ها.
 *   · `index` برای اتصال به کندل (low/high برای جای‌گیری مارکر)
 *   · `t` زمان محور (ثانیه) — همان عددی که به چارت داده شده
 *   · `tone` فقط **معنا** است؛ رنگ در تم تعیین می‌شود (بدون رنگ هاردکد)
 *   · `hintKey` در Descriptor برای tooltip (i18n، بدون متن ثابت)
 * ============================================================
 */
import type { IndicatorParamSpec, OHLC } from "../indicators/types";

/** تُن معنایی سیگنال (رنگ از اسلات‌های تم). */
export type SignalTone = "pos" | "neg" | "warn" | "risk" | "info" | "neutral";

/** یک رویداد سیگنال. */
export interface SignalEvent {
  /** شناسهٔ سیگنال (کلید رجیستری) */
  kind: string;
  /** ایندکس کندل */
  index: number;
  /**
   * **انضباط نگاه-به-آینده:** ایندکسی که رویداد در آن *قطعی* می‌شود.
   * برای الگوهای کندلی = `index` · برای پیوت‌محورها (دایورجنس/ساختار) =
   * `index + pivot`. مصرف‌کننده نباید پیش از این ایندکس به رویداد اتکا کند.
   */
  confirmedIndex?: number;
  /** زمان محور (ثانیه) */
  t: number;
  tone: SignalTone;
  /** برچسب کوتاه اختیاری (مثلاً «GC») */
  label?: string;
  /** مقدار همراه (z-score، دامنه، فاصله…) */
  value?: number;
  /** اطلاعات تکمیلی برای tooltip (اعداد/رشته‌های کوتاه) */
  meta?: Record<string, number | string>;
}

/** ورودی یکنواخت محاسبهٔ سیگنال. */
export interface SignalInput {
  times: number[];
  closes: number[];
  candles?: OHLC[];
  /** سری‌های اندیکاتور از AL (کلید = شناسهٔ سری مثل `rsi14`) */
  series?: Record<string, (number | null)[]>;
  params: Record<string, number>;
}

export type SignalComputeFn = (input: SignalInput) => SignalEvent[];

/** دستهٔ رسمی سیگنال. */
export type SignalCategory = "structure" | "momentum" | "volume" | "volatility" | "pattern";

/** Descriptor رسمی سیگنال. */
export interface SignalDescriptor {
  id: string;
  category: SignalCategory;
  params: IndicatorParamSpec;
  compute: SignalComputeFn;
  /** نسخهٔ فرمول (provenance + کلید کش · D7/D12) */
  formulaVersion: string;
  /** کلید i18n tooltip (`al.signals.<id>.hint`) */
  hintKey: string;
  /** تُن پیش‌فرض (رنگ از تم، نه از دامنه) */
  tone: SignalTone;
  /** برچسب کوتاه پیش‌فرض (برچسب نهایی از i18n می‌آید) */
  labelKey: string;
}
