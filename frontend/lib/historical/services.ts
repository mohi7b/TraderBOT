/**
 * Historical phase — Service registry (H1)
 * frontend/lib/historical/services.ts
 * ============================================================
 * **هدف (A6):** یک منبع حقیقت برای سرویس‌ها/پورت‌ها/دامنه/سقف‌ها/کش؛ هیچ
 * کامپوننتی آدرس یا پورت هاردکد نمی‌کند و افزودن بازار جدید فقط یک ورودی
 * همین‌جاست.
 *
 * واقعیت‌های تأییدشده از سرور (`collector/crypto/historical`):
 *   · `GET /tf/:symbol/:tf?exchange=&from=&to=` روی پورت **4000** · envelope `{ok,data}`
 *   · tfهای مجاز **lowercase** (`_engine/timeframe/utils.cjs#TIMEFRAMES`)
 *   · bucket‌ها **UTC epoch-aligned** ⇒ مرز روز فعلاً UTC است (نیاز به آپشن در کلکتور برای NY)
 *   · دادهٔ خام: `historical/crypto/<ASSET>/candles_1m.db` (فقط ۱ دقیقه، بدون مشتق)
 * ============================================================
 */

/** مسیر پروکسی فرانت (کلاینت ⇄ سرور Next). */
export const HISTORICAL_PROXY_PATH = "/api/historical";

/** آدرس مستقیم سرور تاریخی (فقط سمت سرور Next). */
export const HISTORICAL_API_BASE =
  process.env.HISTORICAL_API_BASE ?? "http://127.0.0.1:4000";

/** پورت پیش‌فرض سرور تاریخی (گزارش/دیاگنوستیک). */
export const HISTORICAL_API_PORT = Number(process.env.HISTORICAL_API_PORT ?? 4000);

/** بازارها (ساختار آینده‌نگر — فعلاً فقط crypto). */
export type HistoricalMarket = "crypto";

export interface AssetDef {
  asset: string;
  symbol: string;
  market: HistoricalMarket;
  label: string;
}

export const HISTORICAL_ASSETS: AssetDef[] = [
  { asset: "BTCUSDT", symbol: "BTCUSDT", market: "crypto", label: "Bitcoin / USDT" },
];

/**
 * **صرافی‌ها (A3)** — کلید `exchange` در API به‌شکل `<venue>_<market>`.
 * «کل بازار» (`ALL_VENUES`) یعنی بدون پارامتر `exchange` ⇒ تجمیع همهٔ ونوها (A4.1).
 */
export const ALL_VENUES = "__all__" as const;
export type VenueKey = typeof ALL_VENUES | string;

export interface VenueDef {
  key: VenueKey;
  label: string;
  market: "spot" | "futures" | "all";
}

export const HISTORICAL_VENUES: VenueDef[] = [
  { key: ALL_VENUES, label: "All venues (aggregated)", market: "all" },
  { key: "binance_spot", label: "Binance · Spot", market: "spot" },
  { key: "binance_futures", label: "Binance · Futures", market: "futures" },
  { key: "bybit_spot", label: "Bybit · Spot", market: "spot" },
  { key: "bybit_futures", label: "Bybit · Futures", market: "futures" },
  { key: "okx_spot", label: "OKX · Spot", market: "spot" },
  { key: "okx_futures", label: "OKX · Futures", market: "futures" },
  { key: "kucoin_spot", label: "KuCoin · Spot", market: "spot" },
  { key: "kucoin_futures", label: "KuCoin · Futures", market: "futures" },
  { key: "bitget_spot", label: "Bitget · Spot", market: "spot" },
  { key: "bitget_futures", label: "Bitget · Futures", market: "futures" },
];

