"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/api/server.cjs
 * Description:
 *   Macro API — Phase 11 (Chalak / fast light build).
 *   A very light HTTP server (built-in `http`, no framework, no new
 *   dependencies) that exposes the macro engine as small endpoints.
 *   It only CALLS the macro engine — no data processing here.
 *
 *   Endpoints:
 *     GET /macro/query?q=USA:CPI            -> QueryParser output
 *     GET /macro/chart?q=...&frequency=Q    -> ChartEngine output
 *     GET /macro/dashboard?q=...            -> { card, table, summary }
 *     GET /macro/card?q=...                 -> { card }
 *     GET /macro/table?q=...                -> { table }
 *     GET /macro/summary?q=...              -> { summary }
 *     GET /macro/meta/health                -> { ok: 1 }
 *     GET /macro/meta/countries             -> [ ...country codes ]
 *     GET /macro/meta/indicators            -> [ ...indicator names ]
 *     GET /macro/meta/series?country=USA    -> series list
 *
 *   Direct engine form (for real Chalak names) is also accepted:
 *     ?country=USA&indicator=CPI_YOY&frequency=M&from=2019&to=2024
 *
 * Run:
 *   node -e "require('./collector/macro/api/server.cjs').start(4000)"
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const http = require("http");
const { parseQuery } = require("../query/parser/query_parser.cjs");
const { ChartEngine } = require("../query/engine/chart_engine.cjs");
const { QueryExecutor } = require("../query/engine/query_executor.cjs");
const MacroService = require("../query/integration/macro_service.cjs");
const Assistant = require("../assistant/macro_assistant.cjs");
const calStore = require("../calendar/store.cjs");

// Chalak database only — the reference DB is never touched.
const DB = "core";
const DEFAULT_FREQUENCY = "M";

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

// Normalizes a frequency label to A / Q / M (Chalak set) or null.
function normalizeFreq(value) {
  const v = value ? String(value).trim().toUpperCase() : "";
  if (v === "M" || v === "MONTH" || v === "MONTHLY") return "M";
  if (v === "Q" || v === "QUARTER" || v === "QUARTERLY") return "Q";
  if (v === "A" || v === "Y" || v === "ANNUAL" || v === "YEARLY" || v === "YEAR") return "A";
  return null;
}

function toTimeRange(time) {
  const tr = {};
  if (time && time.from != null) tr.start = String(time.from);
  if (time && time.to != null) tr.end = String(time.to);
  return tr;
}

// Builds the ChartEngine query object from request params.
// Supports the DSL form ("q") and the direct engine form (country+indicator).
function engineQueryFrom(params) {
  const q = params.get("q");
  if (q) {
    const parsed = parseQuery(q);
    const target = normalizeFreq(params.get("frequency")) || DEFAULT_FREQUENCY;
    return {
      db: DB,
      frequency: target,
      series: parsed.series.map((s) => ({
        country: s.country,
        indicator: s.indicator,
        frequency: target,
        transform: s.transform,
      })),
      timeRange: toTimeRange(parsed.time),
    };
  }
  const country = params.get("country");
  const indicator = params.get("indicator");
  if (country && indicator) {
    const target = normalizeFreq(params.get("frequency")) || DEFAULT_FREQUENCY;
    return {
      db: DB,
      frequency: target,
      series: [{ country, indicator, frequency: target, transform: null }],
      timeRange: {
        start: params.get("from") || undefined,
        end: params.get("to") || undefined,
      },
    };
  }
  throw new Error('Provide "q" (DSL) or "country" + "indicator"');
}

