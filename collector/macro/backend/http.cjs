"use strict";

/**
 * ============================================================
 * Macro Backend — HTTP Layer (API-only)
 * File: collector/macro/backend/http.cjs
 * ============================================================
 * Framework-free Node `http` facade exposing ONLY JSON APIs.
 *
 * ARCHITECTURE RULE (non-negotiable):
 *   The macro backend serves NO UI — no HTML, no static files, no
 *   internal dashboards. All presentation lives in the standalone
 *   frontend (`frontend/`, Next.js, port 3000/3001). This module is
 *   API-only to prevent UI overlap and keep the backend legible.
 *
 * Routes (GET):
 *   --- Public API -------------------------------------------------
 *   /api/health                  -> liveness/readiness probe (JSON)
 *   /api/groups                  -> list group builders + endpoints
 *   /api/inflation               -> 1A_inflation payload
 *   /api/growth                  -> 1B_growth payload
 *   /api/labor                   -> 1C_labor payload
 *   /api/group/<key>             -> any group by short key
 *   /api/countries               -> inflation targets (main DB)
 *   /api/country/<ISO3>          -> one country's inflation target
 *   --- Developer tooling -----------------------------------------
 *   /health                      -> alias of /api/health (ops)
 *   /debug/macro                 -> sources/series/cache/groups/meta
 *   /api/docs                    -> minimal API explorer (dev only)
 *
 * Every response is JSON. CORS is open for local dev/admin.
 * ============================================================
 */

const http = require("http");
const path = require("path");

// Inflation targets live in the MAIN DB (macro.db).
const countryMeta = require("./core/country_meta.cjs");

const SERVICE = {
  name: "macro-backend",
  version: "2.0.0",
  api_only: true,
};

const builders = {
  inflation: {
    path: "/api/inflation",
    key: "1A_inflation",
canons: ["CPI", "CORE_CPI", "PPI", "GDP_DEFL"],
    title: "Inflation",
    build: null, // wired below to avoid circular require at top
  },
  // ---- P1 (2026-09-20): زیرشاخص‌های COICOP + وزن سبد ----
  // گروه جدا نگه داشته می‌شود تا ترکیب گروه اصلی (CPI/CORE_CPI/PPI/GDP_DEFL)
  // با سقف ۶۰ سری تغییر نکند و چارت‌های موجود دست‌نخورده بمانند.
  //   /api/group/1A2_inflation_sub   (یا /api/group/inflation_sub)
  inflation_sub: {
    path: "/api/inflation-sub",
    key: "1A2_inflation_sub",
    canons: ["CPI_SUB", "CPI_WEIGHTS"],
    title: "Inflation breakdown (COICOP sub-indices + weights)",
    build: null,
  },
  growth: {
    path: "/api/growth",
    key: "1B_growth",
    canons: ["GDP", "IND_PRO", "RETAIL_SALES"],
    title: "Growth",
    build: null,
  },
  // ---- P4 (2026-09-22): رشد فصلی (چارت GDP Growth) ----
  // canon اختصاصی `GDP_GROWTH`: OECD `GDP_VPV_YOY` (٪ سالانه) + `GDP_VPV_QOQ`
  // (٪ فصلی) + `GDP_YOY` + FRED `GDPC1` (سطح واقعی، فقط USA).
  // گروه مستقل تا ترکیب/سقف گروه‌های قبلی تغییر نکند.
  //   /api/growth-core   → ?mode=countries&canon=GDP_GROWTH&limit=60
  //   /api/group/1E_growth_core   (یا /api/group/growth_core)
  growthCore: {
    path: "/api/growth-core",
    key: "1E_growth_core",
    canons: ["GDP_GROWTH"],
    title: "Growth (quarterly GDP YoY/QoQ)",
    build: null,
  },
  // ---- P5 (2026-09-23): شاخص‌های بازار جهانی (چارت شرایط مالی / FAS) ----
  // ⚠️ این سری‌ها **کشوری نیستند** (VIX · DXY · S&P500 · اسپرد اعتباری · M2)
  //    و در چارت به‌عنوان شاخص جهانی برای هر کشور خوانده می‌شوند.
  //   /api/market   → ?canon=MARKET_GLOBAL&limit=60
  //   /api/group/1F_market   (یا /api/group/market)
  market: {
    path: "/api/market",
    key: "1F_market",
    canons: ["MARKET_GLOBAL"],
    title: "Global market (VIX · DXY · equity · credit · liquidity)",
    build: null,
  },
  labor: {
    path: "/api/labor",
    key: "1C_labor",
    canons: ["UNEMP", "EMP"],
    title: "Labor",
    build: null,
  },
  // ---- P3 (2026-09-22): نرخ سیاستی + بازدهی ۱۰ساله ----
  // گروه مستقل تا ترکیب/سقف گروه‌های قبلی تغییر نکند.
  //   /api/monetary   → ?mode=countries&canon=POLICY_RATE&limit=60
  //                     ?canon=YIELD_10Y  (سیگنال 📈 چارت تورمی)
  //   /api/group/1D_monetary   (یا /api/group/monetary)
  monetary: {
    path: "/api/monetary",
    key: "1D_monetary",
    canons: ["POLICY_RATE", "YIELD_10Y"],
    title: "Monetary policy (policy rate + 10Y yield)",
    build: null,
  },
};

