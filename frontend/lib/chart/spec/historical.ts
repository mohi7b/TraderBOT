/**
 * H1 — HistoricalSpec v3.1 (بسط قرارداد v3 · بدون تغییر ماکرو)
 * frontend/lib/chart/spec/historical.ts
 * ============================================================
 * **چرا نسخهٔ جدا و نه bump کردن `CHART_SPEC_VERSION`؟**
 *   دامنهٔ ماکرو طبق تصمیم رسمی روی **۳.۰ قفل** شده و چهار چارتش با همان نسخه
 *   کار می‌کنند. اگر ثابت مشترک را بالا ببریم، `data-spec-version` چارت‌های ماکرو
 *   عوض می‌شود و تست قرارداد ۳.۰ می‌شکند. پس قرارداد تاریخی **افزودنی** است:
 *
 *       ChartSpecV3 (۳.۰ · بدون تغییر)
 *                 ▲
 *       HistoricalSpecV31 (۳.۱ · symbol/exchange/market/timeframe/overlays/panes)
 *
 * **قواعد ارث‌بری:** `MissingPolicy` (همان `N/A`) · `ScaleSpec` (یک مقیاس دیدنی
 * در هر پنل) · `provenance` اجباری برای هر اندیکاتور/سری مشتق · ولیدیتور سخت.
 * ============================================================
 */
import { CHART_SPEC_VERSION, type ChartSpecV3, type SpecValidation } from "./types";

/** نسخهٔ قرارداد دامنهٔ تاریخی. */
export const HISTORICAL_SPEC_VERSION = "3.2" as const;

/** بازار و صرافی (کلید `exchange` سرویس: `<venue>_<market>`). */
export interface HistoricalMarketSpec {
  asset: string;
  symbol: string;
  /** `ALL` = تجمیع همهٔ ونوها (پارامتر `exchange` فرستاده نمی‌شود) */
  venue: string;
  market: "spot" | "futures" | "all";
  /** کلید تایم‌فریم مجاز سرویس (1m…1y) */
  timeframe: string;
}

/** overlayهای روی کندل (H1: فقط `ema` و `sma`). */
export interface OverlaySpec {
  id: string;
  kind: "ma" | "ema" | "bb" | "vwap";
  /** دوره (برای `bb` = طول پنجره) */
  period: number;
  /** انحراف معیار (فقط `bb`) */
  deviation?: number;
  colorKey: string;
  scaleId?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  /** منشأ محاسبه — اجباری (ولیدیتور روی آن سخت است) */
  formulaId: string;
}

/** پنل‌های زیرین (H1: فقط `volume`). */
export interface PaneSpec {
  id: string;
  kind: "volume" | "rsi" | "macd" | "atr";
  /** نسبت ارتفاع پنل به کندل اصلی (۰..۱) */
  heightRatio: number;
  colorKey?: string;
}

/** قرارداد کامل دامنهٔ تاریخی = پایهٔ ۳.۰ + افزودنی‌های ۳.۱/۳.۲. */
export interface HistoricalSpecV31 {
  /** نسخهٔ پایه (۳.۰) و نسخهٔ این دامنه (۳.۲) — هر دو صریح */
  baseVersion: typeof CHART_SPEC_VERSION;
  specVersion: typeof HISTORICAL_SPEC_VERSION;
  key: string;
  market: HistoricalMarketSpec;
  /** چندانتخابی از ۳.۲ (پیش‌تر هم آرایه بود · قاعدهٔ «حداکثر یک مقیاس دیدنی» پابرجاست) */
  overlays: OverlaySpec[];
  /** چند پنل زیرین مجاز است (هر پنل مقیاس مخفی خودش) */
  panes: PaneSpec[];
  /** **افزودنی ۳.۲:** سیاست نمایش ساختار/سیگنال تأییدنشده */
  structure?: StructureSpec;
  /** بخش‌های مشترک با ماکرو (theme/layout/signals/series/missing/scales) */
  base: ChartSpecV3;
}

