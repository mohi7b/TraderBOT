/**
 * ============================================================
 *  File: price_delta.cjs
 *  Path: collector/realtime/spot/market/price_delta.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Calculates realtime price delta for Spot markets.
 *      Compatible with Futures Enterprise processors.
 * ============================================================
 */

class PriceDelta {
    constructor() {
        this.last = null;
    }

    handle(exchange, symbol, data) {
        const price = parseFloat(data.p || data.price || data.lastPrice);
        if (!price) return;

        const delta = this.last ? price - this.last : 0;
        this.last = price;

        return { exchange, symbol, price, delta, ts: Date.now() };
    }
}

module.exports = PriceDelta;
