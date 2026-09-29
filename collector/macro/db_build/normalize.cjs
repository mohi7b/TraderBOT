/**
 * ============================================================
 * Macro DB Pipeline - Normalization helpers
 * File: collector/macro/db_build/normalize.cjs
 *
 * Responsibilities:
 *   - Source registry (BIS / IMF / WB / OECD / FRED / EUROSTAT)
 *   - series_id construction: <dataset>.<country>.<indicator>.<frequency>
 *   - Frequency normalization (Monthly -> M, Quarterly -> Q, ...)
 *   - Date normalization to a canonical, sortable form:
 *       annual     -> YYYY
 *       quarterly  -> YYYY-Qx
 *       monthly    -> YYYY-MM
 *       daily      -> YYYY-MM-DD
 *   - Eurostat 2-letter country code -> ISO3 mapping
 *   - BIS wide-CSV helpers (header "CODE:Label", date-token detection)
 *   - CSV escaping for the temp bulk files
 * ============================================================
 */

// ------------------------------------------------------------
// Source registry (drives the `sources` table)
// ------------------------------------------------------------
const SOURCES = {
  BIS: {
    name: "Bank for International Settlements",
    url: "https://www.bis.org/statistics/full_data_sets.htm",
    update_frequency: "Monthly",
  },
  IMF: {
    name: "International Monetary Fund",
    url: "https://www.imf.org/en/Data",
    update_frequency: "Monthly",
  },
  WB: {
    name: "World Bank Open Data",
    url: "https://data.worldbank.org",
    update_frequency: "Annual",
  },
  OECD: {
    name: "OECD Data Explorer",
    url: "https://data-explorer.oecd.org",
    update_frequency: "Monthly",
  },
  FRED: {
    name: "FRED - Federal Reserve Economic Data",
    url: "https://fred.stlouisfed.org",
    update_frequency: "Daily",
  },
  EUROSTAT: {
    name: "Eurostat",
    url: "https://ec.europa.eu/eurostat",
    update_frequency: "Monthly",
  },
  OWID: {
    name: "Our World in Data",
    url: "https://ourworldindata.org/grapher/consumer-price-index",
    update_frequency: "Annual",
  },
};

// ------------------------------------------------------------
// Eurostat REF_AREA uses 2-letter EU codes -> ISO3 (for series_id)
// Aggregates (EA, EU, EU27_2020, ...) are kept as-is.
// ------------------------------------------------------------
const EU2_TO_ISO3 = {
  AT: "AUT", BE: "BEL", BG: "BGR", HR: "HRV", CY: "CYP", CZ: "CZE",
  DK: "DNK", EE: "EST", FI: "FIN", FR: "FRA", DE: "DEU", EL: "GRC", GR: "GRC",
  HU: "HUN", IE: "IRL", IT: "ITA", LV: "LVA", LT: "LTU", LU: "LUX",
  MT: "MLT", NL: "NLD", PL: "POL", PT: "PRT", RO: "ROU", SK: "SVK",
  SI: "SVN", ES: "ESP", SE: "SWE", GB: "GBR", UK: "GBR",
  IS: "ISL", NO: "NOR", CH: "CHE", MK: "MKD", RS: "SRB", TR: "TUR",
  UA: "UKR", ME: "MNE", AL: "ALB", BA: "BIH", XK: "XKX", MD: "MDA",
  GE: "GEO", AM: "ARM", AZ: "AZE", BY: "BLR", KZ: "KAZ", RU: "RUS",
  US: "USA", CA: "CAN", JP: "JPN", AU: "AUS", NZ: "NZL", KR: "KOR",
  CN: "CHN", IN: "IND", BR: "BRA", MX: "MEX", ZA: "ZAF", IL: "ISR",
  CL: "CHL", CO: "COL", MY: "MYS", SG: "SGP", HK: "HKG", TW: "TWN",
  TH: "THA", ID: "IDN", PH: "PHL", VN: "VNM", AR: "ARG", PE: "PER",
  // Eurostat aggregates / zones (kept verbatim)
  EA: "EA", EA19: "EA19", EU: "EU", EU15: "EU15", EU25: "EU25",
  EU27: "EU27", EU27_2020: "EU27_2020", EU28: "EU28", EEA30: "EEA30",
  EEA31: "EEA31", EEA33: "EEA33", EA20: "EA20", EA12: "EA12",
};

