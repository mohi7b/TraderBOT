/**
 * ============================================================
 *  File: realtime-spot-symbol-aggregator.cjs
 *  Path: collector/realtime/spot/aggregator/realtime-spot-symbol-aggregator.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Aggregates realtime Spot data per symbol.
 * ============================================================
 */

class SpotSymbolAggregator {
    constructor() {
        this.data = {};
    }

    handle(exchange, symbol, packet) {
        if (!this.data[symbol]) {
            this.data[symbol] = {
                lastPrice: null,
                lastDepth: null,
                lastAggTrade: null
            };
        }

        if (packet.type === "price")
            this.data[symbol].lastPrice = packet.data;

        if (packet.type === "depth")
            this.data[symbol].lastDepth = packet.data;

        if (packet.type === "aggTrade")
            this.data[symbol].lastAggTrade = packet.data;
    }
}

module.exports = SpotSymbolAggregator;
