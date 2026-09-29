/**
 * ============================================================
 * BIS DB Pipeline - Normalization logic
 * File: collector/macro/bis_build/normalize.cjs
 *
 * Responsibilities:
 *   - Detect CSV shape: "flat" (row per observation, has TIME_PERIOD/OBS_VALUE)
 *     or "col" (wide: dimension columns followed by date columns -> needs melt).
 *   - Compute a stable per-series id from the dimension attributes.
 *   - Normalize dates and coerce OBS_VALUE to Number.
 *   - Emit one record per observation as { series, obs[] }.
 * ============================================================
 */
const crypto = require("crypto");

/** Columns considered pure metadata -> excluded from the series identity key */
const METADATA_COLS = new Set([
  "STRUCTURE", "STRUCTURE_ID", "ACTION",
  "DECIMALS", "UNIT_MULT", "COLLECTION", "AVAILABILITY",
  "OBS_STATUS", "OBS_CONF", "OBS_PRE_BREAK",
  "BREAKS", "COVERAGE", "ORG_VISIBILITY", "TIME_FORMAT",
  "TIME_PERIOD", "OBS_VALUE",
]);

/** Prefer these columns (in order) for the `country` field */
const COUNTRY_COLS = [
  "REF_AREA", "BORROWERS_CTY", "L_REP_CTY", "REP_CTY", "ISSUER_RES",
  "DER_REP_CTY", "L_PARENT_CTY", "L_CP_COUNTRY", "L_CP_SECTOR",
];
/** Prefer these columns for the `indicator` field */
const INDICATOR_COLS = ["TITLE_TS", "TITLE", "INDICATOR", "INDICATOR_CT", "MEASURE", "TABLE"];

