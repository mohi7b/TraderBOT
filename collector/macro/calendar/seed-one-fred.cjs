// One-shot FRED page-1 seed into releases.db (safe, no loop).
// node calendar/seed-one-fred.cjs
const { resolveApiKeys } = require("../config/config.cjs");
const { RELEASE_CALENDAR } = require("./calendar-config.cjs");
const { fetchJson } = require("./sync.cjs");
const { openStore, upsertEvents, computeReleaseTsMs, close } = require("./store.cjs");

(async () => {
  const key = resolveApiKeys().FRED;
  if (!key) return console.log("no FRED key -> skip");
  const cfg = RELEASE_CALENDAR.FRED;
  const today = new Date().toISOString().slice(0, 10);
  const u = `${cfg.baseUrl}${cfg.releasesDatesPath}?api_key=${encodeURIComponent(key)}&file_type=json&limit=200&sort_order=desc&realtime_start=2026-01-01&realtime_end=9999-12-31`;
  const j = await fetchJson(u);
  const rows = (j && j.release_dates) || [];
  const events = rows
    .filter((r) => r && r.date && r.date >= today)
    .map((r) => {
      const release_date = String(r.date);
      const release_time = r.release_time ? String(r.release_time).slice(0, 8) : null;
      return {
        source: "FRED",
        event_label: String(r.release_name || "FRED").slice(0, 120),
        release_date,
        release_time,
        // UTC epoch (ms). FRED gives no time-of-day -> 00:00:00 UTC of the date,
        // aligned 1:1 with UTC chart-candle timestamps (no conversion on read).
        release_ts_ms: computeReleaseTsMs({ release_date, release_time }),
        status: "scheduled",
        source_url: "https://fred.stlouisfed.org",
      };
    });
  if (!events.length) return console.log("no upcoming in first page");
  const db = openStore();
  const n = upsertEvents(db, events);
  close(db);
  console.log("seeded", n, "upcoming FRED events (page1)");
})();
