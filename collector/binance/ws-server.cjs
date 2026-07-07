/**
 * File: ws-server.cjs
 * Path: collector/binance/ws-server.cjs
 * Description: سرور WebSocket برای ارسال داده‌های زنده به UI
 */

const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 9000,
  host: "0.0.0.0"
});

let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("🔥 Client connected. Total:", clients.length);

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("❌ Client disconnected. Total:", clients.length);
  });
});

function sendInit(candles) {
  const msg = JSON.stringify({
    type: "init",
    data: candles,
  });
  clients.forEach((ws) => ws.send(msg));
}

function sendDelta(path, data) {
  const msg = JSON.stringify({
    type: "delta",
    path,
    data,
  });
  clients.forEach((ws) => ws.send(msg));
}

module.exports = {
  sendInit,
  sendDelta,
};