/** Recognize a BIS time-period / date token */
const DATE_TOKEN_RE = /^(\d{4})(?:-Q([1-4])|-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;

/** Is a header a date-like column? */
function isDateToken(h) {
  return DATE_TOKEN_RE.test(String(h).trim());
}

/** Normalize a BIS TIME_PERIOD token into canonical, sortable form. */
function normalizeDate(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  s = s.replace(/^(\d{4})Q([1-4])$/i, "$1-Q$2");
  if (DATE_TOKEN_RE.test(s)) return s;
  return s.replace(/[^A-Za-z0-9-]/g, "");
}

/** Coerce a value to Number, or return null if not numeric */
function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Build a stable series id from dimension attributes (order-independent). */
function seriesId(dataset, dims) {
  const pairs = Object.keys(dims)
    .sort()
    .map((k) => `${k}=${dims[k]}`)
    .join("|");
  const hash = crypto.createHash("md5").update(pairs).digest("hex").slice(0, 16);
  return `${dataset}_${hash}`;
}

/** Parse header cells ("CODE:Label" or plain). Accepts array or string. */
function parseHeader(cells) {
  if (typeof cells === "string") cells = cells.split(",");
  if (!Array.isArray(cells)) return [];
  return cells.map((c) => {
    const t = String(c).replace(/^\uFEFF/, "").trim();
    const idx = t.indexOf(":");
    if (idx > 0) return { code: t.slice(0, idx).trim(), label: t.slice(idx + 1).trim() };
    return { code: t, label: "" };
  });
}

/**
 * Build a row-emitter for a given CSV file's header.
 * @param {string} dataset  - e.g. "WS_CREDIT_GAP"
 * @param {string[]} header - raw header cells
 * @returns {{mode:string, emit(row:string[]) -> {series:object, obs:object[]}|null}}
 */
function makeEmitter(dataset, header) {
  const cols = parseHeader(header);
  const codes = cols.map((c) => c.code);

  // ---------- FLAT: one row per observation ----------
  const flatTP = codes.indexOf("TIME_PERIOD");
  const flatOB = codes.indexOf("OBS_VALUE");
  if (flatTP >= 0 && flatOB >= 0) {
    return {
      mode: "flat",
      dataset,
      emit(row) {
        const freqIdx = codes.indexOf("FREQ");
        const unitIdx = codes.indexOf("UNIT_MEASURE");
        const date = normalizeDate(row[flatTP]);
        const value = toNumber(row[flatOB]);
        if (!date || value == null) return null;

        const dims = {};
        let country = "";
        let indicator = "";
        for (let i = 0; i < cols.length; i++) {
          const code = codes[i];
          if (METADATA_COLS.has(code)) continue;
          const raw = (row[i] == null ? "" : String(row[i]).trim());
          const v = raw.split(":")[0].trim(); // keep only the CODE, drop ": Label"
          dims[code] = v;
          if (!country && COUNTRY_COLS.includes(code) && v) country = v;
          if (!indicator && INDICATOR_COLS.includes(code) && v) indicator = v;
        }
        if (!country) {
          for (const code of codes) {
            if (METADATA_COLS.has(code)) continue;
            const v = (row[codes.indexOf(code)] == null ? "" : String(row[codes.indexOf(code)]).trim()).split(":")[0].trim();
            if (/^[A-Z]{2,3}$/.test(v)) { country = v; break; }
          }
        }
        if (!indicator) {
          indicator = Object.keys(dims)
            .filter((k) => dims[k] && k !== "FREQ" && k !== "UNIT_MEASURE")
            .map((k) => dims[k])
            .join(" / ");
        }

        const freq = freqIdx >= 0 ? (row[freqIdx] || "").trim().split(":")[0].trim() : "";
        const unit = unitIdx >= 0 ? (row[unitIdx] || "").trim().split(":")[0].trim() : "";
        const sid = seriesId(dataset, { ...dims, FREQ: freq, UNIT_MEASURE: unit });

        return {
          series: {
            series_id: sid, dataset,
            country: country || null, indicator: indicator || null,
            frequency: freq || null, unit: unit || null,
            description: indicator || null,
          },
          obs: [{ date, value }],
        };
      },
    };
  }

  // ---------- COL (wide): dims then date columns -> melt ----------
  let firstDate = -1;
  for (let i = 0; i < codes.length; i++) {
    if (isDateToken(codes[i])) { firstDate = i; break; }
  }
  if (firstDate > 0) {
    return {
      mode: "col",
      dataset,
      emit(row) {
        const dims = {};
        let country = "";
        let indicator = "";
        const dateCols = cols.slice(firstDate);
        for (let i = 0; i < firstDate; i++) {
          const code = codes[i];
          if (METADATA_COLS.has(code)) continue;
          const raw = (row[i] == null ? "" : String(row[i]).trim());
          const v = raw.split(":")[0].trim();
          dims[code] = v;
          if (!country && COUNTRY_COLS.includes(code) && v) country = v;
          if (!indicator && INDICATOR_COLS.includes(code) && v) indicator = v;
        }
        if (!indicator && firstDate >= 1) {
          const pairLabel = (row[firstDate - 1] == null ? "" : String(row[firstDate - 1]).trim());
          if (pairLabel) indicator = indicator ? indicator : pairLabel;
        }
        const freq = dims.FREQ || "";
        const unit = (dims.UNIT_MEASURE || "").split(":")[0].trim();
        const sid = seriesId(dataset, { ...dims, FREQ: freq, UNIT_MEASURE: unit });

        const obs = [];
        for (let j = 0; j < dateCols.length; j++) {
          const date = normalizeDate(dateCols[j].code);
          if (!date) continue;
          const value = toNumber(row[firstDate + j]);
          if (value == null) continue;
          obs.push({ date, value });
        }
        if (obs.length === 0) return null;

        return {
          series: {
            series_id: sid, dataset,
            country: country || null, indicator: indicator || null,
            frequency: freq || null, unit: unit || null,
            description: indicator || null,
          },
          obs,
        };
      },
    };
  }

  return { mode: "unknown", dataset, emit: () => null };
}

module.exports = {
  makeEmitter, normalizeDate, toNumber, seriesId, isDateToken, parseHeader,
};
