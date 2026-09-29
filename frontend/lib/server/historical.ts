/**
 * H1 — Server-side service for the Historical domain
 * frontend/lib/server/historical.ts
 * ============================================================
 * **چرا سمت سرور؟** مثل ماکرو، صفحه Server Component است و داده را مستقیم از
 * سرویس عقب می‌گیرد ⇒ کلاینت هیچ آدرس/پورتی نمی‌بیند و درخواستی از مرورگر به
 * سرویس تاریخی نمی‌رود.
 *
 * **قواعد:** (۱) فقط مسیرهای allowlist (`tf` · `summary`) · (۲) فقط پارامترهای
 * مجاز (`exchange` · `from` · `to`) · (۳) **هرگز throw نمی‌کند** ⇒ `{ok:false}`
 * تا صفحه پیام اختصاصی بدهد (D4) · (۴) کش کوتاه‌مدت حافظه‌ای (TTL ۴۵s، بدون
 * جدول جدید) · (۵) داده **خام UTC** برمی‌گردد؛ اصلاح مرز NY فقط در TAMC (D6).
 * ============================================================
 */
import {
  ALL_VENUES,
  HISTORICAL_API_BASE,
  HISTORICAL_CACHE,
  tfWidthMs,
  type VenueKey,
} from "@/lib/historical/services";
import type { RawCandle } from "@/lib/historical/timeBoundary";

/** مسیرهای مجاز سرویس تاریخی (اولین قطعهٔ مسیر). */
export const HISTORICAL_ALLOWED_PATHS = new Set<string>(["tf", "summary"]);
/** پارامترهای query مجاز. */
export const HISTORICAL_ALLOWED_QUERY_KEYS = new Set<string>(["exchange", "from", "to", "since"]);

export interface HistoricalMeta {
  asset: string;
  venue: VenueKey;
  tf: string;
  from: number | null;
  to: number | null;
  /** `true` ⇒ پنجره به سقف D2/D3 برش خورد (گزارش خود سرور) */
  clamped: boolean;
  /** **C1:** پنجره روی آخرین دادهٔ موجود لنگر شد؟ (دادهٔ عقب‌مانده) */
  anchored: boolean;
  /** **C1:** آخرین کندل موجود (ms) — از پاسخ سرور */
  latestTimestamp: number | null;
  /** **C1:** عقب‌ماندگی داده (ثانیه) — از پاسخ سرور */
  lagSeconds: number | null;
  /** زمان پاسخ سرویس (ms) */
  ms: number;
  /** `true` ⇒ از کش حافظه خوانده شد */
  cached: boolean;
  /** پیام خطای خوانا برای UI (فقط وقتی ok=false) */
  error?: string;
}

export interface HistoricalCandlesResult {
  ok: boolean;
  candles: RawCandle[];
  /**
   * **C2 — کندل‌های بسته‌شده (مبنای AL):** از `data.closed` سرور (S1/S2).
   * `undefined` ⇒ شکل پاسخ قدیمی بود ⇒ مصرف‌کننده به `candles` برمی‌گردد.
   */
  closed?: RawCandle[];
  /** **C2 — کندل در حال تشکیل (provisional):** از `data.forming` (می‌تواند `null` باشد) */
  forming?: RawCandle | null;
  /** **C3:** پاسخ ۳۰۴ (بدون تغییر) — بدنه‌ای نیامده و باید از کش/حالت قبلی استفاده شود */
  notModified?: boolean;
  /** **C3:** ETag پاسخ `/tf` (برای درخواست شرطی بعدی) */
  etag?: string | null;
  /**
   * **C3 — diff:** با `since` پر می‌شود (`appended` + `revisedTail`)؛ مسیر زندهٔ
   * پولر فقط همین را می‌خواند (پاسخ `light=1` هیچ `candles` ندارد ✓).
   */
  diff?: {
    since: number;
    appended: RawCandle[];
    revisedTail: RawCandle | null;
  } | null;
  meta: HistoricalMeta;
}

