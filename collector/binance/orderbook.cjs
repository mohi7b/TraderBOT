// collector/binance/orderbook.cjs

class OrderBook {
  constructor() {
    this.bids = [];
    this.asks = [];
  }

  applyDiff(bids, asks) {
    try {
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

      this.bids.sort((a, b) => b[0] - a[0]);
      this.asks.sort((a, b) => a[0] - b[0]);

    } catch (err) {
      console.error("[OrderBook] ERROR applyDiff:", err);
    }
  }

  getFullDepth() {
    return {
      bids: this.bids.slice(0, 1000),
      asks: this.asks.slice(0, 1000)
    };
  }
}

module.exports = new OrderBook();
