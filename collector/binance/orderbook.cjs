// collector/binance/orderbook.cjs

class OrderBook {
  constructor() {
    this.bids = [];
    this.asks = [];
  }

  // ============================================================
  // 🔥 ریست کامل اوردر بوک (برای snapshot reload)
  // ============================================================
  reset(bids, asks) {
    try {
      this.bids = bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
      this.asks = asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

      this.bids.sort((a, b) => b[0] - a[0]);
      this.asks.sort((a, b) => a[0] - b[0]);

      console.log("[OrderBook] Snapshot reset completed.");
    } catch (err) {
      console.error("[OrderBook] ERROR reset:", err);
    }
  }

  // ============================================================
  // 🔥 اعمال diff روی اوردر بوک
  // ============================================================
  applyDiff(bids, asks) {
    try {
      // -----------------------------
      // BIDS
      // -----------------------------
      bids.forEach(([price, qty]) => {
        price = parseFloat(price);
        qty = parseFloat(qty);

        if (qty === 0) {
          this.bids = this.bids.filter(b => b[0] !== price);
        } else {
          const idx = this.bids.findIndex(b => b[0] === price);
          if (idx >= 0) this.bids[idx][1] = qty;
          else this.bids.push([price, qty]);
        }
      });

      // -----------------------------
      // ASKS
      // -----------------------------
      asks.forEach(([price, qty]) => {
        price = parseFloat(price);
        qty = parseFloat(qty);

        if (qty === 0) {
          this.asks = this.asks.filter(a => a[0] !== price);
        } else {
          const idx = this.asks.findIndex(a => a[0] === price);
          if (idx >= 0) this.asks[idx][1] = qty;
          else this.asks.push([price, qty]);
        }
      });

      // -----------------------------
      // مرتب‌سازی
      // -----------------------------
      this.bids.sort((a, b) => b[0] - a[0]);
      this.asks.sort((a, b) => a[0] - b[0]);

    } catch (err) {
      console.error("[OrderBook] ERROR applyDiff:", err);
    }
  }

  // ============================================================
  // 🔥 عمق کامل (۵۰۰۰ لایه واقعی)
  // ============================================================
  getFullDepth() {
    return {
      bids: this.bids.slice(0, 5000),
      asks: this.asks.slice(0, 5000)
    };
  }
}

module.exports = new OrderBook();
