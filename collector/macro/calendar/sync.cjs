// ============================================================
// Macro Calendar — sync (provider events -> releases.db store)
// File: collector/macro/calendar/sync.cjs
//
// Pulls upcoming release-schedule events from official providers and
// upserts them into calendar/data/releases.db (store.cjs).
//
// Live data fetched from:
//   FRED    -> api.stlouisfed.org/fred/releases/dates (free key).
//   BIS     -> stats.bis.org/api/v1/data/BIS,BIS_REL_CAL,1.0/all?format=csv
//              (official release-schedule dataflow; OBS_VALUE = publication date).
//   EUROSTAT-> ec.europa.eu/eurostat/o/calendars/eventsJson (official calendar feed).
// Providers without a machine event-calendar (IMF/OECD/WORLD_BANK) remain
// cadence-driven and contribute [] here.
//
// Endpoints live in ./calendar-config.cjs (config, not hard-coded).
// ============================================================
const { openStore, upsertEvents, rollPastToReleased, purgeBefore, close, computeReleaseTsMs, DB_PATH, appendError, recordError } = require("./store.cjs");
const { RELEASE_CALENDAR, CADENCE_ONLY } = require("./calendar-config.cjs");
const { resolveApiKeys } = require("../config/config.cjs");
const Mk = require("./maketime.cjs"); // cadence-only sources -> future release rows

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal HTTP GET returning the raw response body text (retries). */
function fetchRaw(url, { attempts = 3, timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? require("https") : require("http");
    const attemptIt = (tryNo) => {
      const req = mod.get(
        u,
        { headers: { "User-Agent": "MacroCollector/1.0 (TraderBOT calendar)" }, timeout: timeoutMs },
        (res) => {
          let out = "";
          res.setEncoding("utf8");
          res.on("data", (d) => (out += d));
          res.on("end", () => {
            if (res.statusCode >= 400) {
              const err = new Error("HTTP " + res.statusCode + " " + url);
              if (tryNo < attempts) return setTimeout(() => attemptIt(tryNo + 1), 400 * tryNo);
              return reject(err);
            }
            resolve(out);
          });
        }
      );
      req.on("error", (e) => {
        if (tryNo < attempts) return setTimeout(() => attemptIt(tryNo + 1), 400 * tryNo);
        reject(e);
      });
      req.on("timeout", () => req.destroy(new Error("request timeout")));
    };
    attemptIt(1);
  });
}

/** HTTP GET that JSON-parses the body (adds retries). */
function fetchJson(url, opts) {
  return fetchRaw(url, opts).then((text) => JSON.parse(text));
}

/**
 * Small CSV parser (handles quoted fields, escaped quotes and \r\n). Returns an
 * array of row objects keyed by the header line.
 */
function parseCsv(text) {
  const out = [];
  const head = [];
  let row = [];
  let field = "";
  let inQ = false;
  let src = String(text);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (head.length === 0) { for (const h of row) head.push(String(h).trim()); }
      else if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
        const o = {};
        head.forEach((h, idx) => (o[h] = row[idx] != null ? row[idx] : ""));
        out.push(o);
      }
      row = [];
    } else field += c;
  }
  return out;
}

