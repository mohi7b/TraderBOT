// collector/binance/ws-markprice.cjs

const WebSocket = require("ws");

module.exports = function (symbol, buffer) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toUpperCase()}@markPrice`
  );

  ws.on("message", msg => {
    const t = JSON.parse(msg);

    buffer.live.markPrice = {
      price: parseFloat(t.p),
      fundingRate: parseFloat(t.r),
      nextFundingTime: t.T
    };
  });

  return ws;
};