function writeJSON(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function fail(res, status, error, message) {
  return writeJSON(res, status, { status: "error", error, message });
}

// ----------------------------------------------------------------
// Developer diagnostics (/debug/macro) — API-only backend has no UI,
// so this JSON endpoint replaces any internal dashboard.
// ----------------------------------------------------------------
const STARTED_AT = Date.now();

function debugMacro() {
  const out = {
    service: SERVICE.name,
    version: SERVICE.version,
    uptime_seconds: Math.round((Date.now() - STARTED_AT) / 1000),
    now: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      rss_mb: Math.round(process.memoryUsage().rss / 1048576),
    },
    databases: {
      main_db: countryMeta.MAIN_DB_PATH,
      core_db: path.join(__dirname, "..", "core_db", "core.db"),
    },
    groups: [],
  };

  try {
    const { buildGroup } = require("./picker.cjs");
    for (const g of Object.values(builders)) {
      let diag;
      try {
        const payload = buildGroup(g.key, g.canons, { title: g.title });
        diag = {
          key: g.key,
          title: g.title,
          canons: g.canons,
          ok: true,
          available: payload.available,
          series_count: payload.series_count,
          eligible_sources: payload.meta ? payload.meta.eligible_sources : null,
          max_series: payload.meta ? payload.meta.max_series : null,
          sources_seen: Array.from(new Set((payload.series || []).map((s) => s.dataset))),
          countries: Array.from(
            new Set((payload.series || []).map((s) => s.country && s.country.code)),
          ),
        };
      } catch (e) {
        diag = {
          key: g.key,
          title: g.title,
          canons: g.canons,
          ok: false,
          error: e && e.message ? e.message : String(e),
        };
      }
      out.groups.push(diag);
    }
  } catch (e) {
    out.groups_error = e && e.message ? e.message : String(e);
  }

  try {
    out.inflation_targets = { count: countryMeta.listTargets().length };
  } catch (e) {
    out.inflation_targets = { error: e && e.message ? e.message : String(e) };
  }

  return out;
}

// ----------------------------------------------------------------
// Minimal API explorer (/api/docs) — developer-only reference.
// ----------------------------------------------------------------
function apiDocs() {
  const list = Object.values(builders);
  const routes = [
    { method: "GET", path: "/api/health", desc: "liveness/readiness probe" },
    { method: "GET", path: "/api/groups", desc: "list group builders" },
    ...list.map((g) => ({
      method: "GET",
      path: g.path,
      desc: `payload for ${g.key} (${g.title})`,
      query: {
        mode: "countries | sources (default). countries = one series per major country",
        limit: "max series (integer, optional)",
      },
    })),
    {
      method: "GET",
      path: "/api/group/<key>",
      desc: "any group by short key (" + list.map((g) => g.key).join(" | ") + ")",
    },
    { method: "GET", path: "/api/countries", desc: "inflation targets (main DB)" },
    { method: "GET", path: "/api/country/<ISO3>", desc: "one country's inflation target" },
    { method: "GET", path: "/health", desc: "alias of /api/health (ops)" },
    { method: "GET", path: "/debug/macro", desc: "developer diagnostics" },
    { method: "GET", path: "/api/docs", desc: "this document" },
  ];
  return {
    service: SERVICE.name,
    version: SERVICE.version,
    api_only: true,
    note: "API-only backend. The UI lives in frontend/ (Next.js).",
    routes,
  };
}

