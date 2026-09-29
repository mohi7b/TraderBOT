/* ============================================================
 * File: collector/crypto/realtime/aanode/futures-handler.cjs
 * Section: collector/crypto/realtime/aanode  (legacy path — kept as a shim)
 *
 * Role:
 *   Backward-compatible re-export. The real implementation now lives in
 *   collector/crypto/realtime/ingest/futures-handler.cjs and is driven by
 *   collector/crypto/realtime/registrations/futures.cjs.
 *
 *   Kept so the historical require path keeps working:
 *     - test/futures-seven-step-exchanges.test.cjs
 *     - collector/crypto/realtime/aanode/bootstrap.cjs (legacy)
 * ============================================================ */

module.exports = require("../ingest/futures-handler.cjs");
