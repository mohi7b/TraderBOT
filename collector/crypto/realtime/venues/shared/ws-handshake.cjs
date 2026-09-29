/**
 * ============================================================
 * File: ws-handshake.cjs
 * Path: collector/crypto/realtime/venues/shared/ws-handshake.cjs
 * Version: v1.0.0
 * Description:
 *   Pre-subscription handshake for exchanges that require
 *   connection rituals before subscribing.
 * ============================================================
 */

module.exports = async function wsHandshake(ws, exchange) {
    switch (exchange) {
        case "bitmex":
            ws.send(JSON.stringify({ op: "authKeyExpires", args: [] }));
            break;

        case "deribit":
            ws.send(JSON.stringify({
                jsonrpc: "2.0",
                method: "public/subscribe",
                params: {}
            }));
            break;

        case "kraken":
            ws.send(JSON.stringify({ event: "ping" }));
            break;

        case "coinbase":
            ws.send(JSON.stringify({ type: "subscribe", channels: [] }));
            break;

        default:
            break;
    }
};
