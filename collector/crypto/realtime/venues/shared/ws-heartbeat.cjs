/**
 * ============================================================
 * File: ws-heartbeat.cjs
 * Path: collector/crypto/realtime/venues/shared/ws-heartbeat.cjs
 * Version: v1.0.0
 * Description:
 *   Standard heartbeat manager:
 *   - Sends ping every 15 seconds
 *   - Clears timer on close/error
 * ============================================================
 */

module.exports = function wsHeartbeat(ws, interval = 15000) {
    const timer = setInterval(() => {
        try {
            ws.send(JSON.stringify({ ping: Date.now() }));
        } catch (_) {}
    }, interval);

    ws.on("close", () => clearInterval(timer));
    ws.on("error", () => clearInterval(timer));
};
