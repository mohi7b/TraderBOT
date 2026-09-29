// ============================================================
// Macro Calendar — release events store
// File: collector/macro/calendar/store.cjs
//
// A small, light SQLite store (better-sqlite3) of REAL future/actual
// release-event dates pulled from the official providers. Separate from
// macro.db so the big DB stays clean. Table:
//
//   release_events(
//     id            INTEGER PRIMARY KEY,
//     source        TEXT,      -- FRED | BIS | OECD | EUROSTAT | IMF | WORLD_BANK
//     category      TEXT,      -- optional group e.g. "inflation", "rates"
//     event_label   TEXT,      -- e.g. "CPI", "policy rate", ...
//     country       TEXT,
//     release_date  TEXT,      -- YYYY-MM-DD
//     release_time  TEXT NULL, -- HH:MM (optional)
//     release_ts_ms INTEGER,   -- Unix epoch ms (UTC) := combine(release_date, release_time)
//                              -- release_time==NULL => 00:00:00 UTC of release_date
//                              -- so a macro event maps 1:1 onto chart candle timestamps.
//     source_url    TEXT NULL, -- official page/web link
//     status        TEXT,      -- "scheduled" | "released" | "canceled"
//     revision      INTEGER,   -- bumped when the same logical event changes
//     updated_at    TEXT       -- ISO timestamp of last sync
//   )
//   + index on (source, release_date)
//
// Events are upserted by a natural key = source + event_label + release_date
// (so re-sync never duplicates), and deletes/stale-cleanup are explicit.
// ============================================================
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3"); // present in root node_modules

const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "releases.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS release_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  category     TEXT,
  event_label  TEXT NOT NULL,
  country      TEXT,
  release_date TEXT NOT NULL,            -- YYYY-MM-DD
  release_time TEXT,
  release_ts_ms INTEGER,                 -- Unix epoch ms (UTC) resolved from release_date release_time
  source_url   TEXT,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  revision     INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rel_source_date ON release_events(source, release_date);
CREATE INDEX IF NOT EXISTS idx_rel_date           ON release_events(release_date);

-- Structured, API-readable macro error log (see prampt1.txt §3).
CREATE TABLE IF NOT EXISTS macro_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  error_code  TEXT NOT NULL,      -- NO_UPCOMING_EVENTS | MISSED_EVENT | EMPTY_JSON | ...
  source      TEXT,               -- FRED | BIS | EUROSTAT | OECD | IMF | WORLD_BANK
  event_id    TEXT,               -- optional logical event reference
  timestamp   TEXT NOT NULL,      -- ISO timestamp
  details     TEXT                -- free-form diagnostic message
);
CREATE INDEX IF NOT EXISTS idx_err_code   ON macro_errors(error_code);
CREATE INDEX IF NOT EXISTS idx_err_source ON macro_errors(source);
CREATE INDEX IF NOT EXISTS idx_err_ts     ON macro_errors(timestamp);
`;
// NOTE: the index/column release_ts_ms is deliberately NOT created here. The
// ts column must be added (ALTER) on DBs that predate it BEFORE any statement
// referencing it can run, so it lives in `migrateAddReleaseTsMs` below,
// executed after CREATE TABLE IF NOT EXISTS.
// Column we may need to add to a DB that was already created before this column
// existed. `CREATE TABLE IF NOT EXISTS` does NOT add a column to an existing
// table, so we migrate explicitly below.
const TS_COL = "release_ts_ms";

/**
 * Natural key used to upsert safely: source + event_label + release_date.
 * If an event changes its date, the update should first move/close the old
 * timed row; simplest is upsert (INSERT OR REPLACE), then fix ids.
 */
function naturalKey(ev) {
  return [ev.source, ev.event_label, ev.release_date].join("|");
}

/** Open a writable store (auto-mkdir + schema). */
function openStore(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateAddReleaseTsMs(db);
  backfillReleaseTsMs(db);
  return db;
}

/**
 * If the release_events table already existed (DB made before release_ts_ms was
 * introduced) `CREATE TABLE IF NOT EXISTS` leaves it untouched, so we add the
 * column + index on the fly. Index is built before the backfill so the UPDATE
 * below can use it.
 */
function migrateAddReleaseTsMs(db) {
  const cols = db.prepare(`PRAGMA table_info(release_events)`).all().map((c) => c.name);
  if (!cols.includes(TS_COL)) {
    db.exec(`ALTER TABLE release_events ADD COLUMN ${TS_COL} INTEGER`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rel_ts_ms ON release_events(${TS_COL})`);
}

