// collector/binance/buffer.cjs

class Buffer {
  constructor() {
    this.reset();
  }

  reset() {
    console.log("[Buffer] Resetting live buffer...");

    this.live = {
      lastPrice: null,

      trades: {
        count: 0,
        buyVolume: 0,
        sellVolume: 0,
        bigTrades: []
      },

      volatility: {
        micro: 0
      },

      marketDirection: "neutral",
      liquidityGap: 0,

      depth20: null,
      depthFull: null,
      depthImportant: null,

      liquidityWalls: {
        buyWalls: [],
        sellWalls: []
      }
    };
  }

  // ───────────────────────────────
  // پردازش تریدها
  // ───────────────────────────────
  pushTrade(price, qty, isBuy) {
    try {
      const live = this.live;

      live.trades.count++;

      if (isBuy) live.trades.buyVolume += qty;
      else live.trades.sellVolume += qty;

      // big trade بالای 50,000 دلار
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

    } catch (err) {
      console.error("[Buffer] ERROR pushTrade:", err);
    }
  }

  // ───────────────────────────────
  // پردازش عمق 20 لایه
  // ───────────────────────────────
  updateDepth20(bids, asks) {
    try {
      this.live.depth20 = { bids, asks };

      let buyDepth = 0, sellDepth = 0;

      bids.forEach(([price, qty]) => buyDepth += qty);
      asks.forEach(([price, qty]) => sellDepth += qty);

      this.live.liquidityGap = Math.abs(buyDepth - sellDepth);

    } catch (err) {
      console.error("[Buffer] ERROR updateDepth20:", err);
    }
  }

  // ───────────────────────────────
  // ذخیره عمق کامل
  // ───────────────────────────────
  updateDepthFull(depth) {
    this.live.depthFull = depth;
  }

  // ───────────────────────────────
  // دیوار نقدینگی
  // ───────────────────────────────
  detectLiquidityWalls() {
    const depth = this.live.depthImportant;
    if (!depth || !depth.buys || !depth.sells) return;

    const walls = { buyWalls: [], sellWalls: [] };

    const processSide = (list, side) => {
      if (list.length === 0) return;

      const avgQty =
        list.reduce((sum, x) => sum + x.qty, 0) / list.length;

      list.forEach(l => {
        const isWall = l.qty >= avgQty * 3 || l.qty >= 0.5;

        if (isWall) {
          walls[side].push({
            side,
            layer: l.layer,
            price: l.price,
            qty: l.qty,
            cumulative: l.cumulative,
            strength: l.qty / avgQty,
            distanceFromPrice:
              this.live.lastPrice ? Math.abs(l.price - this.live.lastPrice) : 0
          });
        }
      });
    };

    processSide(depth.buys, "buyWalls");
    processSide(depth.sells, "sellWalls");

    this.live.liquidityWalls = walls;
  }

  // ───────────────────────────────
  // خلاصه کندل
  // ───────────────────────────────
  summarizeCandle(candle) {
    try {
      this.live.volatility.micro = Math.abs(candle.high - candle.low);

      this.live.marketDirection =
        this.live.trades.buyVolume > this.live.trades.sellVolume
          ? "buy"
          : "sell";

    } catch (err) {
      console.error("[Buffer] ERROR summarizeCandle:", err);
    }
  }
}

module.exports = new Buffer();
