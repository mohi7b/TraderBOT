/**
 * ⛔ **مسیر قدیم — منسوخ ✓ (ریدایرکت دائمی)**
 * frontend/app/dashboard/historical/crypto/page.tsx
 * ============================================================
 * ساختار مسیرها به شکل استاندارد کوتاه رفت ✓:
 *   `/dashboard/historical/crypto?asset=BTCUSDT&…`
 *     ⇒ `/crypto/BTCUSDT/chart/candles?…` ✓
 * دلیل: فقط کندل تاریخی نداریم؛ heatmap · liquidations · depth · delta · oi ·
 * trades · orderbook · realtime · simulated هم می‌آیند ✓ ⇒ دستهٔ مادر `crypto` ✓،
 * سطح دوم `pair` ✓ و سطح سوم `chart` ✓ (مثل TradingView/Binance ✓).
 * این فایل **هرگز داده رندر نمی‌کند** ✗ — فقط همهٔ پارامترها را می‌برد و
 * `redirect()` می‌کند ✓ (بوکمارک‌ها و اسکریپت‌های قدیمی نمی‌شکنند ✓).
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 🆕 مقصد نهایی: `/{market}/{pair}/{datatype}` ✓ (سطح ۱..۳) */
const MARKET = "crypto";
const DATATYPE = "candles";

export default async function LegacyHistoricalCryptoRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp?.[k];
    return typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "";
  };
  const pair = (pick("asset") || "BTCUSDT").trim().toUpperCase();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (k === "asset") continue;              // ⇒ به path منتقل شد ✓
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") q.set(k, String(v[0]));
  }
  const tail = q.toString();
  redirect(`/${encodeURIComponent(MARKET)}/${encodeURIComponent(pair)}/${DATATYPE}${tail ? `?${tail}` : ""}`);
}
