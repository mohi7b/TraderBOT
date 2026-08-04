/**
 * ============================================================
 *  File: aggtrade_delta.cjs
 *  Path: collector/realtime/spot/market/aggtrade_delta.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates delta of aggregated trade quantity.
 * ============================================================
 */

class AggTradeDelta {
    constructor() {
        this.lastQty = null;
    }

    handle(exchange, symbol, data) {
        const qty = parseFloat(data.q || data.quantity);
        if (!qty) return;

        const delta = this.lastQty ? qty - this.lastQty : 0;
        this.lastQty = qty;

        return { exchange, symbol, qty, delta, ts: Date.now() };
    }
}

module.exports = AggTradeDelta;
