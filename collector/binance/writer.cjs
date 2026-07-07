// collector/binance/writer.cjs

const fs = require("fs");
const path = require("path");
const buffer = require("./br_buffer.cjs");

class Writer {
  constructor(symbol) {
    this.symbol = symbol.toLowerCase();

    this.baseDir = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "binance",
      this.symbol,
      "1m"
    );

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

save1mCandle(candle) {
  if (!candle || !candle.startTime) return;

  buffer.summarizeCandle(candle);

  const depthImportant = buffer.live.depthImportant || { buys: [], sells: [] };

  depthImportant.buys = depthImportant.buys.sort((a, b) => a.layer - b.layer);
  depthImportant.sells = depthImportant.sells.sort((a, b) => a.layer - b.layer);

  const snapshot = {
    symbol: this.symbol,
    timeframe: "1m",
    candle,
    trades: buffer.live.trades,
    depthImportant,
    updatedAt: Date.now()
  };

  const fileName = `${candle.startTime}.json`;
  const filePath = path.join(this.baseDir, fileName);

  console.log("[WRITER] Saving:", filePath);

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}
}

module.exports = Writer;
