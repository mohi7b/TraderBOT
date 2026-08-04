/**
 * ============================================================
 *  File: aggtrade_speed.cjs
 *  Path: collector/realtime/spot/market/aggtrade_speed.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates speed of aggregated trade quantity.
 * ============================================================
 */

class AggTradeSpeed {
    constructor() {
        this.lastQty = null;
        this.lastTs = null;
    }

    handle(exchange, symbol, data) {
        const qty = parseFloat(data.q || data.quantity);
        const ts = Date.now();

        if (!this.lastQty) {
            this.lastQty = qty;
            this.lastTs = ts;
            return;
        }

        const speed = (qty - this.lastQty) / ((ts - this.lastTs) || 1);

        this.lastQty = qty;
        this.lastTs = ts;

        return { exchange, symbol, qty, speed, ts };
    }
}

module.exports = AggTradeSpeed;
