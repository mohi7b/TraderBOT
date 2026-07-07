// collector/binance/br_buffer.cjs

module.exports = {
  live: {
    lastPrice: null,
    lastVolume: null,

    kline: null,

    trades: {
      count: 0,
      buyVolume: 0,
      sellVolume: 0,
      bigTrades: [],
    },

    tradeClusters: [],

    liquidationBuy: 0,
    liquidationSell: 0,
    bigLiquidations: [],
    liquidationClusters: [],

    // ================================
    // 🔥 ORDERBOOK 5000 LEVELS (MAP)
    // ================================
    orderbook: {
      bids: new Map(),       // price → qty
      asks: new Map(),       // price → qty
      lastUpdateId: null,
      gapDetected: false,
      checksumValid: true
    },

    // عمق مهم
    depthImportant: { buys: [], sells: [] },
    depthTop20: { buys: [], sells: [] },

    depthImbalance: 0,
    totalLiquidity: { buy: 0, sell: 0 },
    weightedLiquidity: { buy: 0, sell: 0 },
    marketMakerPressure: null,

    depthMeta: {
      indexPrice: null,
      openInterest: null,
      liquidation: null,
      estFunding: null
    },

    fakeWalls: [],
    priceMagnet: null,
    marketMakerBehavior: null
  },

  // ================================
  // 🔥 تبدیل آرایه REST به MAP
  // ================================
  convertToMap(arr) {
    const map = new Map();
    arr.forEach(([price, qty]) => {
      map.set(parseFloat(price), parseFloat(qty));
    });
    return map;
  },

  // ================================
  // 🔥 اعمال diff روی OrderBook کامل
  // استاندارد رسمی Binance
  // ================================
  applyDiffToOrderBook(diff) {
    const ob = this.live.orderbook;

    const { b: bids, a: asks, U, u } = diff;

    // اگر sequence خراب شد → باید REST کامل دوباره گرفته شود
    if (ob.lastUpdateId && U > ob.lastUpdateId + 1) {
      ob.gapDetected = true;
      return false; // به کالکتور می‌گوییم باید REST دوباره بگیرد
    }

    // آپدیت bids
    bids.forEach(([price, qty]) => {
      price = parseFloat(price);
      qty = parseFloat(qty);

      if (qty === 0) ob.bids.delete(price);
      else ob.bids.set(price, qty);
    });

    // آپدیت asks
    asks.forEach(([price, qty]) => {
      price = parseFloat(price);
      qty = parseFloat(qty);

      if (qty === 0) ob.asks.delete(price);
      else ob.asks.set(price, qty);
    });

    ob.lastUpdateId = u;
    return true;
  },

  // ================================
  // 🔥 خروجی کامل OrderBook برای UI
  // ================================
  getOrderBookSnapshot() {
    return {
      bids: Array.from(this.live.orderbook.bids.entries()),
      asks: Array.from(this.live.orderbook.asks.entries())
    };
  },

  // ================================
  // 🔥 پردازش عمق مهم (همان نسخه قبلی)
  // ================================
  processDepthImportant() {
    const ob = this.live.orderbook;

    const bids = Array.from(ob.bids.entries())
      .map(([price, qty]) => ({ side: "buy", price, qty }))
      .sort((a, b) => b.price - a.price);

    const asks = Array.from(ob.asks.entries())
      .map(([price, qty]) => ({ side: "sell", price, qty }))
      .sort((a, b) => a.price - b.price);

    if (bids.length === 0 || asks.length === 0) return;

    const addMetrics = (arr) => {
      let cumQty = 0;
      let cumValue = 0;

      return arr.map((d, i) => {
        cumQty += d.qty;
        cumValue += d.qty * d.price;

        return {
          side: d.side,
          layer: i + 1,
          price: d.price,
          qty: d.qty,
          cumulative: cumQty,
          reachPrice: cumValue
        };
      });
    };

    const bidsFull = addMetrics(bids);
    const asksFull = addMetrics(asks);

    this.live.depthTop20 = {
      buys: bidsFull.slice(0, 20),
      sells: asksFull.slice(0, 20)
    };

    const pickImportant = (arr) => {
      const ranges = [
        { from: 1, to: 20, count: 5 },
        { from: 21, to: 50, count: 5 },
        { from: 51, to: 100, count: 5 },
        { from: 101, to: 200, count: 5 },
        { from: 201, to: arr.length, count: 15 }
      ];

      let result = [];

      for (const r of ranges) {
        const slice = arr.slice(r.from - 1, r.to);
        const sorted = slice.sort((a, b) => b.qty - a.qty);
        result.push(...sorted.slice(0, r.count));
      }

      return result.sort((a, b) => a.price - b.price);
    };

    const importantBuys = pickImportant(bidsFull);
    const importantSells = pickImportant(asksFull);

    const findMirror = (point, oppositeArr) => {
      let best = oppositeArr[0];

      for (const o of oppositeArr) {
        if (Math.abs(o.reachPrice - point.reachPrice) <
            Math.abs(best.reachPrice - point.reachPrice)) {
          best = o;
        }
      }

      return {
        mirrorLayer: best.layer,
        mirrorPrice: best.price,
        mirrorReachPrice: best.reachPrice
      };
    };

    const addMirror = (arr, oppositeArr) => {
      return arr.map((d) => ({
        ...d,
        ...findMirror(d, oppositeArr)
      }));
    };

    const buysFinal = addMirror(importantBuys, asksFull);
    const sellsFinal = addMirror(importantSells, bidsFull);

    const totalBuyReach = buysFinal.reduce((sum, x) => sum + x.reachPrice, 0);
    const totalSellReach = sellsFinal.reduce((sum, x) => sum + x.reachPrice, 0);

    const pressureScore = totalBuyReach - totalSellReach;
    const dominantSide = pressureScore > 0 ? "buy" : "sell";

    let bestBuy = buysFinal[0];
    let bestSell = sellsFinal[0];
    let bestDiff = Math.abs(bestBuy.reachPrice - bestSell.reachPrice);

    for (const b of buysFinal) {
      for (const s of sellsFinal) {
        const diff = Math.abs(b.reachPrice - s.reachPrice);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestBuy = b;
          bestSell = s;
        }
      }
    }

    const balancePoint = {
      layerBuy: bestBuy.layer,
      priceBuy: bestBuy.price,
      reachPriceBuy: bestBuy.reachPrice,

      layerSell: bestSell.layer,
      priceSell: bestSell.price,
      reachPriceSell: bestSell.reachPrice
    };

    this.live.depthImportant = {
      buys: buysFinal,
      sells: sellsFinal,
      pressureScore,
      dominantSide,
      balancePoint
    };
  }
};