/** Fill NULL release_ts_ms values (legacy rows) from their date descriptor. */
function backfillReleaseTsMs(db) {
  const rows = db.prepare(`SELECT id, release_date, release_time FROM release_events WHERE ${TS_COL} IS NULL`).all();
  if (!rows.length) return 0;
  const upd = db.prepare(`UPDATE release_events SET ${TS_COL} = ? WHERE id = ?`);
  const tx = db.transaction((list) => {
    let n = 0;
    for (const r of list) {
      const ts = computeReleaseTsMs({ release_date: r.release_date, release_time: r.release_time });
      if (Number.isFinite(ts)) {
        upd.run(ts, r.id);
        n += 1;
      }
    }
    return n;
  });
  return tx(rows);
}

/**
 * Build a Unix epoch timestamp (ms, UTC) for a release from its calendar fields.
 * - release_date "YYYY-MM-DD" is REQUIRED.
 * - Optional release_time "HH:MM" or "HH:MM:SS" (24h) adjusts the time-of-day;
 *   when omitted, the event resolves to 00:00:00 UTC of release_date.
 * Parsing is done explicitly via Date.UTC so the result is independent of the
 * host machine timezone and lines up 1:1 with UTC chart-candle timestamps.
 * Returns an integer, or null when release_date is missing/unparseable.
 */
function computeReleaseTsMs(ev) {
  const dateStr = ev && ev.release_date;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return null;
  let hh = 0, mm = 0, ss = 0;
  const t = ev.release_time;
  if (t != null && String(t).trim() !== "") {
    const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t).trim());
    if (tm) {
      hh = Math.min(23, parseInt(tm[1], 10));
      mm = Math.min(59, parseInt(tm[2], 10));
      ss = tm[3] ? Math.min(59, parseInt(tm[3], 10)) : 0;
    }
    // no match => keep 00:00:00 (safe fallback for unknown/malformed time)
  }
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mm, ss);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Upsert an array of events in one transaction.
 * Matching rule: same source+event_label+release_date => update extras.
 * Uses INSERT ... ON CONFLICT over a UNIQUE constraint we create lazily.
 */
function upsertEvents(db, events) {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_rel ON release_events(source,event_label,release_date)");
  const upsert = db.prepare(`
    INSERT INTO release_events
      (source, category, event_label, country, release_date, release_time, release_ts_ms, source_url, status, revision, updated_at)
    VALUES (@source, @category, @event_label, @country, @release_date, @release_time, @release_ts_ms, @source_url, @status, 1, @updated_at)
    ON CONFLICT(source, event_label, release_date)
    DO UPDATE SET
      category=excluded.category, country=excluded.country,
      release_time=excluded.release_time, release_ts_ms=excluded.release_ts_ms,
      source_url=excluded.source_url,
      status=excluded.status,
      revision=release_events.revision+1,
      updated_at=excluded.updated_at
  `);
  const tx = db.transaction((evs) => {
    let n = 0;
    for (const ev of evs) {
      const updated_at = ev.updated_at || new Date().toISOString();
      // Always derive from the descriptor; if the caller did not pre-compute a
      // ts we resolve it here so callers starting from a bare date still work.
      const release_ts_ms =
        Number.isFinite(ev.release_ts_ms) && Number.isInteger(ev.release_ts_ms)
          ? ev.release_ts_ms
          : computeReleaseTsMs({ release_date: ev.release_date, release_time: ev.release_time });
      const row = {
        source: ev.source, category: ev.category ?? null,
        event_label: ev.event_label, country: ev.country ?? null,
        release_date: ev.release_date, release_time: ev.release_time ?? null,
        release_ts_ms,
        source_url: ev.source_url ?? null, status: ev.status || "scheduled",
        updated_at,
      };
      const info = upsert.run(row);
      n += info.changes;
    }
    return n;
  });
  return tx(events);
}

