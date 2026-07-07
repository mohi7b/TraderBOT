module.exports = {
  history: { buy: {}, sell: {} },

  detectFakeWalls(live) {
    const walls = live.liquidityWalls;
    const lastPrice = live.lastPrice;

    if (!walls || !lastPrice) {
      live.fakeWalls = { buy: [], sell: [] };
      return;
    }

    const fakeWalls = { buy: [], sell: [] };
    const now = Date.now();

    const processSide = (sideWalls, sideName) => {
      sideWalls.forEach(w => {
        const key = w.price.toFixed(2);

        if (!this.history[sideName][key]) {
          this.history[sideName][key] = {
            firstSeen: now,
            lastSeen: now,
            lastQty: w.qty,
            changes: []
          };
        }

        const h = this.history[sideName][key];
        h.lastSeen = now;

        const qtyChange = Math.abs(w.qty - h.lastQty);
        if (qtyChange > 0.3) {
          h.changes.push({
            time: now,
            qty: w.qty,
            change: qtyChange
          });
        }
        h.lastQty = w.qty;

        const recentChanges = h.changes.filter(c => now - c.time < 2000);
        if (recentChanges.length >= 2) {
          fakeWalls[sideName].push({
            ...w,
            reason: "Strong volume change in short time"
          });
        }

        if (Math.abs(w.price - lastPrice) < 2) {
          fakeWalls[sideName].push({
            ...w,
            reason: "Sticky wall near price"
          });
        }

        if (w.qty > 1 && w.distanceFromPrice < 5) {
          fakeWalls[sideName].push({
            ...w,
            reason: "Large wall close to price"
          });
        }
      });

      Object.keys(this.history[sideName]).forEach(priceKey => {
        const h = this.history[sideName][priceKey];

        if (now - h.lastSeen > 1500) {
          fakeWalls[sideName].push({
            price: parseFloat(priceKey),
            qty: 0,
            reason: "Wall disappeared suddenly"
          });

          delete this.history[sideName][priceKey];
        }
      });
    };

    processSide(walls.buyWalls, "buy");
    processSide(walls.sellWalls, "sell");

    live.fakeWalls = fakeWalls;
  }
};
