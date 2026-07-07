class AlertEngine {
  constructor() {
    this.alerts = [
      {
        name: "fake_wall_detected",
        enabled: true,
        condition: (live) =>
          live.fakeWalls &&
          (live.fakeWalls.buy.length > 0 || live.fakeWalls.sell.length > 0),
        message: (live) => {
          const buy = live.fakeWalls.buy.length;
          const sell = live.fakeWalls.sell.length;
          return `Fake walls detected → BUY: ${buy}, SELL: ${sell}`;
        }
      },

      {
        name: "big_trade_detected",
        enabled: true,
        condition: (live) => live.trades.bigTrades.length > 0,
        message: (live) => {
          const t = live.trades.bigTrades.at(-1);
          return `Big trade → ${t.value.toFixed(0)} USDT (${t.side})`;
        }
      },

      {
        name: "magnet_strong",
        enabled: true,
        condition: (live) =>
          live.priceMagnet &&
          (live.priceMagnet.strongestBuy?.magnet > 5 ||
           live.priceMagnet.strongestSell?.magnet > 5),
        message: (live) => {
          const dir = live.priceMagnet.direction;
          return `Strong magnet → ${dir}`;
        }
      }
    ];

    this.lastAlerts = [];
  }

  run(live) {
    const triggered = [];

    this.alerts.forEach(alert => {
      if (!alert.enabled) return;

      try {
        if (alert.condition(live)) {
          triggered.push({
            name: alert.name,
            text: alert.message(live)
          });
        }
      } catch (err) {
        console.error("[ALERT ERROR]", alert.name, err);
      }
    });

    live.alerts = triggered;
  }
}

module.exports = new AlertEngine();
