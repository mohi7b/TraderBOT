/**
 * C3 — **مسیر API برای diff زندهٔ چارت** (Route Handler سمت سرور).
 * ============================================================
 * `GET /api/historical/tf?symbol=BTCUSDT&tf=1h&exchange=binance_spot[&since=<ms>]`
 *
 * چرا Route Handler و نه fetch مستقیم مرورگر:
 *  · سرویس تاریخی روی `127.0.0.1:4000` است و **از مرورگر در دسترس نیست** (و
 *    نباید باشد) ⇒ درخواست باید سمت سرور انجام شود.
 *  · **allowlist دقیق** (اصل پروژه): فقط `symbol` · `tf` · `exchange` · `since`.
 *  · `If-None-Match` از مرورگر عبور داده می‌شود و **۳۰۴ بدون بدنه** مستقیم
 *    برگردانده می‌شود ⇒ هزینهٔ «تغییری نیست» ≈ صفر بایت.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  ALL_VENUES,
  HISTORICAL_TIMEFRAMES,
  HISTORICAL_VENUES,
  type VenueKey,
} from "@/lib/historical/services";
import { fetchHistoricalCandles } from "@/lib/server/historical";

export const dynamic = "force-dynamic";

/** نمادهای مجاز (همان الگوی رجیستری دامنه: حروف/رقم بزرگ، بدون خط تیره). */
const SYMBOL_RE = /^[A-Z0-9]{5,20}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get("symbol") ?? "").trim().toUpperCase();
  const tf = (sp.get("tf") ?? "").trim();
  const exchangeParam = sp.get("exchange");
  const sinceRaw = sp.get("since");

  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ ok: false, error: "symbol نامعتبر (allowlist دامنه)" }, { status: 400 });
  }
  if (!HISTORICAL_TIMEFRAMES.some((t) => t.key === tf)) {
    return NextResponse.json({ ok: false, error: "tf نامعتبر (allowlist دامنه)" }, { status: 400 });
  }
  const knownVenue = exchangeParam && HISTORICAL_VENUES.some((v) => v.key === exchangeParam);
  const venue: VenueKey = knownVenue ? (exchangeParam as VenueKey) : ALL_VENUES;

  const since = Number(sinceRaw);
  const result = await fetchHistoricalCandles({
    asset: symbol,
    symbol,
    venue,
    tf,
    since: Number.isInteger(since) && since > 0 ? since : undefined,
    etag: req.headers.get("if-none-match") ?? undefined,
  });

  /**
   * **حالت سبک (`light=1`) برای poll زنده:** فقط متادیتا/`diff`/`forming`/ETag
   * برگردانده می‌شود و آرایه‌های سنگین (`candles`/`closed`) حذف می‌شوند.
   * ⚠️ چرا مهم است: پیش‌تر هر poll کل ~۱٫۹MB کندل را جابه‌جا می‌کرد ✗ در حالی
   * که poller فقط `diff`/`etag`/`forming` را می‌خواند ⇒ payload به چند KB می‌رسد ✓
   */
  const light = sp.get("light") === "1";

  /** «تغییری نیست» ⇒ ۳۰۴ بدون بدنه (همان قرارداد سرویس تاریخی) */
  if (result.notModified) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: result.etag ?? "", "Cache-Control": "no-cache" },
    });
  }

  const payload = light
    ? {
        ok: result.ok,
        etag: result.etag ?? null,
        meta: result.meta,
        forming: result.forming ?? null,
        diff: (result as { diff?: unknown }).diff ?? null,
        light: true,
      }
    : result;

  return NextResponse.json(payload, {
    status: result.ok ? 200 : 502,
    headers: {
      "Cache-Control": "no-cache",
      ...(result.etag ? { ETag: result.etag } : {}),
    },
  });
}