/**
 * **C4 — کش LRU کلاینت (سطح پروسه):**
 *  · **ظرفیت نماد:** `HISTORICAL_CACHE_MAX_SYMBOLS` (پیش‌فرض **۳**) — با ورود
 *    نماد چهارم، **قدیمی‌ترین نماد** (LRU) کامل تخلیه می‌شود (همهٔ تایم‌فریم‌ها).
 *  · **TTL:** `HISTORICAL_CACHE_TTL_MS` (پیش‌فرض ۳۰s) — اعتبارسنجی زمانی.
 *  · **اعتبارسنجی محتوایی:** `latestTimestamp` هر ورودی ذخیره می‌شود تا
 *    مصرف‌کننده بداند داده مربوط به کدام کندل است (diff/`since` از همین می‌آید).
 *  · **LRU واقعی:** `Map` ترتیب درج را نگه می‌دارد ⇒ هر خواندن = انتقال به MRU.
 *  · شمارنده‌ها (`hits/misses/evictions/expired`) برای گزارش صادقانهٔ سود کش.
 */
export interface HistoricalCacheConfig {
  /** حداکثر تعداد **نماد** نگه‌داشته‌شده در RAM */
  maxSymbols: number;
  /** عمر مجاز هر ورودی (ms) */
  ttlMs: number;
}

export const HISTORICAL_CLIENT_CACHE: HistoricalCacheConfig = Object.freeze({
  maxSymbols: Number(process.env.HISTORICAL_CACHE_MAX_SYMBOLS ?? 3),
  ttlMs: Number(process.env.HISTORICAL_CACHE_TTL_MS ?? 30_000),
});

interface CachedEntry {
  at: number;
  /** برای سیاست LRU نمادمحور (تخلیهٔ کامل یک نماد) */
  symbol: string;
  candles: RawCandle[];
  closed: RawCandle[];
  forming: RawCandle | null;
  /** آخرین کندل موجود در این ورودی (اعتبارسنجی محتوایی/`since`) */
  latestTimestamp: number | null;
  /**
   * **C4 — متادیتای تصمیم‌گرفته‌شده در سرور** که باید روی **cache-hit** هم
   * بازگردد (باگ واقعی: پیش‌تر پنجرهٔ سرور ذخیره نمی‌شد ⇒ `data-hist-window` روی
   * مسیر کش `none` می‌شد و پاسخ کش با پاسخ miss ناهمگون بود).
   */
  serverMeta: Pick<
    HistoricalMeta,
    "from" | "to" | "clamped" | "anchored" | "latestTimestamp" | "lagSeconds"
  >;
}

/** کش درون‌پروسهای (Map = ترتیب درج ⇒ LRU با re-set) */
const cache = new Map<string, CachedEntry>();
const cacheStats = { hits: 0, misses: 0, evictions: 0, expired: 0 };

/** آمار کش برای گزارش/دیباگ (بدون افشای داده). */
export function historicalCacheStats(): {
  size: number;
  symbols: string[];
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
} {
  return {
    size: cache.size,
    symbols: [...new Set([...cache.values()].map((e) => e.symbol))],
    ...cacheStats,
  };
}

function evictLruSymbol(protectedSymbol: string): void {
  /** قدیمی‌ترین ورودی که به نماد تازه تعلق ندارد ⇒ کل آن نماد تخلیه می‌شود */
  for (const entry of cache.values()) {
    if (entry.symbol === protectedSymbol) continue;
    const victim = entry.symbol;
    for (const [k, e] of cache) {
      if (e.symbol === victim) {
        cache.delete(k);
        cacheStats.evictions += 1;
      }
    }
    return;
  }
}

function readCache(key: string): CachedEntry | null {
  const hit = cache.get(key);
  if (!hit) {
    cacheStats.misses += 1;
    return null;
  }
  if (Date.now() - hit.at > HISTORICAL_CLIENT_CACHE.ttlMs) {
    cache.delete(key);
    cacheStats.expired += 1;
    cacheStats.misses += 1;
    return null;
  }
  /** MRU: خواندن = انتقال به انتهای Map */
  cache.delete(key);
  cache.set(key, hit);
  cacheStats.hits += 1;
  return hit;
}

function writeCache(key: string, entry: Omit<CachedEntry, "at">): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), ...entry });
  /** سیاست ظرفیت: نمادهای یکتا ≤ maxSymbols (LRU نمادمحور، تکرار تا رسیدن به سقف) */
  let symbols = new Set([...cache.values()].map((e) => e.symbol));
  while (symbols.size > Math.max(1, HISTORICAL_CLIENT_CACHE.maxSymbols)) {
    const before = cache.size;
    evictLruSymbol(entry.symbol);
    if (cache.size === before) break; // محافظ در برابر حلقهٔ بی‌نهایت
    symbols = new Set([...cache.values()].map((e) => e.symbol));
  }
}

