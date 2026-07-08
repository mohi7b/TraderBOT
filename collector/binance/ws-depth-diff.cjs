// collector/binance/ws-depth-diff.cjs

const WebSocket = require("ws");
const axios = require("axios");

module.exports = function startDepthDiff(symbol, buffer) {
  const sym = symbol.toUpperCase();

  // ============================================================
  // 🔥 1) Load FULL REST SNAPSHOT (2000 levels)
  // ============================================================
  async function loadSnapshotOnce() {
    try {
      const res = await axios.get(
        `https://fapi.binance.com/fapi/v1/depth?symbol=${sym}&limit=1000`
      );

      const snap = res.data;
      const ob = buffer.live.orderbook;

      ob.bids = buffer.convertToMap(snap.bids);
      ob.asks = buffer.convertToMap(snap.asks);

      ob.lastUpdateId = snap.lastUpdateId;

      console.log(`[WS-DIFF] FULL SNAPSHOT (2000) loaded → ID: ${ob.lastUpdateId}`);

    } catch (err) {
      console.log("[WS-DIFF] Snapshot ERROR:", err);
    }
  }

  loadSnapshotOnce();

  // ============================================================
  // 🔥 2) WebSocket DepthDiff Stream (NO RECONNECT)
  // ============================================================
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${sym.toLowerCase()}@depth`
  );

  ws.on("open", () => {
    console.log("[WS-DIFF] Connected to Binance DepthDiff");
  });

  ws.on("message", msg => {
    try {
      const diff = JSON.parse(msg);

      buffer.applyDiffToOrderBook(diff);

      buffer.live.orderbook.lastUpdateId = diff.u;

    } catch (err) {
      console.log("[WS-DIFF] ERROR:", err);
    }
  });

  return ws;
};
