const WebSocket = require("ws");

module.exports = function wsKline(symbol, buffer, writer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m`
  );

  ws.on("open", () => {
    console.log("[WS-KLINE] Connected");
  });

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);
      const k = data.k;

      const kline = {
        startTime: k.t,
        endTime: k.T,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v)
      };

      // ❌ این خط حذف شد
      // buffer.summarizeCandle(kline);

      // مدیریت کندل
      if (!k.x) {
        writer.startCandle(kline, buffer);
        writer.update(buffer);
      } else {
        writer.startCandle(kline, buffer);
        writer.update(buffer);
        writer.closeCandle(buffer);
      }

    } catch (err) {
      console.log("[WS-KLINE] ERROR:", err);
    }
  });

  return ws;
};