/** Normalise "YYYYMMDD" (or "YYYY-MM-DD…") to "YYYY-MM-DD". */
function ymd8(dateStr) {
  const s = String(dateStr || "").trim();
  if (/^\d{4}-\d{2}-\d{2}([ T.]|$)/.test(s)) return s.slice(0, 10);
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** FRED: fetch all release dates (a few pages) and keep only upcoming. */
async function fetchFredUpcoming(apiKey, { limit = 1000, nowMs = Date.now() } = {}) {
  const cfg = RELEASE_CALENDAR.FRED;
  const base = cfg.baseUrl + cfg.releasesDatesPath;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const events = [];
  let offset = 0;
  for (let page = 0; page < 5; page += 1) {
    const u = `${base}?api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${limit}&offset=${offset}&realtime_start=2020-01-01&realtime_end=9999-12-31`;
    const j = await fetchJson(u);
    const rows = (j && j.release_dates) || [];
    if (!rows.length) break;
    // sort_order=desc => newest first; once a page's first row is already <
    // today, no later row can be upcoming (they're all older) -> stop.
    if (rows[0] && String(rows[0].date || "") < today) break;
    let foundAny = false;
    for (const r of rows) {
      const d = String((r && r.date) || ""); // FRED field is `date`
      if (d && d >= today) {
        foundAny = true;
        const release_time = r.release_time ? String(r.release_time).slice(0, 8) : null;
        events.push({
          source: "FRED",
          event_label: String(r.release_name || r.release_id || "FRED release").slice(0, 120),
          release_date: d,
          // Resolve a UTC epoch (ms) from date(+time). FRED's releases/dates
          // carries no time-of-day, so this pins the event to 00:00:00 UTC of its
          // date — one-to-one with UTC chart-candle timestamps (no conversion later).
          release_time,
          release_ts_ms: computeReleaseTsMs({ release_date: d, release_time }),
          status: "scheduled",
          source_url: "https://fred.stlouisfed.org",
        });
      }
    }
    if (rows.length < limit) break;
    offset += rows.length;
    await sleep(300);
    if (!foundAny && rows[0]) break; // no upcoming in a full page -> stop
  }
  // de-dup by label+date
  const seen = new Set();
  return events.filter((e) => {
    const k = e.release_date + "|" + e.event_label;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ------------------------------------------------------------------
// BIS — official SDMX release-schedule dataflow (BIS_REL_CAL). Each CSV row says
// "for series FREQ/CATEGORY/RELEASE_TYPE, the release over TIME_PERIOD was
// published on OBS_VALUE (YYYYMMDD)". We keep rows published today or later and
// coalesce them into ONE event per publication day (so the chart does not get
// flooded with dozens of same-day rows); which series goes into the label.
// ------------------------------------------------------------------
const BIS_SERIES_NAMES = {
  CBPOL: "central-bank policy rates",
  XRU: "exchange rates",
  RPP: "residential property prices",
  CPI: "consumer prices",
  CPP: "consumer/producer prices",
  CBS: "consolidated banking statistics",
  LBS: "locational banking statistics",
  GLI: "global liquidity",
  EER: "effective exchange rates",
  DSR: "debt service ratios",
  DSS: "debt securities statistics",
  IDS: "international debt securities",
  TOTAL_CREDIT: "total credit",
  CREDIT_GAPS: "credit-to-GDP gaps",
  DER: "derivatives",
  OTC_DER: "OTC derivatives",
  XTD_DER: "cross-border derivatives",
  CBTA: "central-bank total assets",
  CPMI_CT: "CPMI clearing & settling",
  CPMI_FMI: "CPMI financial-market infrastructure",
};

async function fetchBisUpcoming({ now = Date.now() } = {}) {
  const cfg = RELEASE_CALENDAR.BIS;
  const url = `${cfg.baseUrl}${cfg.dataPath}/${cfg.calendarDataflow}/all?format=${cfg.format}`;
  const body = await fetchRaw(url);
  const rows = parseCsv(body);
  if (!rows.length) {
    appendError({ error_code: "EMPTY_TABLE", source: "BIS", details: "BIS_REL_CAL returned no rows" });
    return [];
  }
  const today8 = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const byDay = new Map(); // YYYY-MM-DD -> Set(category)
  for (const r of rows) {
    const obs = String(r.OBS_VALUE || "").trim();
    if (!/^\d{8}$/.test(obs) || obs < today8) continue;
    const pub = ymd8(obs);
    const cat = String(r.CATEGORY || "").trim();
    if (pub && cat) {
      if (!byDay.has(pub)) byDay.set(pub, new Set());
      byDay.get(pub).add(cat);
    }
  }
  const events = [];
  for (const day of [...byDay.keys()].sort()) {
    const cats = [...byDay.get(day)].sort();
    const shown = cats.slice(0, 4).map((c) => BIS_SERIES_NAMES[c] || c).join(", ");
    const label = `BIS releases — ${shown}${cats.length > 4 ? ` (+${cats.length - 4} more)` : ""}`;
    events.push({
      source: "BIS",
      event_label: label.slice(0, 120),
      category: cats.join("|"),
      country: null,
      release_date: day,
      release_time: null,
      release_ts_ms: computeReleaseTsMs({ release_date: day }),
      status: "scheduled",
      source_url: cfg.releaseUrl || "https://data.bis.org",
    });
  }
  return events;
}

/** Map one calendar item for EUROSTAT. */
function eurostatItemToEvent(it, cfg, todayIso, endIso) {
  const c = it && it.child ? it.child : it;
  const s0 = c && c.start != null ? c.start : (c && c.date != null ? c.date : null);
  if (s0 == null) return null;
  let dateStr = null; let timeStr = null;
  if (typeof s0 === "number" && s0 > 1e11) {
    const dt = new Date(s0); if (!Number.isNaN(+dt)) { dateStr = dt.toISOString().slice(0, 10); timeStr = dt.toISOString().slice(11, 16); }
  } else {
    const s = String(s0).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { dateStr = s.slice(0, 10); const tm = /[T ](\d{2}:\d{2})/.exec(s); if (tm) timeStr = tm[1]; }
  }
  if (!dateStr || dateStr < todayIso || dateStr > endIso) return null;
  const type = c.type || (c.extendedProps && c.extendedProps.type) || "";
  if (/news|podcast|event|thematic/i.test(String(type))) return null; // not data releases
  const dtRaw = c.datasetCodes;
  const dset = dtRaw == null ? "" : (Array.isArray(dtRaw) ? dtRaw.join(",") : String(dtRaw));
  const title = String(c.title != null ? c.title : c.name || type || "macro release").slice(0, 120);
  return {
    source: "EUROSTAT",
    event_label: title,
    category: dset ? `eurostat:${String(dset).slice(0, 60)}` : null,
    country: "EU",
    release_date: dateStr,
    release_time: timeStr,
    release_ts_ms: computeReleaseTsMs({ release_date: dateStr, release_time: timeStr }),
    status: "scheduled",
    source_url: cfg.releaseUrl || "https://ec.europa.eu/eurostat/web/main/news/release-calendar",
  };
}

// ------------------------------------------------------------------
// EUROSTAT fallback — SSR "Euro indicators" page parser.
// The official release-calendar JSON (eventsJson) can be empty in some
// deployments while the plain euro-indicators page still lists the actual
// macro-release items (GDP, inflation, retail, trade, unemployment…) with
// "PUBLISHED: <day> <month> <year>" + title + product link. We mirror those
// into release_events so the single calendar never looks empty for Eurostat.
// ------------------------------------------------------------------
const MONTH_NUM = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Decode a few common percent-encoded/entity artifacts Eurostat embeds. */
function decodeBasicText(s) {
  return String(s || "")
    .replace(/&euro;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/&#8230;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00AD/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** "14 August 2026" -> YYYY-MM-DD (or null when unreadable/untranslated). */
function isoFromEuroDate(s) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(String(s || "").trim());
  if (!m) return null;
  const mo = MONTH_NUM[m[2].slice(0, 3).toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(parseInt(m[1], 10)).padStart(2, "0")}`;
}

/**
 * Parse the actual macro-release items out of the euro-indicators SSR page.
 * Each item is a "PUBLISHED: <published-date>" plus an <a> whose aria-label is the
 * release title and href is the Eurostat product link.
 * @returns events restricted to around `now` (default -45d .. +60d)
 */
function parseEuroIndHtml(html, { now = Date.now(), backDays = 45, aheadDays = 60, cfgReleaseUrl = null } = {}) {
  const out = [];
  const seen = new Set();
  // BE CAREFUL: Eurostat puts NBSP / tabs around the "PUBLISHED:" label, so we
  // avoid depending on exact element adjacency — we simply look for a date after
  // each "PUBLISHED:" marker inside a small window.
  const RE = /PUBLISHED:[\s\S]{0,180}?(\d{1,2}[ -][A-Za-z]{3,15} \d{4})/gi;
  let hit;
  while ((hit = RE.exec(html))) {
    const dateIso = isoFromEuroDate(hit[1]);
    if (!dateIso) continue;
    // look for the anchor that follows this item (aria-label title)
    const tail = html.slice(hit.index, hit.index + 1600);
    const aTitle = /aria-label=(["'])([\s\S]{0,400}?)\1/.exec(tail);
    const title = aTitle ? aTitle[2].trim() : "";
    const link = /href=(["'])(https?:\/\/[^"']+)\1/.exec(tail);
    if (!title && !link) continue; // not a real item block we can describe
    const label = decodeBasicText(title || (link ? link[2].split("?code=")[1] || "Euro indicator" : "Euro indicator"));
    const k = dateIso + "|" + label;
    if (seen.has(k)) continue;
    // keep only near-miss timing so we don't store years of old news
    const isoNow = new Date(now).toISOString().slice(0, 10);
    if (dateIso < addDaysIso(isoNow, -backDays) || dateIso > addDaysIso(isoNow, aheadDays)) continue;
    seen.add(k);
    out.push({
      source: "EUROSTAT",
      event_label: String(label).slice(0, 120),
      category: "eurostat:euroind",
      country: "EU",
      release_date: dateIso,
      release_time: "00:00",
      release_ts_ms: computeReleaseTsMs({ release_date: dateIso }),
      source_url: cfgReleaseUrl || "https://ec.europa.eu/eurostat/web/main/news/euro-indicators",
      status: dateIso <= isoNow ? "released" : "scheduled", // published items mark timeline; future->scheduled
      link: link ? link[2] : null,
    });
  }
  return out;
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Official Eurostat eventsJson first; silently falls back to the SSR page. */
async function fetchEurostatUpcoming({ now = Date.now(), horizonDays = 60 } = {}) {
  const cfg = RELEASE_CALENDAR.EUROSTAT;
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const endIso = new Date(now + horizonDays * 86400000).toISOString().slice(0, 10);
  const url = `${cfg.baseUrl}${cfg.eventsPath}?start=${todayIso}&end=${endIso}`;
  const raw = (await fetchRaw(url)).trim();
  // An empty (or non-JSON) body here means the upstream calendar backend is
  // unavailable in this deployment -> we must fall through to the SSR page.
  let j = null;
  if (raw) { try { j = JSON.parse(raw); } catch { j = null; } }
  else appendError({ error_code: "EMPTY_JSON", source: "EUROSTAT", details: "eventsJson returned an empty body" });
  const list =
    (Array.isArray(j) && j) ||
    (j && j.events && Array.isArray(j.events) && j.events) ||
    (j && j.items && Array.isArray(j.items) && j.items) ||
    (j && j.data && Array.isArray(j.data) && j.data) ||
    [];
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const ev = eurostatItemToEvent(it, cfg, todayIso, endIso);
    if (!ev) continue;
    const k = ev.event_label + "|" + ev.release_date;
    if (!seen.has(k)) { seen.add(k); out.push(ev); }
  }
  // 1) If the official calendar feed returned events, prefer them.
  if (out.length) return out;

  // 2) Fallback: when eventsJson is empty (this sandbox returns an empty body for
  // every date range) mirror the always-present SSR Euro-indicators page, which
  // lists the actual macro releases (GDP, inflation, retail, trade, …).
  const rawPage = await fetchRaw(cfg.pageUrl).catch(() => "");
  const fallback = parseEuroIndHtml(rawPage, {
    now,
    backDays: 45,
    aheadDays: 60,
    cfgReleaseUrl: cfg.releaseUrl,
  });
  if (!fallback.length) {
    appendError({ error_code: "FALLBACK_FAILED", source: "EUROSTAT", details: "SSR euro-indicators fallback yielded no events" });
  }
  return fallback;
}

/** Provider dispatcher. */
async function collectProvider(source, opts) {
  if (source === "FRED") {
    const keys = resolveApiKeys();
    if (!keys.FRED) return [];
    return fetchFredUpcoming(keys.FRED, opts);
  }
  if (source === "BIS") return fetchBisUpcoming(opts);
  if (source === "EUROSTAT") return fetchEurostatUpcoming(opts);
  if (CADENCE_ONLY.includes(source)) return [];
  return [];
}

/** Synchronize release store with real release-calendar events (FRED/BIS/EUROSTAT)
 *  plus synthesized cadence rows for OECD/IMF/WORLD_BANK (single timing table). */
async function syncAll({ dbPath = DB_PATH, providers = null, now = Date.now() } = {}) {
  const db = openStore(dbPath);
  try {
    // Integrity gate: a corrupt calendar DB must be reported, not silently used.
    const integrity = db.pragma("quick_check", { simple: true });
    if (integrity !== "ok") {
      recordError(db, { error_code: "CALENDAR_CORRUPTED", details: "quick_check=" + integrity });
    }
    const list = providers || Object.keys(RELEASE_CALENDAR); // explicit calendar providers
    let changed = 0;
    for (const source of list) {
      try {
        const evs = await collectProvider(source, { nowMs: now });
        if (evs && evs.length) changed += upsertEvents(db, evs);
      } catch (e) {
        process.stderr.write(`[calendar] ${source} fetch error: ${e.message}\n`);
        recordError(db, { error_code: "SYNC_FAILED", source, details: e.message });
      }
    }
    // cadence-only sources: no is-due usage; maketime always keeps >=10y of
    // future release rows so the ONE timing table is the only reference.
    // Collect stats when providers unspecified (full run) so callers see adds.
    if (!providers) {
      const stats = await Mk.ensureMacroCadenceEvents({ now, dbPath });
      changed += stats.reduce((a, s) => a + s.added, 0);
    }
    changed += rollPastToReleased(db);
    const purged = purgeBefore(db, 30);
    return { updated: changed, purged, db: dbPath };
  } finally {
    close(db);
  }
}

module.exports = {
  syncAll,
  collectProvider,
  fetchFredUpcoming,
  fetchBisUpcoming,
  fetchEurostatUpcoming,
  parseEuroIndHtml,
  fetchRaw,
  fetchJson,
  parseCsv,
  computeReleaseTsMs,
  DB_PATH,
  DAY_MS,
};