export interface TimeframeDef {
  key: string;
  label: string;
  widthMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * **تایم‌فریم‌ها (A5)** — نگاشت برچسب UI به کلید مجاز سرور.
 * ⚠️ `2Y` در موتور پشتیبانی **نمی‌شود** (کلید `2y` وجود ندارد) ⇒ ثبت در
 *    `HISTORICAL_TF_UNSUPPORTED` و حذف از فهرست UI.
 */
export const HISTORICAL_TIMEFRAMES: TimeframeDef[] = [
  { key: "1m", label: "1m", widthMs: MIN },
  { key: "5m", label: "5m", widthMs: 5 * MIN },
  { key: "15m", label: "15m", widthMs: 15 * MIN },
  { key: "1h", label: "1h", widthMs: HOUR },
  { key: "4h", label: "4h", widthMs: 4 * HOUR },
  { key: "1d", label: "1D", widthMs: DAY },
  { key: "5d", label: "5D", widthMs: 5 * DAY },
  { key: "1w", label: "W", widthMs: 7 * DAY },
  { key: "1mo", label: "M", widthMs: 30 * DAY },
  { key: "1y", label: "Y", widthMs: 365 * DAY },
];

export const HISTORICAL_TF_UNSUPPORTED = ["2y"] as const;

/** پیش‌فرض‌های UI. */
export const HISTORICAL_DEFAULTS = {
  asset: "BTCUSDT",
  venue: ALL_VENUES as VenueKey,
  timeframe: "1h",
  /** همان ماکرو: ۳٫۵ سال نمایش + یک سال فضای آینده */
  zoom: "3Y6M" as const,
} as const;

/**
 * **سقف‌ها (D2/D3)** — برای چالاکی سرور و payload سبک:
 *   · سقف کندل هر درخواست = **۵٬۰۰۰** (≈۷۰KB JSON)
 *   · سقف پنجره: `1m`=۷روز · `5m`=۶۰روز · `15m`=۱۸۰روز · `1h`=۲سال · `4h`=۶سال · بالاتر=کامل
 * اگر بازه از سقف بگذرد سرویس **به عقب برش** می‌زند (نه خطا) و `clamped:true` می‌دهد.
 */
export const HISTORICAL_LIMITS = {
  maxCandles: 5_000,
  maxWindowMsByTf: {
    "1m": 7 * DAY,
    "5m": 60 * DAY,
    "15m": 180 * DAY,
    "1h": 2 * 365 * DAY,
    "4h": 6 * 365 * DAY,
  } as Record<string, number>,
} as const;

/** مرز بسته‌شدن کندل روزانه و بالاتر (D6). */
export const HISTORICAL_DAY_BOUNDARY = {
  /** پیاده‌شدهٔ فعلی موتور (`bucketFloor` روی UTC) */
  current: "utc" as const,
  /** مرز موردنظر دامنه («کلوز نیویورک») — نیازمند آپشن در `_engine/timeframe/utils.cjs` */
  target: "ny" as const,
} as const;

/**
 * **کش کوتاه‌مدت (A8)** — بدون جدول جدید؛ فقط حافظهٔ پروسهٔ Next.
 * عمر ۴۵ ثانیه (< فاصلهٔ کندل ۱ دقیقه‌ای) تا چارت تازه بماند ولی هر درخواست
 * کاربر به DB ۴٫۳GB نخورد. کلید = asset|venue|tf|from|to.
 */
export const HISTORICAL_CACHE = {
  ttlMs: 45_000,
  keyOf: (p: { asset: string; venue: VenueKey; tf: string; from: number; to: number }) =>
    `${p.asset}|${p.venue}|${p.tf}|${p.from}|${p.to}`,
} as const;

/** عرض کندل به ms (پیش‌فرض ۱ ساعت). */
export function tfWidthMs(tf: string): number {
  return HISTORICAL_TIMEFRAMES.find((t) => t.key === tf)?.widthMs ?? HOUR;
}

/**
 * پنجرهٔ نهایی درخواست پس از اعمال سقف‌ها (به عقب برش می‌زند، خطا نمی‌دهد).
 * @param toMs اگر NaN/undefined باشد ⇒ `now`
 */
export function clampWindow(
  tf: string,
  fromMs: number,
  toMs: number,
  nowMs = Date.now(),
): { from: number; to: number; clamped: boolean } {
  const to = Number.isFinite(toMs) ? toMs : nowMs;
  const width = tfWidthMs(tf);
  const windowCap = HISTORICAL_LIMITS.maxWindowMsByTf[tf] ?? Number.POSITIVE_INFINITY;
  const candleCap = HISTORICAL_LIMITS.maxCandles * width;
  const allowed = Math.min(windowCap, candleCap);
  const span = Math.max(0, to - fromMs);
  if (span <= allowed) return { from: fromMs, to, clamped: false };
  return { from: to - allowed, to, clamped: true };
}
