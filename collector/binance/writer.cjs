// writer.cjs

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

      // داده‌های ترید یک دقیقه
      trades: {
        count: buffer.live.trades.count,
        buyVolume: buffer.live.trades.buyVolume,
        sellVolume: buffer.live.trades.sellVolume,
        bigTrades: buffer.live.trades.bigTrades
      },

      depthImportant: buffer.live.depthImportant,
      depthImbalance: buffer.live.depthImbalance,
      totalLiquidity: buffer.live.totalLiquidity,
      weightedLiquidity: buffer.live.weightedLiquidity,
      marketMakerPressure: buffer.live.marketMakerPressure,

      depthStatus: {
        gapDetected: buffer.live.orderbook.gapDetected,
        checksumValid: buffer.live.orderbook.checksumValid
      },

      depthMeta: buffer.live.depthMeta,

      updatedAt: Date.now()
    };
  }

  update(buffer) {
    if (!this.currentCandle) return;

    this.currentCandle.depthImportant = buffer.live.depthImportant;
    this.currentCandle.depthStatus = {
      gapDetected: buffer.live.orderbook.gapDetected,
      checksumValid: buffer.live.orderbook.checksumValid
    };
    this.currentCandle.depthImbalance = buffer.live.depthImbalance;
    this.currentCandle.totalLiquidity = buffer.live.totalLiquidity;
    this.currentCandle.weightedLiquidity = buffer.live.weightedLiquidity;
    this.currentCandle.marketMakerPressure = buffer.live.marketMakerPressure;
    this.currentCandle.depthMeta = buffer.live.depthMeta;

    this.currentCandle.updatedAt = Date.now();
  }

  closeCandle(buffer) {
    if (!this.currentCandle) return;

    this.currentCandle.candle.isClosed = true;

    const file = path.join(
      this.baseDir,
      `${this.currentCandle.candle.endTime}.json`
    );

    fs.writeFileSync(file, JSON.stringify(this.currentCandle, null, 2));

    // ریست تریدها برای کندل بعدی
    buffer.live.trades = {
      count: 0,
      buyVolume: 0,
      sellVolume: 0,
      bigTrades: []
    };

    this.currentCandle = null;
  }
}

module.exports = Writer;
