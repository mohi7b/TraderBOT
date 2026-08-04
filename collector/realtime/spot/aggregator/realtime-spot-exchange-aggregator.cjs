/**
 * ============================================================
 *  File: realtime-spot-exchange-aggregator.cjs
 *  Path: collector/realtime/spot/aggregator/realtime-spot-exchange-aggregator.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Aggregates realtime Spot data per exchange.
 * ============================================================
 */

class SpotExchangeAggregator {
    constructor(exchange) {
        this.exchange = exchange;
        this.symbols = {};
    }

    handle(symbol, packet) {
        if (!this.symbols[symbol]) {
            this.symbols[symbol] = {
                lastPrice: null,
                lastDepth: null,
                lastAggTrade: null
            };
        }

        if (packet.type === "price")
            this.symbols[symbol].lastPrice = packet.data;

        if (packet.type === "depth")
            this.symbols[symbol].lastDepth = packet.data;

        if (packet.type === "aggTrade")
            this.symbols[symbol].lastAggTrade = packet.data;
    }
}

module.exports = SpotExchangeAggregator;
