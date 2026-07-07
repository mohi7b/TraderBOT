// collector/binance/ws-depth-diff.cjs

const WebSocket = require("ws");
const buffer = require("./br_buffer.cjs");
const orderbook = require("./orderbook.cjs");
const depthEngine = require("./depth-engine.cjs");

module.exports = function startDepthDiff(symbol) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth`
  );

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // اعمال تغییرات روی اوردر بوک
      orderbook.applyDiff(data.b, data.a);

      // عمق کامل
      const fullDepth = orderbook.getFullDepth();
      buffer.updateDepthFull(fullDepth);

      // عمق 20 لایه
      const depth20 = {
        bids: fullDepth.bids.slice(0, 20),
        asks: fullDepth.asks.slice(0, 20)
      };
      buffer.updateDepth20(depth20.bids, depth20.asks);

      // پردازش عمق مهم (۵۰ نقطه)
      depthEngine.processDepth(fullDepth, buffer);

      // دیوار نقدینگی + مگنت قیمت
      buffer.processDepthImportant();

    } catch (err) {
      console.error("[WS-DIFF] ERROR:", err);
    }
  });

  ws.on("open", () => {
    console.log("[WS-DIFF] Connected to Binance depth stream");
  });

  ws.on("close", () => {
    console.log("[WS-DIFF] Connection closed");
  });

  ws.on("error", (err) => {
    console.error("[WS-DIFF] ERROR:", err);
  });
};
