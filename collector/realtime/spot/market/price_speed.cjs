/**
 * ============================================================
 *  File: price_speed.cjs
 *  Path: collector/realtime/spot/market/price_speed.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates realtime price speed (Δprice / Δtime).
 * ============================================================
 */

class PriceSpeed {
    constructor() {
        this.last = null;
        this.lastTs = null;
    }

    handle(exchange, symbol, data) {
        const price = parseFloat(data.p || data.price);
        const ts = Date.now();

        if (!this.last) {
            this.last = price;
            this.lastTs = ts;
            return;
        }

        const speed = (price - this.last) / ((ts - this.lastTs) || 1);

        this.last = price;
        this.lastTs = ts;

        return { exchange, symbol, price, speed, ts };
    }
}

module.exports = PriceSpeed;
