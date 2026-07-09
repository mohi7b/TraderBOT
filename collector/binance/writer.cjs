// writer.cjs
/**
 * TraderBOT — Collector
 * Version: 2025-02-07
 * Status: Stable
 * Description:
 *   نسخه پایدار کالکتور با سه کانال WS (9001 / 9002 / 9003)
 *   این نسخه تست شده و بدون خطا اجرا می‌شود.
 */

const fs = require("fs");
const path = require("path");

class Writer {
  constructor(symbol) {
    this.symbol = symbol.toLowerCase();
    this.currentCandle = null;

    this.baseDir = path.join(
      __dirname, "..", "..", "data", "binance", this.symbol, "1m"
    );

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  // ============================================================
  // 🔥 شروع کندل ۱ دقیقه
  // ============================================================
  startCandle(kline, buffer) {
    this.currentCandle = {
      symbol: this.symbol,
      timeframe: "1m",

      candle: {
        startTime: kline.startTime,
        endTime: kline.endTime,
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.volume,
        isClosed: false,
        direction: kline.direction,
        volatility: kline.volatility,
        totalVolume: kline.totalVolume
      },

      trades: {
        count: buffer.live.trades.count,
        buyVolume: buffer.live.trades.buyVolume,
        sellVolume: buffer.live.trades.sellVolume,
        bigTrades: [...buffer.live.trades.bigTrades]
      },

      // ================================
      // 🔥 فقط لایه ۳ ذخیره می‌شود
      // ================================
      depthLayer3: JSON.parse(JSON.stringify(buffer.live.depthLayer3)),

      // ================================
      // 🔥 متاهای بازار
      // ================================
      marketMeta: {
        indexPrice: buffer.live.marketMeta.indexPrice,
        openInterest: buffer.live.marketMeta.openInterest,
        liquidation: buffer.live.marketMeta.liquidation,
        estFunding: buffer.live.marketMeta.estFunding
      },

      updatedAt: Date.now()
    };
  }

  // ============================================================
  // 🔥 آپدیت کندل در طول یک دقیقه
  // ============================================================
  update(buffer) {
    if (!this.currentCandle) return;

    // فقط لایه ۳
    this.currentCandle.depthLayer3 = JSON.parse(JSON.stringify(buffer.live.depthLayer3));

    this.currentCandle.marketMeta = {
      indexPrice: buffer.live.marketMeta.indexPrice,
      openInterest: buffer.live.marketMeta.openInterest,
      liquidation: buffer.live.marketMeta.liquidation,
      estFunding: buffer.live.marketMeta.estFunding
    };

    this.currentCandle.updatedAt = Date.now();
  }

  // ============================================================
  // 🔥 بستن کندل و ذخیرهٔ کامل داده‌ها
  // ============================================================
  closeCandle(buffer) {
    if (!this.currentCandle) return;

    this.currentCandle.candle.isClosed = true;

    const file = path.join(
      this.baseDir,
      `${this.currentCandle.candle.endTime}.json`
    );

    fs.writeFileSync(file, JSON.stringify(this.currentCandle, null, 2));

    // ریست تریدها برای کندل بعدی
    buffer.live.trades.count = 0;
    buffer.live.trades.buyVolume = 0;
    buffer.live.trades.sellVolume = 0;
    buffer.live.trades.bigTrades = [];

    this.currentCandle = null;
  }
}

module.exports = Writer;