/**
 * Fetch events in a date window (inclusive). Default: upcoming (release_date >= today).
 */
function listEvents(db, { source = null, from = null, to = null, status = null } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const clauses = [];
  const a = [];
  if (source) { clauses.push("source = ?"); a.push(source); }
  if (from) { clauses.push("release_date >= ?"); a.push(from); }
  else if (!from) { clauses.push("release_date >= ?"); a.push(today); }
  if (to) { clauses.push("release_date <= ?"); a.push(to); }
  if (status) { clauses.push("status = ?"); a.push(status); }
  const sql = `SELECT * FROM release_events ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY release_date ASC, source`;
  return db.prepare(sql).all(...a);
}

/** Mark events that are already in the past as 'released'. Optionally cleanup stale ones. */
function rollPastToReleased(db, cutoff = null) {
  const today = cutoff || new Date().toISOString().slice(0, 10);
  const info = db.prepare("UPDATE release_events SET status='released' WHERE status NOT IN ('canceled','missed') AND release_date < ?").run(today);
  return info.changes;
}

/** Delete rows older than N days (storage hygiene). Returns removed count. */
function purgeBefore(db, days = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const info = db.prepare("DELETE FROM release_events WHERE release_date < ? AND status='released'").run(d.toISOString().slice(0, 10));
  return info.changes;
}

/**
 * Record one structured macro error row (prampt1.txt §3).
 * @param {import("better-sqlite3").Database} db
 * @param {{error_code:string, source?:string|null, event_id?:string|null,
 *          timestamp?:string, details?:string}} err
 * @returns {number} rows written (0 or 1)
 */
function recordError(db, err) {
  const row = {
    error_code: (err && err.error_code) || "UNKNOWN",
    source: err && err.source != null ? err.source : null,
    event_id: err && err.event_id != null ? err.event_id : null,
    timestamp: (err && err.timestamp) || new Date().toISOString(),
    details: err && err.details != null ? String(err.details) : null,
  };
  return db
    .prepare(
      "INSERT INTO macro_errors (error_code, source, event_id, timestamp, details) " +
        "VALUES (@error_code, @source, @event_id, @timestamp, @details)"
    )
    .run(row).changes;
}

/** Record an array of error rows in one transaction. Returns total inserted. */
function recordErrors(db, errs) {
  const tx = db.transaction((list) => {
    let n = 0;
    for (const e of list || []) n += recordError(db, e);
    return n;
  });
  return tx(errs || []);
}

/**
 * Read errors back (most recent first). Supports optional source / error_code
 * filters and a limit (default 100).
 */
function listErrors(db, { source = null, error_code = null, limit = 100 } = {}) {
  const clauses = [];
  const a = [];
  if (source) { clauses.push("source = ?"); a.push(source); }
  if (error_code) { clauses.push("error_code = ?"); a.push(error_code); }
  let sql =
    "SELECT * FROM macro_errors" +
    (clauses.length ? " WHERE " + clauses.join(" AND ") : "") +
    " ORDER BY id DESC";
  if (limit && Number.isInteger(limit) && limit > 0) {
    sql += " LIMIT ?";
    a.push(limit);
  }
  return db.prepare(sql).all(...a);
}

/**
 * Self-contained convenience: open the default store, record one error, close.
 * For callers that don't already hold a store handle.
 */
function appendError(err) {
  const db = openStore();
  try {
    return recordError(db, err);
  } finally {
    close(db);
  }
}

function close(db) { try { db.close(); } catch {} }

module.exports = {
  DB_PATH,
  openStore,
  upsertEvents,
  listEvents,
  rollPastToReleased,
  purgeBefore,
  naturalKey,
  computeReleaseTsMs,
  recordError,
  recordErrors,
  listErrors,
  appendError,
  close,
};
