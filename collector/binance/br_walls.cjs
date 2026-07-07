// collector/binance/br_walls.cjs

module.exports = {
  detectLiquidityWalls(live) {
    const depth = live.depthImportant;
    if (!depth) return;

    const walls = { buyWalls: [], sellWalls: [] };

    const processSide = (list, side) => {
      if (!list || list.length === 0) return;

      const avgQty = list.reduce((s, x) => s + x.qty, 0) / list.length;

      list.forEach(l => {
        const isWall = l.qty >= avgQty * 3 || l.qty >= 0.5;

        if (isWall) {
          walls[side].push({
            ...l,
            strength: l.qty / avgQty,
            distanceFromPrice:
              live.lastPrice ? Math.abs(l.price - live.lastPrice) : 0
          });
        }
      });
    };

    processSide(depth.buys, "buyWalls");
    processSide(depth.sells, "sellWalls");

    live.liquidityWalls = walls;
  }
};
