// Root directory for the historical collector.
//
// The raw 1m store (`candles_1m.db`) and the new dynamic timeframe/summary engine both resolve paths
// relative to this root. It is intentionally kept tiny and dependency-free so the Full Downloader and the
// dynamic builders can share a single canonical root without pulling in the retired smart engine.
const path = require("node:path");

// collector/crypto/historical (one directory up from _engine).
const DEFAULT_ROOT = path.join(__dirname, "..");

module.exports = { DEFAULT_ROOT };
