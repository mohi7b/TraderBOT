/* ============================================================
 * File: charts.cjs
 * Section: orchestrator/aanode/config
 * Role:
 *   Delegating shim. Chart / analysis-horizon definitions are owned by the
 *   Realtime section:
 *
 *     collector/crypto/realtime/config/charts.cjs
 *
 *   The export surface ({ CHARTS, ANALYSIS_HORIZONS }) is identical, so any
 *   existing caller of this path keeps working while the content lives in
 *   exactly one place.
 * ============================================================ */

module.exports = require("../../../collector/crypto/realtime/config/charts.cjs");
