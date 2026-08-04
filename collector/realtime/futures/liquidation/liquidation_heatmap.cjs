/**
 * ============================================================
 *  File: liquidation_heatmap.cjs
 *  Path: collector/realtime/futures/liquidation/liquidation_heatmap.cjs
 *  Version: 5.6.0 (ENTERPRISE)
 *
 *  Description:
 *      Liquidation Heatmap processor for Binance Futures.
 *
 *      Heatmap = شدت لیکوئیدیشن در سطوح مختلف قیمت.
 *      این داده برای:
 *      - تحلیل بصری
 *      - مدل‌های ML
 *      - تشخیص مناطق خطر
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesLiquidationHeatmap {

    constructor(window = 50) {
        this.window = window;
        this.history = {};
    }

    handle(exchange, symbol, data) {
        const price = Number(data.o.p);
        const qty   = Number(data.o.q);

        if (!this.history[symbol]) this.history[symbol] = [];

        const arr = this.history[symbol];
        arr.push({ price, qty });

        if (arr.length > this.window) arr.shift();

        const heatmap = arr.map(item => ({
            price: item.price,
            intensity: item.qty
        }));

        return {
            exchange,
            symbol,
            type: "liquidation_heatmap",
            heatmap,
            samples: arr.length,
            ts: data.o.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesLiquidationHeatmap;
