// collector/binance/ws-depth-diff.cjs

const WebSocket = require("ws");
const axios = require("axios");

// لایه‌های عمق
const updateDepthLayer0 = require("./depth-layer0.cjs");
const buildDepthLayer2 = require("./depth-layer2.cjs");
const buildDepthLayer3 = require("./depth-layer3.cjs");

module.exports = function startDepthDiff(symbol, buffer) {
  const sym = symbol.toUpperCase();

  // ============================================================
  // 🔥 Snapshot اولیه (عمق کامل 1000 سطح)
  // ============================================================
  async function loadSnapshotOnce() {
    try {
      const res = await axios.get(
        `https://fapi.binance.com/fapi/v1/depth?symbol=${sym}&limit=1000`
      );

      const snap = res.data;

      // تبدیل به Map برای diff
      buffer.live.orderbook = {
        bids: buffer.convertToMap(snap.bids),
        asks: buffer.convertToMap(snap.asks),
        lastUpdateId: snap.lastUpdateId
      };

      console.log("[WS-DIFF] Initial snapshot loaded");

      // ساخت لایه 0 از snapshot
      updateDepthLayer0(buffer, {
        bids: snap.bids.map(([p, q]) => ({ price: +p, qty: +q })),
        asks: snap.asks.map(([p, q]) => ({ price: +p, qty: +q }))
      });

      // اجرای اولیه لایه 2 و 3
      buildDepthLayer2(buffer);
      buildDepthLayer3(buffer);

    } catch (err) {
      console.error("[WS-DIFF] Snapshot ERROR:", err);
    }
  }

  loadSnapshotOnce();

  // ============================================================
  // 🔥 WebSocket Diff (عمق کامل لحظه‌ای)
  // ============================================================
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${sym.toLowerCase()}@depth`
  );

  ws.on("open", () => {
    console.log("[WS-DIFF] Connected (SAFE MODE)");
  });

  ws.on("message", msg => {
    try {
      const diff = JSON.parse(msg);

      // اعمال diff روی orderbook کامل
      buffer.applyDiffToOrderBook(diff);

      // تبدیل Map به آرایه برای لایه 0
      const bids = Array.from(buffer.live.orderbook.bids.entries())
        .map(([price, qty]) => ({ price: +price, qty: +qty }))
        .sort((a, b) => b.price - a.price);

      const asks = Array.from(buffer.live.orderbook.asks.entries())
        .map(([price, qty]) => ({ price: +price, qty: +qty }))
        .sort((a, b) => a.price - b.price);

      // لایه 0 (عمق کامل)
      updateDepthLayer0(buffer, { bids, asks });

      // ❗ لایه 2 و 3 اینجا اجرا نمی‌شوند (سنگین هستند)
      // فقط لایه 0 باید آنی باشد

    } catch (err) {
      console.error("[WS-DIFF] ERROR:", err);
    }
  });

  // ============================================================
  // 🔥 اجرای دوره‌ای لایه 2 (هر 15 ثانیه)
  // ============================================================
  setInterval(() => {
    try {
      buildDepthLayer2(buffer);
      // console.log("[DepthLayer2] Updated");
    } catch (err) {
      console.log("[DepthLayer2] ERROR:", err);
    }
  }, 15000);

  // ============================================================
  // 🔥 اجرای دوره‌ای لایه 3 (هر20 ثانیه)
  // ============================================================
  setInterval(() => {
    try {
      buildDepthLayer3(buffer);
      // console.log("[DepthLayer3] Updated");
    } catch (err) {
      console.log("[DepthLayer3] ERROR:", err);
    }
  }, 20000);

  return ws;
};
