// collector/binance/depth-engine.cjs

module.exports = {
  processDepth(depth, buffer) {
    try {
      if (!depth || !depth.bids || !depth.asks) return;

      const bids = depth.bids;
      const asks = depth.asks;

      // ============================================================
      // 🔥 تحلیل‌های جدید (بدون تغییر ساختار قبلی)
      // ============================================================

      // 1) Imbalance (فشار خرید/فروش)
      const buyVol = bids.slice(0, 50).reduce((s, x) => s + x[1], 0);
      const sellVol = asks.slice(0, 50).reduce((s, x) => s + x[1], 0);
      const imbalance = buyVol - sellVol;

      buffer.live.depthImbalance = imbalance;

      // 2) Total Liquidity (نقدینگی کل ۵۰ لایه)
      buffer.live.totalLiquidity = {
        buy: buyVol,
        sell: sellVol
      };

      // 3) Weighted Liquidity (نقدینگی وزنی)
      const weightedBuy = bids.slice(0, 50).reduce((s, x, i) => s + x[1] / (i + 1), 0);
      const weightedSell = asks.slice(0, 50).reduce((s, x, i) => s + x[1] / (i + 1), 0);

      buffer.live.weightedLiquidity = {
        buy: weightedBuy,
        sell: weightedSell
      };

      // 4) Market Maker Pressure
      buffer.live.marketMakerPressure =
        weightedBuy > weightedSell ? "buy" :
        weightedSell > weightedBuy ? "sell" :
        "neutral";

      // ============================================================
      // 🔥 داده‌های جدید از seqState
      // ============================================================

      buffer.live.depthStatus = {
        gapDetected: buffer.live.seqState.gapDetected,
        checksumValid: buffer.live.seqState.checksumValid
      };

      // ============================================================
      // 🔥 داده‌های جدید از فیوچرز (برای اسپات هم مفید)
      // ============================================================

      buffer.live.depthMeta = {
        indexPrice: buffer.live.indexPrice,
        openInterest: buffer.live.openInterest,
        liquidation: buffer.live.liquidation,
        estFunding: buffer.live.estFunding
      };

      // ============================================================
      // 🔥 تحلیل قبلی (کاملاً حفظ شده)
      // ============================================================

      const ranges = [
        { from: 0, to: 50 },
        { from: 50, to: 100 },
        { from: 100, to: 200 },
        { from: 200, to: 500 },
        { from: 500, to: 1000 }
      ];

      let importantBuys = [];
      let importantSells = [];

      let cumulativeBuy = 0;
      let cumulativeSell = 0;

      const pickTop = (slice, from) => {
        return slice
          .map((x, i) => ({
            layer: from + i + 1,
            price: parseFloat(x[0]) || 0,
            qty: parseFloat(x[1]) || 0
          }))
          .filter(x => x.qty > 0)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);
      };

      // خرید
      for (const range of ranges) {
        if (importantBuys.length >= 25) break;

        const to = Math.min(range.to, bids.length);
        const slice = bids.slice(range.from, to);

        const top = pickTop(slice, range.from);

        top.forEach(l => {
          cumulativeBuy += l.qty;
          importantBuys.push({
            side: "buy",
            layer: l.layer,
            price: l.price,
            qty: l.qty,
            cumulative: cumulativeBuy
          });
        });
      }

      // فروش
      for (const range of ranges) {
        if (importantSells.length >= 25) break;

        const to = Math.min(range.to, asks.length);
        const slice = asks.slice(range.from, to);

        const top = pickTop(slice, range.from);

        top.forEach(l => {
          cumulativeSell += l.qty;
          importantSells.push({
            side: "sell",
            layer: l.layer,
            price: l.price,
            qty: l.qty,
            cumulative: cumulativeSell
          });
        });
      }

      buffer.live.depthImportant = {
        buys: importantBuys.slice(0, 25),
        sells: importantSells.slice(0, 25)
      };

    } catch (err) {
      console.error("[DepthEngine] ERROR:", err);
    }
  }
};
