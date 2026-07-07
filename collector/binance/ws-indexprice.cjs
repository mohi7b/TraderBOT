const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@indexPrice`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    buffer.live.indexPrice = {
      price: parseFloat(t.p),
      time: t.E
    };
  });

  return ws;
};

