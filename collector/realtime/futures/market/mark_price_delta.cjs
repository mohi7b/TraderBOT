/**
 * ============================================================
 *  File: mark_price_delta.cjs
 *  Path: collector/realtime/futures/market/mark_price_delta.cjs
 *  Version: 5.5.0 (ENTERPRISE)
 *
 *  Description:
 *      Mark Price Delta processor for Binance Futures.
 *      Delta = تغییرات لحظه‌ای مارک‌پرایس.
 *
 *      مارک‌پرایس از چندین عامل ساخته می‌شود:
 *      - قیمت شاخص (Price Index)
 *      - میانگین متحرک (MA Basis)
 *      - Funding Rate
 *      - Bid/Ask سطح اول
 *
 *      (طبق مستندات رسمی Binance Futures) 
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesMarkPriceDelta {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const mark = Number(data.p);
        const prev = this.last[symbol] || mark;

        const delta = mark - prev;

        this.last[symbol] = mark;

        return {
            exchange,
            symbol,
            type: "mark_price_delta",
            markPrice: mark,
            delta,
            ts: data.T || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesMarkPriceDelta;
