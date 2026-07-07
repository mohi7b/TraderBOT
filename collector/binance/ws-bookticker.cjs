// collector/binance/ws-bookticker.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@bookTicker`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    const bestBid = parseFloat(t.b);
    const bestAsk = parseFloat(t.a);
    const spread = bestAsk - bestBid;

    buffer.live.ticker = {
      bestBid,
      bestAsk,
      spread,
      midPrice: (bestBid + bestAsk) / 2,
      timestamp: t.E
    };

    // micro trend
    if (!buffer.live.lastPrice) {
      buffer.live.lastPrice = bestBid;
    } else {
      const diff = bestBid - buffer.live.lastPrice;
      buffer.live.microTrend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      buffer.live.lastPrice = bestBid;
    }
  });

  return ws;
};