function handleMeta(response, key, params) {
  const ex = new QueryExecutor(DB);
  try {
    if (key === "health") return json(response, 200, { ok: 1, db: DB });
    if (key === "countries") {
      const rows = ex.db.prepare("SELECT DISTINCT country FROM series ORDER BY country").all();
      return json(response, 200, { countries: rows.map((r) => r.country) });
    }
    if (key === "indicators") {
      const rows = ex.db.prepare("SELECT DISTINCT indicator FROM series ORDER BY indicator").all();
      return json(response, 200, { indicators: rows.map((r) => r.indicator) });
    }
    if (key === "series") {
      const country = params.get("country");
      const rows = country
        ? ex.db
            .prepare("SELECT series_id, dataset, country, indicator, frequency, unit FROM series WHERE country = ? ORDER BY series_id")
            .all(country)
        : ex.db.prepare("SELECT series_id, dataset, country, indicator, frequency, unit FROM series ORDER BY series_id").all();
      return json(response, 200, { count: rows.length, series: rows });
    }
    return json(response, 404, { error: `Unknown meta: ${key}` });
  } finally {
    ex.close();
  }
}

async function handleMacro(response, pathname, params) {
  let engineQuery;
  try {
    engineQuery = engineQueryFrom(params);
  } catch (err) {
    return json(response, 400, { error: err.message });
  }
  const engine = new ChartEngine();
  try {
    if (pathname === "/macro/chart") {
      return json(response, 200, await engine.generateChart(engineQuery));
    }
    const dashboard = await engine.generateDashboard(engineQuery);
    if (pathname === "/macro/dashboard") return json(response, 200, dashboard);
    if (pathname === "/macro/card") return json(response, 200, { card: dashboard.card });
    if (pathname === "/macro/table") return json(response, 200, { table: dashboard.table });
    if (pathname === "/macro/summary") return json(response, 200, { summary: dashboard.summary });
    return json(response, 404, { error: "Not found" });
  } finally {
    engine.close();
  }
}

function start(port = 4000) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const params = url.searchParams;

    if (pathname === "/macro/query") {
      const q = params.get("q");
      if (!q) return json(response, 400, { error: 'Missing "q" query parameter' });
      try {
        return json(response, 200, parseQuery(q));
      } catch (err) {
        return json(response, 400, { error: err.message });
      }
    }

    if (pathname === "/macro/full") {
      const q = params.get("q");
      if (!q) return json(response, 400, { error: 'Missing "q" query parameter' });
      MacroService.runMacroPipeline(q, { frequency: params.get("frequency") })
        .then((result) => json(response, 200, result))
        .catch((err) => json(response, 400, { error: err.message }));
      return;
    }

    if (pathname === "/macro/assistant") {
      const q = params.get("q");
      if (!q) return json(response, 400, { error: 'Missing "q" query parameter' });
      Assistant.generateMacroResponse(q)
        .then((result) => json(response, 200, result))
        .catch((err) => json(response, 400, { error: err.message }));
      return;
    }

    if (pathname === "/macro/errors") {
      // Default to the shared releases.db; a test harness may point to a temp DB
      // via MACRO_ERRORS_DB so /macro/errors can be E2E-tested in isolation.
      const errDb = process.env.MACRO_ERRORS_DB || calStore.DB_PATH;
      const db = calStore.openStore(errDb);
      try {
        const source = params.get("source") || null;
        const limitParam = parseInt(params.get("limit") || "100", 10);
        const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 100;
        const errors = calStore.listErrors(db, { source, limit });
        return json(response, 200, { errors });
      } finally {
        calStore.close(db);
      }
    }

    if (
      pathname === "/macro/chart" ||
      pathname === "/macro/dashboard" ||
      pathname === "/macro/card" ||
      pathname === "/macro/table" ||
      pathname === "/macro/summary"
    ) {
      handleMacro(response, pathname, params).catch((err) =>
        json(response, 500, { error: err.message })
      );
      return;
    }

    const metaMatch = pathname.match(/^\/macro\/meta\/([a-z]+)$/);
    if (metaMatch) return handleMeta(response, metaMatch[1], params);

    return json(response, 404, { error: "Not found" });
  });

  server.listen(port, "127.0.0.1", () => console.log(`[MACRO API] http://127.0.0.1:${port}`));
  return server;
}

module.exports = { start };

