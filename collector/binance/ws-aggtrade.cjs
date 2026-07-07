// collector/binance/ws-aggtrade.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    const price = parseFloat(t.p);
    const qty = parseFloat(t.q);
    const usd = price * qty;

    buffer.live.aggTrade = {
      price,
      qty,
      usd,
      isBuyerMaker: t.m,
      latency: Date.now() - t.T,
      tradeId: t.a
    };
  });

  return ws;
};