function makeHandler() {
  // lazily resolve group payloads through the picker facade
  const list = Object.keys(builders).map((k) => builders[k]);

  return function handler(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    const rawUrl = String(req.url || "");
    const qIdx = rawUrl.indexOf("?");
    const url = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
    const query = new URLSearchParams(qIdx >= 0 ? rawUrl.slice(qIdx + 1) : "");

    // ---- health (both /health and /api/health) ------------------
    if (url === "/health" || url === "/api/health") {
      return writeJSON(res, 200, {
        status: "ok",
        service: SERVICE.name,
        version: SERVICE.version,
        api_only: true,
        groups: list.map((g) => g.key),
        uptime_seconds: Math.round((Date.now() - STARTED_AT) / 1000),
        time: new Date().toISOString(),
      });
    }

    // ---- developer tooling --------------------------------------
    if (url === "/debug/macro") {
      try {
        return writeJSON(res, 200, debugMacro());
      } catch (err) {
        return fail(res, 500, "DEBUG_FAILED", err && err.message ? err.message : String(err));
      }
    }
    if (url === "/api/docs" || url === "/debug/docs") {
      return writeJSON(res, 200, apiDocs());
    }

    if (url === "/api/groups") {
      return writeJSON(res, 200, {
        groups: list.map((g) => ({
          key: g.key,
          title: g.title,
          canonical_indicators: g.canons,
          endpoint: g.path,
        })),
      });
    }

    // --- Country meta (inflation targets) از MAIN DB (macro.db) ---
    if (url === "/api/countries") {
      try {
        return writeJSON(res, 200, { countries: countryMeta.listTargets() });
      } catch (err) {
        return fail(res, 500, "META_FAILED", err && err.message ? err.message : String(err));
      }
    }

    const countryMatch = /^\/api\/country\/([A-Za-z]{2,3})$/.exec(url);
    if (countryMatch) {
      try {
        const iso = countryMatch[1].toUpperCase();
        const row = countryMeta.getTarget(iso);
        return writeJSON(res, 200, {
          country: iso,
          inflation_target_low: row ? row.low : null,
          inflation_target_high: row ? row.high : null,
          note: row ? row.note : null,
        });
      } catch (err) {
        return fail(res, 500, "META_FAILED", err && err.message ? err.message : String(err));
      }
    }

    // ---- group payloads -----------------------------------------
    let builder = null;
    for (const g of list) {
      const short = `/api/group/${g.key.split("_")[1]}`;
      const full = `/api/group/${g.key}`;
      if (g.path === url || short === url || full === url) {
        builder = g;
        break;
      }
    }

    if (!builder) {
      // NO UI: every unknown route is a JSON 404 (never HTML/static).
      return fail(res, 404, "NOT_FOUND", `No route ${url}`);
    }

    try {
      // Per-request options from the query string. `mode=countries` switches
      // the picker to country-first selection (one series per major country)
      // so the dashboard can chart EVERY core country, not just ~12 series.
      const { buildGroup } = require("./picker.cjs");
      const mode = query.get("mode") || undefined;
      const limitRaw = query.get("limit");
      const limit = limitRaw != null ? Number(limitRaw) : undefined;
      const opts = { title: builder.title };
      if (mode) opts.mode = mode;
      if (Number.isFinite(limit)) opts.limit = limit;
      return writeJSON(res, 200, buildGroup(builder.key, builder.canons, opts));
    } catch (err) {
      return fail(res, 500, "BUILD_FAILED", err && err.message ? err.message : String(err));
    }
  };
}

function start(port) {
  const PORT = port || Number(process.env.MACRO_BACKEND_PORT) || 4001;
  const server = http.createServer(makeHandler());
  server.listen(PORT);
  server.on("listening", () => {
    if (!process.env.MACRO_SILENT) {
      console.log(`[macro_backend] API-only service on http://127.0.0.1:${PORT}`);
      console.log(`[macro_backend]   health: /health   debug: /debug/macro   docs: /api/docs`);
    }
  });
  return server;
}

module.exports = { start, builders, makeHandler, writeJSON, debugMacro, apiDocs };
