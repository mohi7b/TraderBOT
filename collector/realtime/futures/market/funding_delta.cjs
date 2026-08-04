/**
 * ============================================================
 *  File: funding_delta.cjs
 *  Path: collector/realtime/futures/market/funding_delta.cjs
 *  Version: 5.4.0 (ENTERPRISE)
 *
 *  Description:
 *      Funding Delta processor for Binance Futures.
 *      Delta = تغییرات لحظه‌ای نرخ فاندینگ.
 *
 *      کاربردها:
 *      - تشخیص تغییرات ناگهانی فاندینگ
 *      - تشخیص فشار لانگ/شورت
 *      - تحلیل رفتار نهنگ‌ها
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesFundingDelta {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const rate = Number(data.f);
        const prev = this.last[symbol] || rate;

        const delta = rate - prev;

        this.last[symbol] = rate;

        return {
            exchange,
            symbol,
            type: "funding_delta",
            rate,
            delta,
            ts: data.t || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesFundingDelta;
