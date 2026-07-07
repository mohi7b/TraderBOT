// ws-kline.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer, writer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@kline_1m`
  );

  ws.on("open", () => console.log("[WS-KLINE] Connected."));

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);
      const k = data.k;

      const candle = {
        startTime: k.t,
        endTime: k.T,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isClosed: k.x
      };

      buffer.live.kline = candle;

      if (candle.isClosed) {
        writer.save1mCandle(candle);
      }

    } catch (err) {
      console.error("[WS-KLINE] ERROR:", err);
    }
  });

  return ws;
};
