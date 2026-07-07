// ws-depth20.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@depth20@100ms`
  );

  ws.on("open", () => console.log("[WS-20] Connected."));

  ws.on("message", msg => {
    try {
      const ob = JSON.parse(msg);

      buffer.live.depth20 = {
        bids: ob.bids || [],
        asks: ob.asks || []
      };

    } catch (err) {
      console.error("[WS-20] ERROR:", err);
    }
  });

  return ws;
};
