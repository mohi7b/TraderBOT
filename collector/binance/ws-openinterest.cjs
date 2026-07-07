// collector/binance/ws-openinterest.cjs

const WebSocket = require("ws");

module.exports = function wsOpenInterest(symbol, buffer) {
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@openInterest`
  );

  ws.on("open", () => {
    console.log("[WS-OI] Connected.");
  });

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);

      buffer.live.openInterest = {
        oi: parseFloat(data.openInterest),
        time: data.time
      };

    } catch (err) {
      console.error("[WS-OI] ERROR:", err);
    }
  });

  ws.on("error", err => {
    console.error("[WS-OI] WS ERROR:", err);
  });

  return ws;   // 🔥 این خط ضروری است
};
