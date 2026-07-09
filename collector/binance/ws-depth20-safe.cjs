// collector/binance/ws-depth20-safe.cjs

const WebSocket = require("ws");

module.exports = function wsDepth20Safe(symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`
  );

  ws.on("open", () => {
    console.log("[WS-DEPTH20] Connected (SAFE MODE)");
  });

  ws.on("message", msg => {
    try {
      const ob = JSON.parse(msg);

      buffer.live.depth20 = {
        bids: ob.bids || [],
        asks: ob.asks || []
      };

      let buyDepth = 0, sellDepth = 0;

      ob.bids.forEach(([_, qty]) => buyDepth += qty);
      ob.asks.forEach(([_, qty]) => sellDepth += qty);

      buffer.live.liquidityGap = Math.abs(buyDepth - sellDepth);

    } catch (err) {
      console.log("[WS-DEPTH20] ERROR:", err);
    }
  });

  return ws;
};