/**
 * **افزودنی ۳.۲ (D12):** provisional/confirmed.
 * هر رویداد ساختاری/سیگنالی `confirmedIndex` دارد (انضباط نگاه-به-آینده)؛ این
 * قرارداد تعیین می‌کند رویداد **تأییدنشده** روی چارت چه کند.
 */
export interface StructureSpec {
  /** فقط رویدادهای تأییدشده رسم شوند؟ (پیش‌فرض `false` = provisional کم‌رنگ) */
  confirmedOnly?: boolean;
  /** سبک رویداد تأییدنشده (پیش‌فرض `dim`) */
  provisionalStyle?: "dim" | "dashed" | "hidden";
  /**
   * الزام وجود `confirmedIndex` در خروجی تحلیل (پیش‌فرض `true`).
   * ⚠️ خاموش‌کردن آن = پذیرش نگاه-به-آینده؛ فقط با دلیل مستند مجاز است.
   */
  requireConfirmedIndex?: boolean;
}

/** قواعد سخت افزودنی دامنهٔ تاریخی (روی top قواعد ۳.۰). */
export function validateHistoricalSpec(spec: HistoricalSpecV31): SpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (spec.specVersion !== HISTORICAL_SPEC_VERSION) {
    errors.push(`specVersion="${spec.specVersion}" با نسخهٔ تاریخی (${HISTORICAL_SPEC_VERSION}) یکی نیست`);
  }
  if (spec.baseVersion !== CHART_SPEC_VERSION) {
    errors.push(`baseVersion="${spec.baseVersion}" با قرارداد ماکرو (${CHART_SPEC_VERSION}) یکی نیست`);
  }
  if (!spec.market.asset) errors.push("market.asset خالی است");
  if (!spec.market.symbol) errors.push("market.symbol خالی است");
  if (!spec.market.timeframe) errors.push("market.timeframe خالی است");
  if (!spec.market.venue) errors.push("market.venue خالی است (برای «کل بازار» مقدار ALL بدهید)");

  /** **افزودنی ۳.۲:** سیاست provisional/confirmed */
  if (spec.structure) {
    const st = spec.structure;
    if (st.requireConfirmedIndex === false) {
      warnings.push(
        "structure.requireConfirmedIndex=false ⇒ پذیرش نگاه-به-آینده (فقط با دلیل مستند مجاز است)",
      );
    }
    if (st.confirmedOnly && st.provisionalStyle === "dim") {
      errors.push("structure: confirmedOnly و provisionalStyle=dim هم‌زمان معنا ندارند");
    }
  }

  const ids = new Set<string>();
  for (const o of spec.overlays) {
    if (ids.has(o.id)) errors.push(`overlay تکراری: "${o.id}"`);
    ids.add(o.id);
    if (!o.formulaId) errors.push(`overlay "${o.id}" بدون formulaId (منشأ محاسبه)`);
    if (!Number.isFinite(o.period) || o.period < 2) {
      errors.push(`overlay "${o.id}" دورهٔ نامعتبر (حداقل ۲)`);
    }
    if (!o.colorKey) warnings.push(`overlay "${o.id}" بدون colorKey`);
  }
  const paneIds = new Set<string>();
  for (const p of spec.panes) {
    if (paneIds.has(p.id)) errors.push(`pane تکراری: "${p.id}"`);
    paneIds.add(p.id);
    const r = p.heightRatio;
    if (!Number.isFinite(r) || r <= 0 || r > 0.6) {
      errors.push(`pane "${p.id}" heightRatio خارج از بازهٔ ۰..۰٫۶`);
    }
  }
  return { errors, warnings };
}

/** نام قدیمی (سازگاری عقب‌رو با ۳.۱) — معادل `validateHistoricalSpec`. */
export const validateHistoricalSpecV31 = validateHistoricalSpec;
