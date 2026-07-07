// collector/binance/br_buffer.cjs

const trades = require("./br_trades.cjs");
const depth = require("./br_depth.cjs");
const walls = require("./br_walls.cjs");
const magnet = require("./br_magnet.cjs");
const volatility = require("./br_volatility.cjs");
const behavior = require("./br_behavior.cjs");
const fakewalls = require("./br_fakewalls.cjs");
const alerts = require("./br_alerts.cjs");

class Buffer {
  constructor() {
    this.reset();
  }

  reset() {
    console.log("[Buffer] Resetting live buffer...");

    this.live = {
      lastPrice: null,

      // تریدها
      trades: trades.init(),

      // عمق‌ها
      depth20: null,
      depthFull: { bids: [], asks: [] },
      depthImportant: { buys: [], sells: [] },

      // دیوارها
      liquidityWalls: { buyWalls: [], sellWalls: [] },

      // مگنت
      priceMagnet: null,

      // کندل
      currentCandle: null,

      // ولتیلیتی
      volatility: { micro: 0 },

      // جهت بازار
      marketDirection: "neutral",

      // فاصله نقدینگی
      liquidityGap: 0,

      // هشدارها
      alerts: []
    };
  }

  // -----------------------------
  //  تریدها
  // -----------------------------
  pushTrade(price, qty, isBuy) {
    this.live.lastPrice = price;

    // ساخت کندل
    this.updateCandle(price);

    // پردازش ترید
    trades.pushTrade(this.live, price, qty, isBuy);
  }

  // -----------------------------
  //  کندل‌سازی
  // -----------------------------
updateCandle(price) {
  const now = Date.now();
  const minute = Math.floor(now / 60000) * 60000;

  if (!this.live.currentCandle || this.live.currentCandle.startTime !== minute) {
    // کندل قبلی را ذخیره کن
    if (this.live.currentCandle) {
      this.live.previousCandle = { ...this.live.currentCandle };
    }

    // کندل جدید
    this.live.currentCandle = {
      startTime: minute,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0
    };
  } else {
    const c = this.live.currentCandle;
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.volume += 1;
  }
}

  summarizeCandle(candle) {
    if (!candle) return;

    candle.direction =
      candle.close > candle.open ? "up" :
      candle.close < candle.open ? "down" : "neutral";

    candle.volatility = candle.high - candle.low;
    candle.totalVolume = candle.volume;

    volatility.summarize(this.live, candle);
  }

  // -----------------------------
  //  عمق 20
  // -----------------------------
  updateDepth20(bids, asks) {
    depth.updateDepth20(this.live, bids, asks);
  }

  // -----------------------------
  //  عمق کامل (برای WS-DIFF)
  // -----------------------------
  updateDepthFull(bids, asks) {
    depth.updateDepthFull(this.live, bids, asks);
  }

  // -----------------------------
  //  پردازش عمق مهم
  // -----------------------------
  processDepthImportant() {
    walls.detectLiquidityWalls(this.live);
    magnet.computePriceMagnet(this.live);
    behavior.computeBehavior(this.live);
    fakewalls.detectFakeWalls(this.live);
    alerts.run(this.live);
  }
}

module.exports = new Buffer();
