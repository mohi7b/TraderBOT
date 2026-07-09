/**
 * File: ws-server-realtime.cjs
 * Description: Real-Time WebSocket Server (price, volume, depthLayer0, depthLayer1)
 */

const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 9001,
  host: "0.0.0.0"
});

let clients = [];

// اتصال کلاینت‌ها
wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("\x1b[32m⚡ RealTime WS Connected\x1b[0m");

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("\x1b[31m❌ RealTime WS Disconnected\x1b[0m");
  });
});

// ارسال امن
function safeSend(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 5_000_000) return;
  ws.send(msg);
}

// ارسال داده‌های لحظه‌ای
function sendRealtime(path, data) {
  const msg = JSON.stringify({ type: "delta", path, data });
  clients.forEach((ws) => safeSend(ws, msg));
}

module.exports = { sendRealtime };
