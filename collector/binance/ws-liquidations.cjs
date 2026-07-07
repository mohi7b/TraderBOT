// collector/binance/ws-liquidations.cjs

const WebSocket = require("ws");

module.exports = function wsLiquidations(symbol, buffer) {
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@forceOrder`
  );

  ws.on("open", () => console.log("✔ ws-liquidations connected"));

  ws.on("message", msg => {
    const data = JSON.parse(msg).o;

    const price = parseFloat(data.p);
    const qty = parseFloat(data.q);
    const usd = price * qty;

    const side = data.S.toLowerCase(); // BUY / SELL

    // تجمیع حجم لیکوییدیشن
    if (side === "buy") buffer.live.liquidationBuy += usd;
    else buffer.live.liquidationSell += usd;

    // بیگ‌لیکوییدیشن‌ها
    if (usd >= 50000) {
      buffer.live.bigLiquidations.push({
        price,
        qty,
        usd,
        side,
        time: data.T
      });
    }

    // خوشه‌های لیکوییدیشن
    if (!buffer.live.liquidationClusters) buffer.live.liquidationClusters = [];

    const last = buffer.live.liquidationClusters.at(-1);

    if (usd >= 20000) {
      if (!last || data.T - last.endTime > 3000) {
        buffer.live.liquidationClusters.push({
          startTime: data.T,
          endTime: data.T,
          volume: usd,
          trades: 1
        });
      } else {
        last.endTime = data.T;
        last.volume += usd;
        last.trades++;
      }
    }
  });

  return ws;
};
