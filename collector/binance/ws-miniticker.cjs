// collector/binance/ws-miniticker.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@miniTicker`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    buffer.live.miniTicker = {
      close: parseFloat(t.c),
      open: parseFloat(t.o),
      high: parseFloat(t.h),
      low: parseFloat(t.l),
      volume: parseFloat(t.v),
      timestamp: t.E
    };
  });

  return ws;
};
