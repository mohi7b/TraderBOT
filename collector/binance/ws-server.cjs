/**
 * File: ws-server.cjs
 * Description: Optimized WebSocket Server for 5000-Level OrderBook
 */

const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 9000,
  host: "0.0.0.0"
});

let clients = [];

// ============================================================
// 🔥 مدیریت اتصال کلاینت‌ها
// ============================================================
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

// ============================================================
// 🔥 ارسال امن پیام (با جلوگیری از Backpressure)
// ============================================================
function safeSend(ws, msg) {
  try {
    if (ws.readyState !== WebSocket.OPEN) return;

    // اگر بافر WS پر باشد → پیام را ارسال نکن
    if (ws.bufferedAmount > 5_000_000) {
      console.log("⚠️ WS buffer full → skipping message");
      return;
    }

    ws.send(msg);
  } catch (err) {
    console.error("⚠️ WS Send Error:", err);
  }
}

// ============================================================
// 🔥 ارسال داده‌های اولیه (init)
// ============================================================
function sendInit(candles) {
  const msg = JSON.stringify({
    type: "init",
    data: candles,
  });

  clients.forEach((ws) => safeSend(ws, msg));
}

// ============================================================
// 🔥 ارسال داده‌های لحظه‌ای (delta)
// ============================================================
function sendDelta(path, data) {
  // ساخت JSON فقط یک بار
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
