/* ============================================================
 * File: collector/aanode/handler.cjs
 * Role:
 *   Collector Handler
 *   - دریافت پکت از Realtime / Historical / Macro / Sentiment
 *   - ارسال پکت به Orchestrator برای ادامهٔ پردازش
 * ============================================================ */

const log = require("../../orchestrator/utils/log-manager.cjs");

module.exports = function collectorHandler(packet) {
    console.log("CollectorHandler → Packet received", packet);

    try {
        packet.stage++;   // ✔ مرحله بعدی

        global.orchestrator.route(packet);   // ✔ ارسال به مرحله بعدی

    } catch (err) {
        console.error("CollectorHandler Error:", err);
    }
};
