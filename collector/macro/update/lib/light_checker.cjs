/**
 * ============================================================
 * Macro Live Update System — Module 1: Light Update Checker
 * File: collector/macro/update/lib/light_checker.cjs
 *
 * Goal: decide whether a source has published NEW data WITHOUT
 * downloading the actual data files.
 *
 * Technique per source (lightweight probe):
 *   BIS         HEAD both bulk ZIPs -> etag + last-modified + size
 *   IMF         Data Mapper API for 3 sample indicators -> max year + hash
 *   OECD        HEAD the KEI SDMX flow -> last-modified
 *   EUROSTAT    JSON probe with lastTimePeriod=2 -> dataset "updated" stamp
 *   FRED        small fredgraph.csv slice (last 120 days) -> max date + hash
 *   WORLD_BANK  WDI indicator API probe -> "lastupdated" stamp
 *
 * The probe produces a compact `signal` string. The orchestrator
 * compares it with the previous `signal` stored in
 *   status/light_status.json
 * If the signal changed  -> new data has been published.
 *
 * No file download ever happens in this module.
 * ============================================================
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// Generic helpers
// ------------------------------------------------------------
/** Lightweight FNV-1a 32-bit hash of a string (stable across runs). */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** HEAD request with redirect follow. Returns plain header object or {}. */
async function head(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "MacroCollector/1.0 (live-update)" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return {};
      const out = {};
      for (const [k, v] of res.headers) out[k] = v;
      return out;
    } catch (e) {
      if (i === retries - 1) return {};
      await sleep(400 * (i + 1));
    }
  }
  return {};
}

/** GET text body with retries (small payloads only). */
async function fetchSmall(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { ok: true, text: await res.text() };
    } catch (e) {
      lastErr = e;
      await sleep(500 * (i + 1));
    }
  }
  return { ok: false, error: lastErr.message };
}

/** Max year appearing in an IMF datamapper payload (e.g. 2027). */
function imfMaxYear(text) {
  let maxY = 0;
  const re = /"(\d{4})":/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const y = Number(m[1]);
    if (y > maxY) maxY = y;
  }
  return maxY;
}

