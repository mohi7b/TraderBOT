// collector/binance/cleaner.cjs

const fs = require("fs");
const path = require("path");

class Cleaner {
  constructor() {
    this.retention = {
      "1m": 7 * 24 * 60 * 60 * 1000,       // 7 days
      "5m": 7 * 24 * 60 * 60 * 1000,
      "15m": 7 * 24 * 60 * 60 * 1000,
      "1h": 7 * 24 * 60 * 60 * 1000,
      "4h": 180 * 24 * 60 * 60 * 1000,     // 6 months
      "1d": 3 * 365 * 24 * 60 * 60 * 1000  // 3 years
    };
  }

  run(symbol) {
    const baseDir = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "binance",
      symbol.toUpperCase()
    );

    Object.keys(this.retention).forEach(tf => {
      const dir = path.join(baseDir, tf);
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      const now = Date.now();
      const limit = this.retention[tf];

      files.forEach(file => {
        const fullPath = path.join(dir, file);

        const timestamp = parseInt(file.split("_")[1].replace(".json", ""));

        if (now - timestamp > limit) {
          fs.unlinkSync(fullPath);
          console.log(`[CLEANER] Deleted old ${tf} candle: ${file}`);
        }
      });
    });
  }
}

module.exports = new Cleaner();
