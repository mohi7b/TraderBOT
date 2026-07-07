// collector/binance/br_volatility.cjs

module.exports = {
  summarize(live, candle) {
    live.volatility.micro = Math.abs(candle.high - candle.low);

    live.marketDirection =
      live.trades.buyVolume > live.trades.sellVolume
        ? "buy"
        : "sell";
  }
};
