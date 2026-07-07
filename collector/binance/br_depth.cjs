// collector/binance/br_depth.cjs

module.exports = {
  updateDepth20(live, bids, asks) {
    live.depth20 = { bids, asks };

    let buyDepth = 0, sellDepth = 0;

    bids.forEach(([_, qty]) => buyDepth += qty);
    asks.forEach(([_, qty]) => sellDepth += qty);

    live.liquidityGap = Math.abs(buyDepth - sellDepth);
  },

  updateDepthFull(live, depthFull) {
    live.depthFull = depthFull;
  }
};
