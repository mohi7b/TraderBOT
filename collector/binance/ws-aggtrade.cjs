// collector/binance/ws-aggtrade.cjs

const WebSocket = require("ws");

module.exports = function wsAggTrade(symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`
  );

  ws.on("open", () => console.log("[WS-AGGTRADE] Connected"));

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    const price = parseFloat(t.p);
    const qty = parseFloat(t.q);
    const usd = price * qty;

    buffer.live.trades.count++;

    if (t.m) buffer.live.trades.sellVolume += qty;
    else buffer.live.trades.buyVolume += qty;

    if (usd >= 50000) {
      buffer.live.trades.bigTrades.push({
        price,
        qty,
        usd,
        time: t.T,
        side: t.m ? "sell" : "buy"
      });
    }

    if (!buffer.live.tradeClusters) buffer.live.tradeClusters = [];

    const last = buffer.live.tradeClusters.at(-1);

    if (usd >= 20000) {
      if (!last || t.T - last.endTime > 3000) {
        buffer.live.tradeClusters.push({
          startTime: t.T,
          endTime: t.T,
          volume: usd,
          trades: 1
        });
      } else {
        last.endTime = t.T;
        last.volume += usd;
        last.trades++;
      }
    }
  });

  return ws;
};
