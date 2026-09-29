// ============================================================
// Macro Calendar — cadence generator (maketime)
// File: collector/macro/maketime.cjs
//
// Pure-cadence sources (OECD / IMF / WORLD_BANK) --- no machine release-calendar
// like FRED/BIS/EUROSTAT --- get concrete future rows in the SAME single table
// (calendar/data/releases.db -> release_events).
//   OECD monthly, IMF quarterly (Jan/Apr/Jul/Oct), WORLD_BANK yearly (Jan-1).
// Anchor (confirmed): day-1 at UTC midnight; release_time "00:00"; release_ts_ms
// = Date.UTC(that day). Existing rows untouched; only MISSING dates added
// (idempotent), with at least MIN_HORIZON_YEARS of future always guaranteed.
// CLI: node maketime.cjs -10year | --years=25 | --dry-run
// ============================================================
const { openStore, upsertEvents, listEvents, close } = require("./store.cjs");

const DAY = 24 * 60 * 60 * 1000;
const MIN_HORIZON_YEARS = 10;

/** CADENCE_ONLY sources reused by sync / live-engine. */
const CADENCE_SOURCES = [
  { source: "OECD", cadence: "monthly", title: "OECD monthly update", url: "https://stats.oecd.org" },
  { source: "IMF", cadence: "quarterly", title: "IMF quarterly update", url: "https://www.imf.org/en/Data" },
  { source: "WORLD_BANK", cadence: "yearly", title: "World Bank annual update", url: "https://databank.worldbank.org" },
];

/** Unix-ms for day-1 00:00 UTC, n months from `ms`. */
function addMonthsToFirstOf(ms, n) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 0, 0, 0, 0);
}
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Day-1 of the NEXT period strictly after `now`. */
function firstOfNext(cfg, now) {
  const d = new Date(now);
  const m = d.getUTCMonth(); // 0-based
  if (cfg.cadence === "monthly") return Date.UTC(d.getUTCFullYear(), m + 1, 1);
  if (cfg.cadence === "quarterly") return Date.UTC(d.getUTCFullYear(), m - (m % 3) + 3, 1);
  return Date.UTC(d.getUTCFullYear() + 1, 0, 1); // yearly
}

const monthsOf = (cad) => (cad === "yearly" ? 12 : cad === "quarterly" ? 3 : 1);

/** Produce cadence events covering >= horizonYears of future (default 10). */
function buildCadenceEvents(cfg, { nowMs = Date.now(), horizonYears = MIN_HORIZON_YEARS } = {}) {
  const horizonMs = nowMs + horizonYears * 365 * DAY;
  const cap = cfg.cadence === "monthly" ? 12 * (horizonYears + 1) + 3 : 2000;
  const events = [];
  let t = firstOfNext(cfg, nowMs);
  for (let g = 0; t <= horizonMs && g < cap; g++) {
    events.push({
      source: cfg.source,
      event_label: cfg.title,
      category: "cadence:" + cfg.cadence,
      release_date: isoOf(t),
      release_time: "00:00",
      release_ts_ms: t,
      country: null,
      status: "scheduled",
      source_url: cfg.url,
    });
    t = addMonthsToFirstOf(t, monthsOf(cfg.cadence));
  }
  return events;
}

/**
 * Ensure releases.db holds >= horizonYears of scheduled cadence events for
 * OECD/IMF/WORLD_BANK. Adds ONLY missing (title+date) rows every run.
 * Returns per-source { source, existing, wanted, added, total }.
 */
function ensureMacroCadenceEvents({ now = Date.now(), horizonYears = MIN_HORIZON_YEARS, dbPath } = {}) {
  const db = openStore(dbPath);
  try {
    const out = [];
    for (const cfg of CADENCE_SOURCES) {
      const existingSet = new Set(
        listEvents(db, { source: cfg.source, from: "1970-01-01" })
          .filter((e) => e.event_label === cfg.title && e.status !== "canceled")
          .map((e) => e.release_date)
      );
      const wanted = buildCadenceEvents(cfg, { nowMs: now, horizonYears });
      const need = wanted.filter((e) => !existingSet.has(e.release_date));
      const added = need.length ? upsertEvents(db, need) : 0;
      out.push({ source: cfg.source, existing: existingSet.size, wanted: wanted.length, added, total: existingSet.size + added });
    }
    return out;
  } finally {
    close(db);
  }
}

// ------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------
function parseHorizon(argv) {
  let years = MIN_HORIZON_YEARS;
  let dry = false;
  for (const a of argv) {
    const m = /^(?:-|--years=)(\d{1,3})(?:year)?$/.exec(a);
    if (m) years = Math.max(MIN_HORIZON_YEARS, parseInt(m[1], 10));
    else if (a === "--dry-run") dry = true;
    else if (a === "--years") dry = dry; // consume next arg when used separately
  }
  return { years, dry };
}

if (require.main === module) {
  const { years, dry } = parseHorizon(process.argv.slice(2));
  if (!dry) {
    const rows = ensureMacroCadenceEvents({ horizonYears: years });
    console.log(`maketime: ensured ${years} years ahead in calendar/data/releases.db`);
    for (const r of rows) {
      console.log(`  ${String(r.source).padEnd(11)} existing=${r.existing} added=${r.added} total=${r.total}`);
    }
  } else {
    console.log(`maketime --dry-run: horizonYears=${years} (no DB write)`);
    for (const cfg of CADENCE_SOURCES) {
      console.log(`  ${cfg.source} would add ${buildCadenceEvents(cfg, { horizonYears: years }).length} events`);
    }
  }
}

module.exports = {
  CADENCE_SOURCES,
  MIN_HORIZON_YEARS,
  buildCadenceEvents,
  ensureMacroCadenceEvents,
  parseHorizon,
};

