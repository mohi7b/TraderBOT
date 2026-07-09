/**
 * File: ws-server-medium.cjs
 * Description: Medium-Time WebSocket Server (depthLayer2, depthLayer3, dashboard)
 */

const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 9002,
  host: "0.0.0.0"
});

let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("\x1b[33m⏳ Medium WS Connected\x1b[0m");

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("\x1b[31m❌ Medium WS Disconnected\x1b[0m");
  });
});

// ارسال امن
function safeSend(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 5_000_000) return;
  ws.send(msg);
}

// Throttle 30 ثانیه‌ای
let lastSend = 0;

function sendMedium(path, data) {
  const now = Date.now();
  if (now - lastSend < 30000) return;

  lastSend = now;

  const msg = JSON.stringify({ type: "delta", path, data });
  clients.forEach((ws) => safeSend(ws, msg));
}

module.exports = { sendMedium };