// ------------------------------------------------------------
// BIS dataset code (WS_*) -> short readable indicator
// ------------------------------------------------------------
const BIS_INDICATORS = {
  WS_CBPOL: "POLICY_RATE",
  WS_CBS_PUB: "CREDIT",
  WS_CBTA: "BANK_ACCOUNTS",
  WS_CPMI_CASHLESS: "CASHLESS",
  WS_CPMI_CT1: "CARD_TX_VOL",
  WS_CPMI_CT2: "CARD_TX_VAL",
  WS_CPMI_DEVICES: "PAYMENT_DEVICES",
  WS_CPMI_INSTITUT: "PAYMENT_INSTITUTIONS",
  WS_CPMI_MACRO: "PAYMENT_STATISTICS",
  WS_CPMI_PARTICIP: "PAYMENT_PARTICIPATION",
  WS_CPMI_SYSTEMS: "PAYMENT_SYSTEMS",
  WS_CPP: "PROPERTY_PRICES",
  WS_CREDIT_GAP: "CREDIT_GAP",
  WS_DEBT_SEC2_PUB: "DEBT_SECURITIES",
  WS_DER_OTC_TOV: "OTC_DERIVATIVES_TOV",
  WS_DPP: "DEBT_PROVISIONING",
  WS_DSR: "DEBT_SERVICE_RATIO",
  WS_EER: "EFFECTIVE_EXCHANGE_RATE",
  WS_GLI: "GLOBAL_LIQUIDITY",
  WS_LBS_D_PUB: "LOANS",
  WS_LONG_CPI: "CPI",
  WS_NA_SEC_DSS: "FINANCIAL_ACCOUNTS",
  WS_OTC_DERIV2: "OTC_DERIVATIVES_OUT",
  WS_SPP: "SHARE_PRICES",
  WS_TC: "TRADE_CREDIT",
  WS_XRU: "USD_EXCHANGE_RATE",
  WS_XTD_DERIV: "EXTERNAL_DERIVATIVES",
};

// ------------------------------------------------------------
// BIS measure-aware indicator resolution  (P0 fix)
// ------------------------------------------------------------
// Some BIS datasets carry MORE THAN ONE measure per (country, frequency)
// inside the same *_csv_col dump, distinguished only by UNIT_MEASURE.
//
// WS_LONG_CPI is the important case:
//     628 -> "Index, 2010 = 100"                  -> CPI_IDX  (kind: index)
//     771 -> "Year-on-year changes, in per cent"  -> CPI_YOY  (kind: rate)
//
// The previous behaviour mapped every row to indicator "CPI", so BOTH rows
// produced the SAME series_id (BIS.<ISO2>.CPI.<FREQ>). The staging de-dup
// ("first value wins per (series_id, date)", see db_build/README.md) then
// mixed index levels with YoY rates for the same country — the outcome
// depended purely on the row order inside the CSV.
// Evidence: MACRO_DATA_INVENTORY.md §5 (BIS.US starts as an index in 1913
// and continues as a rate from 1914; BIS.AU stays an index throughout).
//
// → Measure must be part of the series identity.
const BIS_MEASURE_INDICATORS = {
  WS_LONG_CPI: { "628": "CPI_IDX", "771": "CPI_YOY" },
};

/**
 * Indicator for ONE BIS observation row (measure-aware).
 * @param {string} datasetCode  e.g. "WS_LONG_CPI"
 * @param {string|number} [unitMeasure] row's UNIT_MEASURE code ("628" | "771")
 * @returns {string} provider indicator code stored in series.indicator
 */
function bisIndicator(datasetCode, unitMeasure) {
  const base = BIS_INDICATORS[datasetCode] || datasetCode.replace(/^WS_/, "");
  const map = BIS_MEASURE_INDICATORS[datasetCode];
  if (!map || unitMeasure == null) return base;
  const key = String(unitMeasure).trim();
  if (!key) return base;
  return map[key] || base;
}

