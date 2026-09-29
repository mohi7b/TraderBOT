"use strict";

/**
 * Macro Backend — HTTP facade (presentation layer)
 *
 * Serves the three dashboard-ready groups built by picker_lib:
 *   /api/inflation   -> 1A_inflation (CPI / Core CPI / PPI)
 *   /api/growth      -> 1B_growth    (GDP / Industrial Production / Retail Sales)
 *   /api/labor       -> 1C_labor     (Unemployment / Employment)
 * plus a tiny /api/health probe.
 *
 * Nothing here does processing — it only calls the modules and serializes.
 * Intentionally framework-free (node http), ready to be hit by a future
 * front-end; CORS is answered leniently for local development.
 */

const http = require("http");

const buildInflationJSON = require("./modules/inflation.cjs");
const buildGrowthJSON = require("./modules/growth.cjs");
const buildLaborJSON = require("./modules/labor.cjs");

const PORT = process.env.MACRO_BACKEND_PORT || 4001;

function writeJSON(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",           // dev-only; refine later
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj, null, 2));
}

const ROUTES = {
  "/api/inflation": buildInflationJSON,
  "/api/growth": buildGrowthJSON,
  "/api/labor": buildLaborJSON,
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = (req.url || "").split("?")[0];

  if (url === "/api/health") {
    return writeJSON(res, 200, {
      status: "ok",
      service: "macro-backend",
      groups: Object.keys(ROUTES),
      time: new Date().toISOString(),
    });
  }

  const builder = ROUTES[url];
  if (builder) {
    try {
      const json = builder();
      return writeJSON(res, 200, json);
    } catch (err) {
      return writeJSON(res, 500, {
        status: "error",
        error: "BUILD_FAILED",
        message: err && err.message ? err.message : String(err),
      });
    }
  }

  return writeJSON(res, 404, {
    status: "error",
    error: "NOT_FOUND",
    message: `No route ${url}`,
  });
});

server.listen(PORT, () => {
  console.log(`[macro_backend] running on http://127.0.0.1:${PORT}`);
});
