/**
 * ============================================================
 *  File: aggtrade_trend.cjs
 *  Path: collector/realtime/spot/market/aggtrade_trend.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates trend of aggregated trade quantity.
 * ============================================================
 */

class AggTradeTrend {
    constructor() {
        this.history = [];
    }

    handle(exchange, symbol, data) {
        const qty = parseFloat(data.q || data.quantity);
        if (!qty) return;

        this.history.push(qty);
        if (this.history.length > 50) this.history.shift();

        const trend = qty - this.history[0];

        return { exchange, symbol, qty, trend, ts: Date.now() };
    }
}

module.exports = AggTradeTrend;
