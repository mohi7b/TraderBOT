// ============================================================
// Macro — Central Configuration
// File: collector/macro/config.cjs
//
// Single source of truth for the 6 upstream data sources used by
// the macro collector (light check, smart download, extract,
// normalize, offline downloaders):
//     FRED, OECD, EUROSTAT, IMF, BIS, WORLD_BANK
//
// Every URL / base endpoint / file / API key lives here, so the
// various modules no longer hard-code provider links in their code.
//
// At runtime you may override values via environment variables
// (prefix MACRO_), for example:
//     MACRO_FRED_BASE=... node ...
// ============================================================
const path = require("path");

// Base directory of this file's parent macro folder.
const MACRO_ROOT = __dirname;

/** Macro data-provider configuration (per source). */
const SOURCES = {
  FRED: {
    name: "Federal Reserve Economic Data (St. Louis Fed)",
    cadence: "daily",
    // Base domains used by both light-checker and downloads.
    // - graphs: keyless fredgraph CSV (no key required)
    // - api:    JSON observations endpoint when an API key is set
    graphsBase: process.env.MACRO_FRED_GRAPHS || "https://fred.stlouisfed.org/graph",
    apiBase: process.env.MACRO_FRED_API || "https://api.stlouisfed.org/fred",
    // Region is always USA (FRED only covers the United States).
    region: "USA",
  },
  OECD: {
    name: "OECD — Statistics",
    cadence: "daily",
    sdmxBase: process.env.MACRO_OECD_SDMX || "https://stats.oecd.org/SDMX-JSON/data",
    flows: ["KEI", "QNA", "MEI_CLI"], // full SDMX-JSON dumps used
  },
  EUROSTAT: {
    name: "Eurostat — Dissemination API",
    cadence: "daily",
    apiBase:
      process.env.MACRO_EUROSTAT_API ||
      "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data",
    // A representative set of geos used across metrics.
    geos: ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "EL", "PL", "SE", "UK", "NO", "CH"],
  },
  IMF: {
    name: "International Monetary Fund — Data Mapper",
    cadence: "weekly",
    apiBase: process.env.MACRO_IMF_API || "https://www.imf.org/external/datamapper/api/v1/",
  },
  BIS: {
    name: "Bank for International Settlements — Bulk data",
    cadence: "weekly",
    bulkBase: process.env.MACRO_BIS_BULK || "https://data.bis.org/static/bulk",
    // Exactly the two required bulk ZIP files (policy rates + credit).
    policyRatesZip: "WS_CBPOL_csv_col.zip",
    creditZip: "WS_CBS_PUB_csv_col.zip",
    dumpPillPolicyRates: "bis_policy_rates.zip",
    dumpCredit: "bis_credit.zip",
  },
  WORLD_BANK: {
    name: "World Bank — WDI bulk CSV",
    cadence: "monthly",
    wdiZip: process.env.MACRO_WB_WDI || "https://databank.worldbank.org/data/download/WDI_CSV.zip",
  },
  OWID: {
    name: "Our World in Data — Consumer price index",
    cadence: "monthly",
    // Grapher CSV endpoint (keyless). Annual, 2010=100, global coverage.
    cpiCsv:
      process.env.MACRO_OWID_CPI ||
      "https://ourworldindata.org/grapher/consumer-price-index.csv",
  },
};

/**
 * Resolve provider API keys.
 * Precedence: runtime env (MACRO_<SRC>_API_KEY) -> FRED_API_KEY (legacy) -> keys.json (if present).
 * FRED is keyless by default (fredgraph.csv) — the key is only used when switching to the JSON API.
 */
function resolveApiKeys() {
  const keys = {};
  const legacy = { FRED: process.env.FRED_API_KEY || null };
  let file = {};
  const keysPath = path.join(MACRO_ROOT, "keys.json");
  try {
    if (require("fs").existsSync(keysPath)) file = JSON.parse(require("fs").readFileSync(keysPath, "utf8")) || {};
  } catch {
    file = {};
  }
  for (const src of Object.keys(SOURCES)) {
    keys[src] =
      process.env[`MACRO_${src}_API_KEY`] ||
      process.env[`${src}_API_KEY`] ||
      legacy[src] ||
      file[src] ||
      "";
  }
  return keys;
}

/** Central network settings shared across the live-update modules. */
const NETWORK = Object.freeze({
  timeoutMs: 60000,
  downloadTimeoutMs: 300000, // long for big bulk ZIPs (WDI ~282 MB)
  headTimeoutMs: 20000,
  retries: 3,
  userAgent: "Mozilla/5.0 (MacroCollector/1.0 +TraderBOT)",
});

module.exports = { MACRO_ROOT, SOURCES, NETWORK, resolveApiKeys };
