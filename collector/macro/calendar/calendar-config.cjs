// ============================================================
// Macro Calendar — provider/endpoint configuration
// File: collector/macro/calendar/calendar-config.cjs
//
// Lite config — URL/endpoint of the source release-calendar feeds,
// separated OUT of the sync/fetch code so only this file (or the
// JSON) points where to pull upcoming release dates from.
//
// Note: providers that have no explicit event calendar API
// (IMF, OECD, WORLD_BANK) are driven by cadence + data watermark
// instead; their "endpoint" is the data API used for light-check.
// ============================================================

// Machine-readable endpoints (kept as JSON-able plain object).
const RELEASE_CALENDAR = {
  FRED: {
    type: "rest", // fred web-api; needs free key
    baseUrl: process.env.MACRO_FRED_API || "https://api.stlouisfed.org/fred",
    releasesDatesPath: "/releases/dates", // ?api_key&realtime_start=&limit=
    // Note: fredgraph.csv (key-less) is used for data, not for dates.
    auth: "api_key",
  },
  BIS: {
    type: "sdmx",
    // SDMX 2.1 data API. `calendarDataflow` is the real release-schedule dataflow
    // (confirmed live: it exists and returns a CSV with header
    //   FREQ,CATEGORY,RELEASE_TYPE,TIME_PERIOD,OBS_VALUE,...
    // where OBS_VALUE is the release date YYYYMMDD of the data period).
    baseUrl: process.env.MACRO_BIS_SDMX || "https://stats.bis.org/api/v1",
    calendarDataflow: "BIS,BIS_REL_CAL,1.0",
    dataPath: "/data",
    format: "csv", // only csv is accepted by this SDMX endpoint (jsonstat -> 406)
    releaseUrl: "https://data.bis.org/topics/release-calendar",
  },
  EUROSTAT: {
    type: "json", // official Eurostat release-calendar JSON feed (used by the webpage FullCalendar)
    baseUrl: process.env.MACRO_EUROSTAT_CAL || "https://ec.europa.eu",
    eventsPath: "/eurostat/o/calendars/eventsJson", // needs start & end params (YYYY-MM-DD)
    // SSR fallback page (always has published macro-release items even when the
    // calendar JSON backend is empty). Columns: title, PUBLISHED date, link.
    pageUrl:
      process.env.MACRO_EUROSTAT_EURO_IND_PAGE ||
      "https://ec.europa.eu/eurostat/web/main/news/euro-indicators",
    releaseUrl: "https://ec.europa.eu/eurostat/web/main/news/release-calendar",
  },
};

// Sources WITHOUT an explicit machine event-calendar -> cadence/watermark.
const CADENCE_ONLY = ["OECD", "IMF", "WORLD_BANK"];

// ============================================================
// Release windows (per source)
// ============================================================
// For each macro source: the post-scheduled-time window in which the engine is
// allowed to (optionally poll and) pick up newly published data.
//
//   start_offset_minutes  : minutes AFTER scheduled_time the window opens.
//   end_offset_minutes    : minutes AFTER scheduled_time the window closes.
//   polling               : if true the engine retries every poll_interval
//                           until end_offset, instead of running once.
//   poll_interval_minutes : retry spacing (only used when polling=true).
//   fallback              : "html" for Eurostat SSR fallback, else null.
//
// NOTE: FOMC is not a standalone upstream source in this codebase — it is a
// FRED sub-event (event_label "FOMC Press Release"). It is listed here as its
// own key (per the architecture spec) so a future dedicated FOMC feed can be
// driven by the same window engine; until then windowFor() falls back to FRED
// when no dedicated row exists for a source.
const RELEASE_WINDOWS = {
  FOMC:       { start_offset_minutes: 0, end_offset_minutes: 5,   polling: false, poll_interval_minutes: null, fallback: null },
  FRED:       { start_offset_minutes: 0, end_offset_minutes: 5,   polling: false, poll_interval_minutes: null, fallback: null },
  BIS:        { start_offset_minutes: 0, end_offset_minutes: 5,   polling: false, poll_interval_minutes: null, fallback: null },
  OECD:       { start_offset_minutes: 0, end_offset_minutes: 120, polling: true,  poll_interval_minutes: 15,  fallback: null },
  IMF:        { start_offset_minutes: 0, end_offset_minutes: 120, polling: true,  poll_interval_minutes: 15,  fallback: null },
  WORLD_BANK: { start_offset_minutes: 0, end_offset_minutes: 120, polling: true,  poll_interval_minutes: 15,  fallback: null },
  EUROSTAT:   { start_offset_minutes: 0, end_offset_minutes: 180, polling: true,  poll_interval_minutes: 15,  fallback: "html" },
};

/** Safe fallback used when a source has no explicit window defined. */
const DEFAULT_RELEASE_WINDOW = Object.freeze({
  start_offset_minutes: 0,
  end_offset_minutes: 5,
  polling: false,
  poll_interval_minutes: null,
  fallback: null,
});

/** Resolve the release window for a source (fallback for unknown keys). */
function windowFor(source) {
  return RELEASE_WINDOWS[source] || DEFAULT_RELEASE_WINDOW;
}

module.exports = {
  RELEASE_CALENDAR,
  CADENCE_ONLY,
  RELEASE_WINDOWS,
  DEFAULT_RELEASE_WINDOW,
  windowFor,
};
