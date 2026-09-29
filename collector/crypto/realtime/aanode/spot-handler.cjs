/* ============================================================
 * File: collector/crypto/realtime/aanode/spot-handler.cjs
 * Section: collector/crypto/realtime/aanode  (legacy path — kept as a shim)
 *
 * Role:
 *   Backward-compatible re-export. The real implementation now lives in
 *   collector/crypto/realtime/ingest/spot-handler.cjs and is driven by
 *   collector/crypto/realtime/registrations/spot.cjs.
 *
 *   Kept so the historical require path keeps working:
 *     - test/spot-five-exchanges.test.cjs
 *     - collector/crypto/realtime/aanode/bootstrap.cjs (legacy)
 * ============================================================ */

module.exports = require("../ingest/spot-handler.cjs");
