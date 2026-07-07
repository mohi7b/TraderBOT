
// collector/binance/ws-orderbook.cjs



module.exports = function (symbol, buffer) {
  const WebSocket = require("ws");

  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth5@100ms`
  );

  ws.on("message", msg => {
    const ob = JSON.parse(msg);

    const bids = ob.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
    const asks = ob.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

    buffer.updateOrderbook(bids, asks);
  });

  return ws;   // ✔ اضافه شد
};
