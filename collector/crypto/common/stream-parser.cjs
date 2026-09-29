/* ============================================================
 * File: stream-parser.cjs
 * Path: collector/crypto/common/stream-parser.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Generic WebSocket frame parser
 *   - Handles JSON parsing, heartbeat, reconnect logic
 *
 * Relations:
 *   - Used by: all realtime exchange plugins
 * ============================================================ */

module.exports = {

    parse(raw) {
        try { return JSON.parse(raw); }
        catch { return null; }
    },

    heartbeat(ws) {
        setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send("ping");
            }
        }, 15000);
    }
};