// ------------------------------------------------------------
// Probes (one per source)
// ------------------------------------------------------------
const PROBES = {
  BIS: async () => {
    const targets = [
      { name: "policy_rates", url: "https://data.bis.org/static/bulk/WS_CBPOL_csv_col.zip" },
      { name: "credit", url: "https://data.bis.org/static/bulk/WS_CBS_PUB_csv_col.zip" },
    ];
    const parts = [];
    const detail = {};
    for (const t of targets) {
      const h = await head(t.url);
      detail[t.name] = {
        etag: h.etag || "",
        last_modified: h["last-modified"] || "",
        size: h["content-length"] || "",
      };
      // NOTE: BIS serves weak ETags that vary per CDN request for the SAME
      // file, so the signal uses day-granularity last-modified + size only.
      const day = (h["last-modified"] || "").slice(0, 16); // "Wed, 26 Aug 2026"
      parts.push(`${t.name}=${day || "-"}|${h["content-length"] || "-"}`);
    }
    return { signal: parts.join(";;"), detail };
  },

  IMF: async () => {
    const sample = ["NGDP_RPCH", "PCPIPCH", "GGXWDG_NGDP"];
    let combined = "";
    const detail = {};
    for (const ind of sample) {
      const r = await fetchSmall(`https://www.imf.org/external/datamapper/api/v1/${ind}`);
      detail[ind] = r.ok ? { max_year: imfMaxYear(r.text), bytes: r.text.length } : { error: r.error };
      if (r.ok) combined += ind + ":" + imfMaxYear(r.text) + ":" + hash(r.text) + ";";
    }
    return { signal: combined || "probe-failed", detail };
  },

  OECD: async () => {
    // HEAD the KEI SDMX flow — body is never transferred.
    const h = await head(
      "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_KEI@DF_KEI/"
    );
    const detail = {
      last_modified: h["last-modified"] || "",
      etag: h.etag || "",
      size: h["content-length"] || "",
    };
    const day = (h["last-modified"] || "").slice(0, 16);
    return { signal: `${day || "-"}|${h["content-length"] || "-"}`, detail };
  },

  EUROSTAT: async () => {
    // Small JSON probe restricted to the latest 2 months of one metric.
    const url =
      "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr" +
      "?format=JSON&freq=M&unit=RCH_A&coicop=CP00&geo=DE&lastTimePeriod=2";
    const r = await fetchSmall(url);
    if (!r.ok) return { signal: "probe-failed", detail: { error: r.error } };
    let updated = "";
    try {
      updated = JSON.parse(r.text).updated || "";
    } catch { /* keep empty */ }
    return { signal: updated || hash(r.text), detail: { updated, bytes: r.text.length } };
  },

  FRED: async () => {
    // Recent slice (last ~120 days) of a few representative series.
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 120 * 86400 * 1000).toISOString().slice(0, 10);
    const probes = [
      { id: "CPIAUCSL", label: "CPI" },
      { id: "UNRATE", label: "UNRATE" },
      { id: "M2SL", label: "M2" },
      // نمایندهٔ سری‌های هستهٔ غیرآمریکایی (پس از افزودن به کاتالوگ FRED)
      { id: "CPGRLE01DEM659N", label: "CORE_DE" },
      { id: "CPGRLE01KRM659N", label: "CORE_KR" },
    ];
    let combined = "";
    const detail = {};
    for (const p of probes) {
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${p.id}&cosd=${from}&coed=${to}`;
      const r = await fetchSmall(url);
      if (!r.ok) {
        detail[p.id] = { error: r.error };
        continue;
      }
      const lines = r.text.replace(/\r/g, "").split("\n").filter(Boolean);
      const last = lines.length > 1 ? lines[lines.length - 1].split(",") : [];
      detail[p.id] = { last_date: last[0] || "", last_value: last[1] || "" };
      combined += `${p.id}:${last[0] || "-"}:${hash(r.text)};`;
    }
    return { signal: combined || "probe-failed", detail };
  },

  WORLD_BANK: async () => {
    const url =
      "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=1";
    const r = await fetchSmall(url);
    if (!r.ok) return { signal: "probe-failed", detail: { error: r.error } };
    let lastUpdated = "";
    try {
      const json = JSON.parse(r.text);
      lastUpdated = (json[0] && json[0].lastupdated) || "";
    } catch { /* keep empty */ }
    return { signal: lastUpdated || hash(r.text), detail: { lastupdated: lastUpdated } };
  },
};

// ------------------------------------------------------------
// Checker entry point
// ------------------------------------------------------------

/**
 * Run a light check for one source.
 * @param {string} source  FRED | OECD | EUROSTAT | IMF | BIS | WORLD_BANK
 * @param {object} status  current light_status.json content (for previous signal)
 * @returns {Promise<object>}
 *   { source, ok, signal, new_data, status, prev_signal, detail, last_checked_at }
 */
async function runLightCheck(source, status = {}) {
  const probe = PROBES[source];
  if (!probe) {
    return {
      source,
      ok: false,
      signal: "",
      new_data: false,
      status: "error",
      detail: { error: `no probe defined for ${source}` },
    };
  }

  const prev = (status.sources && status.sources[source]) || {};
  const result = await probe();
  const newData = result.signal !== "probe-failed" && result.signal !== prev.signal;

  return {
    source,
    ok: result.signal !== "probe-failed",
    signal: result.signal,
    new_data: newData,
    status: result.signal === "probe-failed" ? "error" : newData ? "new_data" : "no_new_data",
    prev_signal: prev.signal || null,
    detail: result.detail,
    last_checked_at: new Date().toISOString(),
  };
}

/** Run light checks for all sources (sequential, network-friendly). */
async function runAllLightChecks(status) {
  const names = Object.keys(PROBES);
  const out = [];
  for (const name of names) out.push(await runLightCheck(name, status));
  return out;
}

module.exports = { runLightCheck, runAllLightChecks, PROBES };

