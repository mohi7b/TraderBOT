// ============================================================
// Macro Calendar — release-rule.cjs (optional, explicit release calendars)
//
// Some providers expose an explicit release schedule we can poll for
// (BIS_REL_CAL dataflow, FRED /fred/releases/dates). Putting that
// accessor here keeps it out of the update download flow. Today this is a
// light stub — the cadence-based is-due is the default. When you hit a
// real provider calendar you can implement fetchExplicitReleaseDates(...).
// ============================================================

/**
 * Given a source key, return true if a provider exposes an explicit
 * machine-usable release-calendar we can consult. (Placeholder — not wired.)
 */
function hasExplicitReleaseCalendar(source) {
  const explicit = new Set(["BIS", "FRED", "EUROSTAT"]);
  return explicit.has(source);
}

/** Placeholder: fetch next release candidates for an explicit-calendar source. */
async function fetchExplicitReleaseDates(/* source, opts */) {
  // In a future step: BIS_REL_CAL via stats.bis.org SDMX, FRED releases/dates,
  // Eurostat release-calendar API. Intentionally not implemented now.
  return [];
}

module.exports = { hasExplicitReleaseCalendar, fetchExplicitReleaseDates };