// ------------------------------------------------------------
// BIS wide-CSV dimension columns that identify the country
// (first non-empty one in header order wins)
// ------------------------------------------------------------
const COUNTRY_COLS = [
  "REF_AREA", "BORROWERS_CTY", "L_REP_CTY", "REP_CTY", "ISSUER_RES",
  "DER_REP_CTY", "L_PARENT_CTY", "L_CP_COUNTRY",
  // WS_XTD_DERIV (exchange-traded derivatives) has no country dimension;
  // the issue currency is the best entity key available.
  "ISSUE_CUR",
];

// ------------------------------------------------------------
// Date token: canonical period token found in BIS wide headers
//   YYYY | YYYY-Qx | YYYY-Sx | YYYY-MM | YYYY-MM-DD
// ------------------------------------------------------------
const DATE_TOKEN_RE = /^(\d{4})(?:-Q[1-4]|-S[1-2]|-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;

/**
 * Is a header cell a date-like column? (used by the BIS wide parser)
 */
function isDateToken(h) {
  return DATE_TOKEN_RE.test(String(h).trim());
}

/**
 * Coerce a value to Number, or return null when not numeric.
 */
function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a raw frequency label/code to the canonical letter.
 * Monthly->M, Quarterly->Q, Annual->A, Daily->D, Weekly->W.
 */
function frequencyCode(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^[MQADWHS]$/i.test(s)) return s.toUpperCase();
  if (/monthly/i.test(s)) return "M";
  if (/quarterly/i.test(s)) return "Q";
  if (/half[- ]?yearly|semi[- ]?annual/i.test(s)) return "H";
  if (/annual|yearly/i.test(s)) return "A";
  if (/daily/i.test(s)) return "D";
  if (/weekly/i.test(s)) return "W";
  return "";
}

/**
 * Normalize a raw period into a canonical, sortable date string.
 * Uses the frequency to pick the granularity.
 */
function normalizeDate(raw, freq) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const f = frequencyCode(freq);

  // YYYY-Qx / YYYYQx  and  YYYY-Sx (half-yearly semester)
  const q = s.match(/^(\d{4})[-\s]?(Q[1-4]|S[1-2])$/i);
  if (q) return `${q[1]}-${q[2].toUpperCase()}`;

  // YYYY-MM-DD
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    if (f === "M") return `${d[1]}-${d[2]}`;
    if (f === "Q") return `${d[1]}-Q${Math.ceil(+d[2] / 3)}`;
    if (f === "A") return d[1];
    return `${d[1]}-${d[2]}-${d[3]}`;
  }

  // YYYY-MM (also YYYY-M)
  const ym = s.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    const mm = String(+ym[2]).padStart(2, "0");
    if (f === "Q") return `${ym[1]}-Q${Math.ceil(+mm / 3)}`;
    if (f === "A") return ym[1];
    if (f === "D") return `${ym[1]}-${mm}-01`;
    return `${ym[1]}-${mm}`;
  }

  // YYYY
  if (/^\d{4}$/.test(s)) return s;

  // Fallback: keep safe characters only
  return s.replace(/[^0-9A-Za-z-]/g, "");
}

/**
 * series_id rule: <dataset>.<country>.<indicator>.<frequency>
 * e.g. BIS.US.CREDIT.M / IMF.IRN.GDP.A / EUROSTAT.FRA.HICP.M
 */
function makeSeriesId(dataset, country, indicator, freq) {
  return [dataset, country, indicator, freq || "U"].join(".").toUpperCase();
}

/**
 * Eurostat 2-letter REF_AREA -> ISO3 (unknown codes stay verbatim).
 */
function countryToISO3(code) {
  const c = String(code || "").trim().toUpperCase();
  return EU2_TO_ISO3[c] || c;
}

/**
 * Parse a "CODE:Label" header cell -> CODE (used by BIS wide CSVs).
 */
function parseHeaderCode(cell) {
  const t = String(cell || "").trim();
  const idx = t.indexOf(":");
  return idx > 0 ? t.slice(0, idx).trim() : t;
}

/**
 * Escape a value for the temp CSV bulk files.
 */
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

module.exports = {
  SOURCES,
  BIS_INDICATORS,
  BIS_MEASURE_INDICATORS,
  bisIndicator,
  EU2_TO_ISO3,
  BIS_INDICATORS,
  COUNTRY_COLS,
  isDateToken,
  toNumber,
  frequencyCode,
  normalizeDate,
  makeSeriesId,
  countryToISO3,
  parseHeaderCode,
  csvEscape,
};