/** نگاشت ردیف خام سرویس به `RawCandle` با اعتبارسنجی عددی (بدون مقدار ساختگی). */
export function toCandle(row: Record<string, unknown>): RawCandle | null {
  const rawTs = Number(row.timestamp);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  if (![rawTs, open, high, low, close].every((v) => Number.isFinite(v))) return null;
  /**
   * ⚠️ **یکای زمان:** TAMC با **میلی‌ثانیه** کار می‌کند (مثل `TimeShift` و
   * `Date.UTC`)، ولی سرویس تاریخی ممکن است ثانیه بدهد. نگهبان یکا: هر مقدار
   * کمتر از `1e11` ثانیه است (۱۰^۱۱ ثانیه ≈ سال ۵۱۳۸) ⇒ ×۱۰۰۰ می‌شود.
   * این تبدیل **فقط یک‌بار در مرز ورود داده** انجام می‌شود (نه در هر لایه).
   */
  const timestamp = rawTs < 1e11 ? rawTs * 1000 : rawTs;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: num(row.volume),
    quoteVolume: num(row.quote_volume ?? row.quoteVolume),
    trades: num(row.number_of_trades ?? row.trades),
    ...(typeof row.exchange === "string" ? { exchange: row.exchange } : {}),
  };
}

/**
 * استخراج آرایهٔ کندل از پاسخ سرویس — **شکل واقعی**:
 *   `{ ok:true, data:{ symbol, tf, count, candles:[{timestamp,time,open,high,
 *    low,close,volume,quote_volume,trades}] } }`
 * تحمل‌پذیری برای حالت‌های دیگر (`data` آرایه یا پاسخ خام آرایه) نگه داشته شده
 * تا تغییر کوچک envelope، چارت را بی‌داده نکند.
 * ⚠️ **باگ واقعی همین نشست:** فقط `data` آرایه بررسی می‌شد و شکل واقعی
 *    (`data.candles`) خوانده نمی‌شد ⇒ چارت همیشه خالی می‌شد (با HTTP 200).
 */
export function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const asObj = payload as { data?: unknown; candles?: unknown } | null;
  if (!asObj || typeof asObj !== "object") return [];
  const data = asObj.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const fromCandles = (data as { candles?: unknown } | null)?.candles ?? asObj.candles;
  if (Array.isArray(fromCandles)) return fromCandles as Record<string, unknown>[];
  return [];
}

/**
 * خواندن کندل‌های یک (asset · venue · tf).
 * **C1:** کلاینت پنجره **نمی‌سازد**. اگر `from`/`to` صریح داده شوند همان‌ها
 * ارسال می‌شوند؛ در غیر این صورت (`null`) **سرور** پنجرهٔ مجاز را می‌سازد، روی
 * آخرین دادهٔ موجود لنگر می‌کند و ما `window`/`anchored`/`latestTimestamp`/
 * `lagSeconds` را از **گزارش خودِ سرور** می‌خوانیم.
 */
