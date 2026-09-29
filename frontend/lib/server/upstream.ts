/**
 * upstream.ts — helper مشترک proxy (server-only).
 * - آدرس بک‌اند فقط سمت سرور خوانده می‌شود (env).
 * - allowlist برای مسیرهای واقعی بک‌اند ماکرو.
 * - timeout کنترل‌شده + پاسخ خطای یکنواخت.
 *
 * مسیرهای واقعی بک‌اند (collector/macro/backend/http.cjs):
 *   /api/health, /api/groups,
 *   /api/inflation, /api/growth, /api/labor,
 *   /api/group/<key>   (key: 1A_inflation | 1B_growth | 1C_labor | inflation | growth | labor)
 *   /api/country/<ISO3>, /api/countries
 *
 * پارامترهای query پشتیبانی‌شدهٔ بک‌اند (picker_lib.buildGroup):
 *   mode=countries  → انتخاب country-first (یک سری برای هر کشور) ⇒ ۱۷ کشور
 *   limit=<n>       → سقف تعداد سری (پیش‌فرض MAX_SERIES=12)
 *   canon / group   → برای مسیرهای آیندهٔ canon-first
 * پارامترهای مجاز با allowlist جداگانه پالایش می‌شوند (normalizeQuery).
 */

export const MACRO_API_BASE =
  process.env.MACRO_API_BASE ?? "http://127.0.0.1:4001";

export const API_TIMEOUT_MS =
  Number(process.env.MACRO_API_TIMEOUT_MS ?? 5000) || 5000;

/** مسیرهای مجاز بک‌اند ماکرو (allowlist). */
export const ALLOWED_PATHS = new Set<string>([
  "health",
  "groups",
  "inflation",
  "inflation-sub",
  "growth",
  "labor",
  // P3 (2026-09-22): نرخ سیاستی بانک مرکزی (canon: POLICY_RATE)
  "monetary",
  "countries",
  "group/1A_inflation",
  // P1 (2026-09-20): زیرشاخص‌های COICOP + وزن سبد (canonicals: CPI_SUB / CPI_WEIGHTS)
  "group/1A2_inflation_sub",
  "group/inflation_sub",
  "group/1B_growth",
  "group/1C_labor",
  "group/inflation",
  "group/inflation-sub",
  "group/growth",
  "group/labor",
  // P3 (2026-09-22): نرخ سیاستی (Policy Rate) — گروه 1D_monetary
  "group/1D_monetary",
  "group/monetary",
  // P4-Growth (2026-09-22): رشد فصلی GDP — گروه 1E_growth_core
  "growth-core",
  "group/1E_growth_core",
  "group/growth_core",
  // P5-Financial (2026-09-23): بازار جهانی — گروه 1F_market
  "market",
  "group/1F_market",
  "group/market",
]);

/** کلیدهای query مجاز (allowlist). */
export const ALLOWED_QUERY_KEYS = new Set<string>([
  "mode",
  "limit",
  "canon",
  "group",
]);

/** مقادیر مجاز `mode` مطابق picker_lib (`countries` در برابر پیش‌فرض sources). */
export const ALLOWED_MODES = new Set<string>(["countries", "sources"]);

/** سقف سختِ `limit` (payload نباید بی‌مرز شود). */
export const MAX_LIMIT = 60;

export interface ProxyResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** ساخت پاسخ خطای یکنواخت (502/404/400/500). */
export function errorBody(message: string, status: number, detail?: string) {
  return { error: message, status, detail };
}

/**
 * نرمال‌سازی و پالایش پارامترهای query.
 * - کلیدهای خارج از allowlist حذف می‌شوند (بی‌صدا، برای امنیت/پایداری UI).
 * - `mode` فقط مقادیر مجاز، `limit` فقط عدد صحیح مثبت ≤ MAX_LIMIT.
 */
export function normalizeQuery(
  input?: URLSearchParams | Record<string, unknown> | null,
): URLSearchParams {
  const out = new URLSearchParams();
  if (!input) return out;

  const entries: [string, string][] =
    input instanceof URLSearchParams
      ? [...input.entries()]
      : Object.entries(input)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)]);

  for (const [key, raw] of entries) {
    if (!ALLOWED_QUERY_KEYS.has(key)) continue;
    const value = String(raw).trim();
    if (!value) continue;

    if (key === "mode" && !ALLOWED_MODES.has(value)) continue;
    if (key === "limit") {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) continue;
      out.set("limit", String(Math.min(Math.floor(n), MAX_LIMIT)));
      continue;
    }
    out.set(key, value);
  }
  return out;
}

/** ساخت URL نهایی بک‌اند (فقط با پارامترهای مجاز). */
export function buildUpstreamUrl(
  segments: string[],
  query?: URLSearchParams | Record<string, unknown> | null,
): string {
  const joined = segments.join("/");
  const q = normalizeQuery(query).toString();
  return `${MACRO_API_BASE}/api/${joined}${q ? `?${q}` : ""}`;
}

/**
 * خواندن یک مسیر مجاز از بک‌اند ماکرو.
 * هرگز خطا throw نمی‌کند؛ همیشه یک ProxyResult برمی‌گرداند.
 */
export async function fetchMacroPath(
  segments: string[],
  query?: URLSearchParams | Record<string, unknown> | null,
): Promise<ProxyResult> {
  const joined = segments.join("/");

  if (!ALLOWED_PATHS.has(joined)) {
    return {
      ok: false,
      status: 404,
      body: errorBody("path not allowed", 404, joined),
    };
  }

  const url = buildUpstreamUrl(segments, query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      // proxy: کش کوتاه برای پایداری UI
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        body: errorBody("upstream error", 502, `HTTP ${res.status} @ ${joined}`),
      };
    }

    const body = await res.json();
    return { ok: true, status: 200, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      ok: false,
      status: 502,
      body: errorBody("upstream unreachable", 502, msg),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * خواندن یک گروه ماکرو با پارامترهای مجاز.
 * مثال: `fetchMacroGroup("inflation", { mode: "countries", limit: 60 })`
 */
export async function fetchMacroGroup(
  path: string,
  query?: URLSearchParams | Record<string, unknown> | null,
): Promise<ProxyResult> {
  return fetchMacroPath([path], query);
}

/**
 * خواندن متادیتای کشور (هدف تورمی) از /api/country/<ISO3>.
 * همیشه یک ProxyResult برمی‌گرداند (هرگز throw).
 */
export async function fetchCountryMeta(iso3: string): Promise<ProxyResult> {
  const code = String(iso3 || "").toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(code)) {
    return { ok: false, status: 400, body: errorBody("bad country code", 400, code) };
  }
  const url = `${MACRO_API_BASE}/api/country/${code}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      // هدف تورمی از جدول مرجع می‌آید و به‌ندرت عوض می‌شود؛ ولی ۵ دقیقه
      // باعث می‌شد بعد از ثبت هدف جدید، چند دقیقه «هدف ندارد» دیده شود
      // (شاهد 2026-09-21) ⇒ ۶۰ ثانیه.
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        body: errorBody("upstream error", 502, `HTTP ${res.status} @ country/${code}`),
      };
    }
    return { ok: true, status: 200, body: await res.json() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      ok: false,
      status: 502,
      body: errorBody("upstream unreachable", 502, msg),
    };
  } finally {
    clearTimeout(timer);
  }
}
