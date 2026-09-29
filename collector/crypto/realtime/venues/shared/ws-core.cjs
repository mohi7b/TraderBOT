/**
 * ============================================================
 * File: ws-core.cjs
 * Path: collector/crypto/realtime/venues/shared/ws-core.cjs
 * Version: v1.0.0
 * Description:
 *   Core WebSocket creator. No reconnect, no heartbeat,
 *   no handshake. Pure WS instance.
 * ============================================================
 */

const WebSocket = require("ws");

module.exports = function wsCore(url) {
    return new WebSocket(url);
};