export async function fetchHistoricalCandles(input: {
  asset: string;
  symbol?: string;
  venue: VenueKey;
  tf: string;
  /**
   * **C1/C3:** `from`/`to` اختیاری (سرور پنجره را می‌سازد) · `since` برای diff ·
   * `etag` برای درخواست شرطی (۳۰۴ بدون بدنه).
   */
  from?: number;
  to?: number;
  /** **C3:** آخرین `latestTimestamp` کلاینت (epoch-ms) — پاسخ diff */
  since?: number;
  /** **C3:** ETag قبلی برای `If-None-Match` (۳۰۴ = بدون تغییر) */
  etag?: string;
  /** @deprecated **C1** — زمان با ساعت سرور تعیین می‌شود؛ نگه‌داشته برای سازگاری */
  nowMs?: number;
}): Promise<HistoricalCandlesResult> {
  const symbol = (input.symbol ?? input.asset).toUpperCase();
  /** فقط مقادیر صحیح صریح ارسال می‌شوند؛ `null` ⇒ تصمیم با سرور (C1) */
  const reqFrom = Number.isInteger(input.from) ? Math.floor(input.from as number) : null;
  const reqTo = Number.isInteger(input.to) ? Math.floor(input.to as number) : null;
  const meta: HistoricalMeta = {
    asset: input.asset,
    venue: input.venue,
    tf: input.tf,
    from: reqFrom,
    to: reqTo,
    clamped: false,
    anchored: false,
    latestTimestamp: null,
    lagSeconds: null,
    ms: 0,
    cached: false,
  };

  const venueKey = input.venue === ALL_VENUES ? null : String(input.venue);
  const key = HISTORICAL_CACHE.keyOf({
    asset: input.asset,
    venue: input.venue,
    tf: input.tf,
    /** `0` = نگه‌دارندهٔ «پنجره با سرور» در کلید کش (به سرور ارسال نمی‌شود) */
    from: reqFrom ?? 0,
    to: reqTo ?? 0,
  });
  /**
   * **⚠️ باگ واقعی (کشف در سنجش payload):** کش درون‌پروسه‌ای کلیدش `since` را در
   * نظر **نمی‌گرفت** ⇒ یک پاسخ **بدون** `diff` (بار کامل) می‌توانست به درخواست
   * `since` دار سرو شود و `diff=null` برگرداند ✗. رفع: درخواست‌های diff از کش
   * درون‌پروسه‌ای **معاف** می‌شوند (هزینهٔ ساخت سنگین همچنان در کش **سرویس** با
   * کلید پنجره می‌ماند ✓ ⇒ فقط فیلتر O(n) سبک روی پاسخ کش‌شده انجام می‌شود ✓).
   */
  const useProcessCache = input.since === undefined;
  const hit = useProcessCache ? readCache(key) : null;
  if (hit) {
    return {
      ok: true,
      candles: hit.candles,
      closed: hit.closed,
      forming: hit.forming,
      etag: null,
      /** C4: متادیتای سرور هم از کش بازمی‌گردد (پاسخ کش ≙ پاسخ miss) */
      meta: { ...meta, ...hit.serverMeta, cached: true },
    };
  }

  /**
   * ساخت query **فقط از طریق allowlist** (`exchange` · `from` · `to`):
   * هر کلید دیگری (حتی اگر روزی اضافه شود) بی‌صدا حذف می‌شود.
   * ⚠️ **یکای پارامترها = epoch-milliseconds** — منبع حقیقت کد سرور است:
   *    `collector/crypto/historical/api/routes/tf-dynamic.cjs` («inclusive epoch-ms
   *    window» + `if (!Number.isInteger(n)) throw`). فرستادن ثانیه، پنجره را به
   *    سال ۱۹۷۰ می‌برد و سرویس **۰ کندل** برمی‌گرداند (باگ واقعی همین نشست).
   *    `Math.floor` هم لازم است چون `Number.isInteger` روی ms غیرصحیح خطا می‌دهد.
   */
  const wanted: Record<string, string | null> = {
    exchange: venueKey,
    /** `null` ⇒ پارامتر حذف می‌شود ⇒ **سرور** پنجره را تصمیم می‌گیرد (C1) */
    from: reqFrom === null ? null : String(reqFrom),
    to: reqTo === null ? null : String(reqTo),
    /** **C3:** آخرین `latestTimestamp` کلاینت ⇒ سرور فقط `diff` را می‌دهد */
    since: Number.isInteger(input.since) ? String(Math.floor(input.since as number)) : null,
  };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(wanted)) {
    if (v === null || !HISTORICAL_ALLOWED_QUERY_KEYS.has(k)) continue;
    params.set(k, v);
  }
  const url = new URL(
    `${HISTORICAL_API_BASE}/tf/${encodeURIComponent(symbol)}/${encodeURIComponent(input.tf)}`,
  );
  for (const [k, v] of params) url.searchParams.set(k, v);

  const started = Date.now();
  try {
    /**
     * **C3 — درخواست شرطی:** `If-None-Match` با ETag قبلی ⇒ اگر داده تازه نباشد
     * سرور **۳۰۴ بدون بدنه** میدهد. عمداً `cache: "no-store"` می‌ماند (تصمیم
     * تازه‌بودن با سرور است، نه با هیوریستیک مرورگر).
     */
    const res = await fetch(url, {
      cache: "no-store",
      ...(input.etag ? { headers: { "if-none-match": input.etag } } : {}),
    });
    if (res.status === 304) {
      meta.ms = Date.now() - started;
      return {
        ok: true,
        notModified: true,
        candles: [],
        closed: [],
        forming: null,
        etag: input.etag ?? null,
        meta: { ...meta, cached: true },
      };
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
      meta.ms = Date.now() - started;
      meta.error = msg;
      return { ok: false, candles: [], meta };
    }
    /**
     * **C1 — پنجره از گزارش سرور:** مقدارهای تصمیم‌گرفته‌شده در سرور
     * (`window`/`clamped`/`anchored`/`latestTimestamp`/`lagSeconds`) جایگزین
     * حدس کلاینت می‌شوند ⇒ یک منبع حقیقت (S1/S2).
     * ⚠️ فیلدهای خودِ route در **ریشهٔ** پاسخ‌اند و فیلدهای موتور
     *    (`count`/`latestTimestamp`/`lagSeconds`) زیر `data` ⇒ خواندن مقاوم از
     *    هر دو سطح (تا تغییر جای فیلد، متادیتا را بی‌صدا خراب نکند).
     */
    const root = (body as Record<string, unknown> | null) ?? {};
    const payload = (root as { data?: Record<string, unknown> }).data ?? {};
    /** فیلدهای خود route داخل `data.meta` هستند (پروب زنده: clamped/anchored/window) */
    const serverMeta = (payload.meta as Record<string, unknown> | undefined) ?? {};
    const pick = (k: string): unknown =>
      serverMeta[k] !== undefined ? serverMeta[k] : root[k] !== undefined ? root[k] : payload[k];
    const win = pick("window") as { from?: unknown; to?: unknown } | undefined;
    if (win) {
      meta.from = Number.isFinite(win.from) ? Number(win.from) : null;
      meta.to = Number.isFinite(win.to) ? Number(win.to) : null;
    }
    meta.clamped = Boolean(pick("clamped"));
    meta.anchored = Boolean(pick("anchored"));
    meta.latestTimestamp = Number.isFinite(pick("latestTimestamp"))
      ? Number(pick("latestTimestamp"))
      : null;
    meta.lagSeconds = Number.isFinite(pick("lagSeconds")) ? Number(pick("lagSeconds")) : null;
    const candles = extractRows(body)
      .map(toCandle)
      .filter((c): c is RawCandle => c !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
    /**
     * **C2 — تفکیک `closed`/`forming`:** سرور (S1/S2) هر دو را می‌دهد.
     *  · `closed` ⇒ مبنای AL (بدون repaint ساختار با کندل نیم‌کاره)
     *  · `forming` ⇒ فقط برای رندر provisional
     *  · اگر پاسخ شکل قدیمی داشت (`closed` نیست) ⇒ `closed = candles` (رفتار قبلی)
     */
    const asRows = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    const readList = (v: unknown): RawCandle[] =>
      asRows(v)
        .map(toCandle)
        .filter((c): c is RawCandle => c !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
    const closedRows = asRows(payload.closed);
    const closed = closedRows.length ? readList(payload.closed) : candles;
    const forming = payload.forming ? toCandle(payload.forming as Record<string, unknown>) : null;
    if (useProcessCache) {
      writeCache(key, {
        symbol,
        candles,
        closed,
        forming,
        /** C4: اعتبارسنجی محتوایی (diff/`since` از همین مقدار می‌آید) */
        latestTimestamp: meta.latestTimestamp,
        /** C4: متادیتای سرور برای بازپخش روی cache-hit */
        serverMeta: {
          from: meta.from,
          to: meta.to,
          clamped: meta.clamped,
          anchored: meta.anchored,
          latestTimestamp: meta.latestTimestamp,
          lagSeconds: meta.lagSeconds,
        },
      });
    }
    meta.ms = Date.now() - started;
    /** C2: سه‌گانهٔ صریح — `candles` = closed + forming (سازگاری عقب‌رو · D24) */
    return {
      ok: true,
      candles,
      closed,
      forming,
      meta,
      /** C3: پاسخ diff (اگر `since` داده شده باشد) */
      diff: (payload.diff as HistoricalCandlesResult["diff"]) ?? null,
      etag: res.headers.get("etag"),
    };
  } catch (e) {
    meta.ms = Date.now() - started;
    /** سرویس down است یا شبکه قطع ⇒ پیام اختصاصی UI، بدون کرش (D4) */
    meta.error = e instanceof Error ? e.message : "historical service unreachable";
    return { ok: false, candles: [], meta };
  }
}

/** عرض کندل (ms) برای شمارش گپ در TAMC. */
export const historicalTfWidthMs = tfWidthMs;
