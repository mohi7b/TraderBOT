// collector/binance/br_magnet.cjs

module.exports = {
  computePriceMagnet(live) {
    const walls = live.liquidityWalls;
    const lastPrice = live.lastPrice;

    if (!walls || !lastPrice) return;

    const calcMagnet = (wall) => {
      const dist = Math.abs(wall.price - lastPrice);
      if (dist === 0) return wall.qty * 10;
      return wall.qty / dist;
    };

    let strongestBuy = null;
    let strongestSell = null;

    if (walls.buyWalls.length > 0) {
      strongestBuy = walls.buyWalls
        .map(w => ({ ...w, magnet: calcMagnet(w) }))
        .sort((a, b) => b.magnet - a.magnet)[0];
    }

    if (walls.sellWalls.length > 0) {
      strongestSell = walls.sellWalls
        .map(w => ({ ...w, magnet: calcMagnet(w) }))
        .sort((a, b) => b.magnet - a.magnet)[0];
    }

    let direction = "neutral";

    if (strongestBuy && strongestSell) {
      direction =
        strongestBuy.magnet > strongestSell.magnet
          ? "up"
          : "down";
    } else if (strongestBuy) {
      direction = "up";
    } else if (strongestSell) {
      direction = "down";
    }

    live.priceMagnet = {
      strongestBuy,
      strongestSell,
      direction
    };
  }
};
