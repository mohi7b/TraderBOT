// collector/binance/br_buffer.cjs
/**
 * TraderBOT — Collector
 * Version: 2025-02-07
 * Status: Stable
 * Description:
 *   نسخه پایدار کالکتور با سه کانال WS (9001 / 9002 / 9003)
 *   این نسخه تست شده و بدون خطا اجرا می‌شود.
 */

module.exports = {
  live: {
    lastPrice: null,
    lastVolume: null,

    // ================================
    // 🔥 بخش معاملات
    // ================================
    trades: {
      count: 0,
      buyVolume: 0,
      sellVolume: 0,
      bigTrades: [],
      clusters: []
    },

    // ================================
    // 🔥 لایه ۰ — Orderbook Full (5000 LEVELS)
    // ================================
    depthLayer0: {
      bids: [],
      asks: [],
      updatedAt: null
    },

    // ================================
    // 🔥 لایه ۱ — Depth20 (WS جداگانه)
    // ================================
    depthLayer1: { bids: [], asks: [] },

    // ================================
    // 🔥 لایه ۲ — DepthLayer2 (لگاریتمی سبک)
    // ================================
    depthLayer2: {
      bids: [],
      asks: [],
      updatedAt: null
    },

    // ================================
    // 🔥 لایه ۳ — DepthLayer3 (نقاط کلیدی تحلیل)
    // ================================
    depthLayer3: {
      bids: [],
      asks: [],
      updatedAt: null
    },

    // ================================
    // 🔥 متاهای بازار (جدا از عمق)
    // ================================
    marketMeta: {
      indexPrice: null,
      openInterest: null,
      liquidation: null,
      estFunding: null
    },

    // ================================
    // 🔥 وضعیت‌های عمومی
    // ================================
    orderbook: {
      bids: new Map(),
      asks: new Map(),
      lastUpdateId: null,
      gapDetected: false,
      checksumValid: true
    },

    liquidityGap: 0
  },

  // ================================
  // 🔥 تبدیل REST به MAP
  // ================================
  convertToMap(arr) {
    const map = new Map();
    arr.forEach(([price, qty]) => {
      map.set(parseFloat(price), parseFloat(qty));
    });
    return map;
  },

  // ================================
  // 🔥 اعمال Diff روی OrderBook
  // ================================
  applyDiffToOrderBook(diff) {
    const ob = this.live.orderbook;
    const { b: bids, a: asks, u } = diff;

    bids.forEach(([price, qty]) => {
      price = parseFloat(price);
      qty = parseFloat(qty);
      if (qty === 0) ob.bids.delete(price);
      else ob.bids.set(price, qty);
    });

    asks.forEach(([price, qty]) => {
      price = parseFloat(price);
      qty = parseFloat(qty);
      if (qty === 0) ob.asks.delete(price);
      else ob.asks.set(price, qty);
    });

    ob.lastUpdateId = u;
  },

  // ================================
  // 🔥 Snapshot کامل برای UI
  // ================================
  getOrderBookSnapshot() {
    return {
      bids: Array.from(this.live.orderbook.bids.entries()),
      asks: Array.from(this.live.orderbook.asks.entries())
    };
  }
};
