/**
 * ============================================================
 *  File: price_trend.cjs
 *  Path: collector/realtime/spot/market/price_trend.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates price trend using rolling window.
 * ============================================================
 */

class PriceTrend {
    constructor() {
        this.history = [];
    }

    handle(exchange, symbol, data) {
        const price = parseFloat(data.p || data.price);
        if (!price) return;

        this.history.push(price);
        if (this.history.length > 50) this.history.shift();

        const trend = price - this.history[0];

        return { exchange, symbol, price, trend, ts: Date.now() };
    }
}

module.exports = PriceTrend;
