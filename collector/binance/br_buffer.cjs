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

    orderbook: {
      bids: {},
      asks: {},
      lastUpdateId: null,
      gapDetected: false,
      checksumValid: true
    },

    depthImportant: { buys: [], sells: [] },

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

  summarizeCandle(candle) {
    candle.totalVolume = candle.volume;

    candle.direction =
      candle.close > candle.open ? "up" :
      candle.close < candle.open ? "down" : "neutral";

    candle.volatility = candle.high - candle.low;
  },

  applyDiff(bids, asks) {
    const ob = this.live.orderbook;

    for (const [price, qty] of bids) {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q === 0) delete ob.bids[p];
      else ob.bids[p] = q;
    }

    for (const [price, qty] of asks) {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q === 0) delete ob.asks[p];
      else ob.asks[p] = q;
    }
  },

processDepthImportant() {
  const ob = this.live.orderbook;

  // تبدیل orderbook به آرایهٔ لایه‌ای
  const bids = Object.entries(ob.bids)
    .map(([price, qty]) => ({ side: "buy", price: parseFloat(price), qty }))
    .sort((a, b) => b.price - a.price);

  const asks = Object.entries(ob.asks)
    .map(([price, qty]) => ({ side: "sell", price: parseFloat(price), qty }))
    .sort((a, b) => a.price - b.price);

  // محاسبه cumulative و reachPrice
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

  // انتخاب نقاط مهم از بازه‌ها
  const pickImportant = (arr) => {
    const ranges = [
      { from: 1, to: 20, count: 5 },
      { from: 20, to: 50, count: 5 },
      { from: 50, to: 100, count: 5 },
      { from: 100, to: 200, count: 5 },
      { from: 200, to: arr.length, count: 15 }
    ];

    let result = [];

    for (const r of ranges) {
      const slice = arr.slice(r.from - 1, r.to);
      const sorted = slice.sort((a, b) => b.qty - a.qty);
      result.push(...sorted.slice(0, r.count));
    }

    return result.sort((a, b) => a.layer - b.layer);
  };

  const importantBuys = pickImportant(bidsFull);
  const importantSells = pickImportant(asksFull);

  // پیدا کردن نقطهٔ معادل در سمت مخالف
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

  // محاسبه فشار بازار
  const totalBuyReach = buysFinal.reduce((sum, x) => sum + x.reachPrice, 0);
  const totalSellReach = sellsFinal.reduce((sum, x) => sum + x.reachPrice, 0);

  const pressureScore = totalBuyReach - totalSellReach;
  const dominantSide = pressureScore > 0 ? "buy" : "sell";

  // پیدا کردن نقطهٔ تعادل بازار
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
