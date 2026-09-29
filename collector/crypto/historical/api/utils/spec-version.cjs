// Contract versions exposed by the historical service (single place, mirrored
// in the frontend constants — kept in sync by test/normalize-s1.test.cjs).
//
//   baseVersion  = the macro/engine contract (ChartSpecV3) — untouched by us
//   specVersion  = the historical domain contract (HistoricalSpec) — 3.2 adds
//                  {closed, forming} support and provisional/confirmed policy.
const SPEC_VERSIONS = Object.freeze({ baseVersion: "3.0", specVersion: "3.2" });

module.exports = { SPEC_VERSIONS };
