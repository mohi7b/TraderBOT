// collector/binance/br_trades.cjs

module.exports = {
  init() {
    return {
      count: 0,
      buyVolume: 0,
      sellVolume: 0,
      bigTrades: []
    };
  },

  pushTrade(live, price, qty, isBuy) {
    live.trades.count++;

    if (isBuy) live.trades.buyVolume += qty;
    else live.trades.sellVolume += qty;

    if (price * qty >= 50000) {
      live.trades.bigTrades.push({
        price,
        qty,
        side: isBuy ? "buy" : "sell",
        value: price * qty,
        time: Date.now()
      });
    }

    live.lastPrice = price;
  }
};
