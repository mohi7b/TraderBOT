const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@markPrice`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    buffer.live.estFunding = {
      fundingRate: parseFloat(t.r),
      estFunding: parseFloat(t.f),
      time: t.E
    };
  });

  return ws;
};

