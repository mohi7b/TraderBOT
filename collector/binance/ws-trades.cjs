const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`
  );

  ws.on("open", () => console.log("[WS-TRADES] Connected."));

  ws.on("message", msg => {
    try {
      const t = JSON.parse(msg);

      const price = parseFloat(t.p);
      const qty = parseFloat(t.q);
      const isBuy = t.m === false;

     // console.log("[TRADE]", price, qty, isBuy);  // تست

      buffer.pushTrade(price, qty, isBuy);


    } catch (err) {
      console.error("[WS-TRADES] ERROR:", err);
    }
  });

  return ws;
};
