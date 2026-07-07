// collector/binance/ws-trades.cjs

const WebSocket = require("ws");

module.exports = function wsTrades(symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`
  );

  ws.on("open", () => {
    console.log("[WS-TRADES] Connected");
  });

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);

      const price = parseFloat(data.p);
      const qty = parseFloat(data.q);
      const value = price * qty;
      const isBuyer = data.m === false; // m=false → خریدار

      const trades = buffer.live.trades;

      // تعداد کل تریدها
      trades.count++;

      // حجم خرید/فروش
      if (isBuyer) trades.buyVolume += qty;
      else trades.sellVolume += qty;

      // bigTrades بالای ۵۰ هزار دلار
      if (value >= 50000) {
        trades.bigTrades.push({
          side: isBuyer ? "buy" : "sell",
          price,
          qty,
          value
        });
      }

    } catch (err) {
      console.log("[WS-TRADES] ERROR:", err);
    }
  });

  return ws;
};
