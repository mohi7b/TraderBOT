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

  ws.on("error", (err) => {
    console.error("⚠️ WS Client Error:", err);
  });
});

/**
 * ارسال امن پیام به کلاینت‌ها
 */
function safeSend(ws, msg) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  } catch (err) {
    console.error("⚠️ WS Send Error:", err);
  }
}

/**
 * ارسال داده‌های اولیه (init)
 */
function sendInit(candles) {
  const msg = JSON.stringify({
    type: "init",
    data: candles,
  });

  clients.forEach((ws) => safeSend(ws, msg));
}

/**
 * ارسال داده‌های لحظه‌ای (delta)
 */
function sendDelta(path, data) {
  const msg = JSON.stringify({
    type: "delta",
    path,
    data,
  });

  clients.forEach((ws) => safeSend(ws, msg));
}

module.exports = {
  sendInit,
  sendDelta,
};
