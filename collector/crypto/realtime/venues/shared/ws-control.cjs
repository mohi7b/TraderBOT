/**
 * ============================================================
 * File: ws-control.cjs
 * Path: collector/crypto/realtime/venues/shared/ws-control.cjs
 * Version: v1.0.0
 * Description:
 *   WebSocket control layer:
 *   - Reconnect (max 5 attempts)
 *   - Backoff: 1s → 5s → 10s → 20s → 30s
 *   - Circuit breaker after 5 failures
 *   - Critical error reporting to Command System
 * ============================================================
 */

module.exports = function wsControl({ url, onConnect, onCritical }) {
    let retry = 0;
    const delays = [1000, 5000, 10000, 20000, 30000];

    function connect() {
        const ws = new (require("ws"))(url);

        ws.on("open", () => {
            retry = 0;
            onConnect(ws);
        });

        ws.on("error", err => handleError(err));
        ws.on("close", () => handleError(new Error("WS closed unexpectedly")));
    }

    function handleError(err) {
        retry++;

        if (retry > 5) {
            onCritical({
                type: "WS_CRITICAL_FAILURE",
                message: "WebSocket failed after 5 retries",
                url,
                timestamp: Date.now()
            });
            return;
        }

        const delay = delays[retry - 1];
        setTimeout(connect, delay);
    }

    connect();
};
