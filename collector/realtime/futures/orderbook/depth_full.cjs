/**
 * ============================================================
 *  File: depth_full.cjs
 *  Path: collector/realtime/futures/orderbook/depth_full.cjs
 *  Version: 5.8.0 (ENTERPRISE)
 *
 *  Description:
 *      Full orderbook depth processor for Binance Futures.
 *
 *      این داده:
 *      - تمام سطوح عمق بازار را استخراج می‌کند
 *      - برای تحلیل Orderflow کامل ضروری است
 *      - برای مدل‌های ML پیشرفته استفاده می‌شود
 *      - برای تشخیص رفتار نهنگ‌ها حیاتی است
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthFull {

    handle(exchange, symbol, data) {
        const bids = data.b || [];
        const asks = data.a || [];

        return {
            exchange,
            symbol,
            type: "depth_full",
            levels: {
                bid: bids.length,
                ask: asks.length
            },
            bids: bids.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            asks: asks.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthFull;
