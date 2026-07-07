// collector/binance/br_behavior.cjs

module.exports = {
  computeBehavior(live) {
    const walls = live.liquidityWalls;
    const magnet = live.priceMagnet || { direction: "neutral" };
    const trades = live.trades;

    let behavior = {
      mode: "neutral",
      reason: "",
      wallSide: null,
      magnetDirection: magnet.direction,
      bigTradeDetected: trades.bigTrades.length > 0
    };

    const hasBuyWall = walls.buyWalls.length > 0;
    const hasSellWall = walls.sellWalls.length > 0;

    if (magnet.direction === "up") {
      behavior.mode = "attracted_up";
      behavior.reason = "قیمت به سمت دیوار خرید کشیده می‌شود";
      behavior.wallSide = "buy";
    }

    if (magnet.direction === "down") {
      behavior.mode = "attracted_down";
      behavior.reason = "قیمت به سمت دیوار فروش کشیده می‌شود";
      behavior.wallSide = "sell";
    }

    if (hasBuyWall && magnet.direction === "down") {
      behavior.mode = "fake_buy_wall";
      behavior.reason = "دیوار خرید فیک است";
      behavior.wallSide = "buy";
    }

    if (hasSellWall && magnet.direction === "up") {
      behavior.mode = "fake_sell_wall";
      behavior.reason = "دیوار فروش فیک است";
      behavior.wallSide = "sell";
    }

    if (trades.bigTrades.length > 0) {
      behavior.mode = "liquidity_hunt";
      behavior.reason = "ترید بزرگ → شکار نقدینگی";
    }

    live.marketMakerBehavior = behavior;
  }
};
