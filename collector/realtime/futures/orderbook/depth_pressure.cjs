/**
 * ============================================================
 *  File: depth_pressure.cjs
 *  Path: collector/realtime/futures/orderbook/depth_pressure.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Orderbook pressure processor for Binance Futures.
 *      Pressure = نسبت حجم خرید به حجم فروش.
 *      اگر فشار خرید بالا باشد → احتمال صعود.
 *      اگر فشار فروش بالا باشد → احتمال نزول.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthPressure {

    handle(exchange, symbol, data) {
        const bids = data.b || [];
        const asks = data.a || [];

        const bid_total = bids.reduce((sum, [_, qty]) => sum + Number(qty), 0);
        const ask_total = asks.reduce((sum, [_, qty]) => sum + Number(qty), 0);

        const pressure = bid_total - ask_total;

        return {
            exchange,
            symbol,
            type: "depth_pressure",
            bid_total,
            ask_total,
            pressure,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthPressure;
