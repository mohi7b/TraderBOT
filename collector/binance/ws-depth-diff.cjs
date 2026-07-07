// collector/binance/ws-depth-diff.cjs

const WebSocket = require("ws");
const axios = require("axios");

module.exports = function startDepthDiff(symbol, buffer) {
  const sym = symbol.toUpperCase();

  // -------------------------------
  // Snapshot Loader (Resync ساده)
  // -------------------------------
  async function loadSnapshot() {
    try {
      const res = await axios.get(
        `https://api.binance.com/api/v3/depth?symbol=${sym}&limit=1000`
      );

      const snap = res.data;

      const ob = buffer.live.orderbook;

      ob.bids = {};
      ob.asks = {};
      ob.lastUpdateId = snap.lastUpdateId;

      for (const [p, q] of snap.bids) {
        ob.bids[parseFloat(p)] = parseFloat(q);
      }

      for (const [p, q] of snap.asks) {
        ob.asks[parseFloat(p)] = parseFloat(q);
      }

      ob.gapDetected = false;
      ob.checksumValid = true;

      console.log("[WS-DIFF] Snapshot loaded:", ob.lastUpdateId);

    } catch (err) {
      console.log("[WS-DIFF] Snapshot ERROR:", err);
    }
  }

  // اولین snapshot
  loadSnapshot();

  // -------------------------------
  // WebSocket Diff Stream
  // -------------------------------
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@depth`
  );

  ws.on("open", () => {
    console.log("[WS-DIFF] Connected");
  });

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);

      const ob = buffer.live.orderbook;

      const U = data.U;
      const u = data.u;
      const pu = data.pu;

      // -------------------------------
      // GAP Detection
      // -------------------------------
      if (pu !== ob.lastUpdateId) {
        console.log("[WS-DIFF] GAP detected → resyncing...");
        ob.gapDetected = true;
        loadSnapshot();   // فقط snapshot جدید
        return;
      }

      ob.gapDetected = false;

      // -------------------------------
      // اعمال diff
      // -------------------------------
      buffer.applyDiff(data.b, data.a);

      ob.lastUpdateId = u;

      // -------------------------------
      // Checksum ساده (فقط علامت)
      // -------------------------------
      ob.checksumValid = true;

    } catch (err) {
      console.log("[WS-DIFF] ERROR:", err);
    }
  });

  return ws;
};
