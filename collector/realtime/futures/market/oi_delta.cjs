/**
 * ============================================================
 *  File: oi_delta.cjs
 *  Path: collector/realtime/futures/market/oi_delta.cjs
 *  Version: 5.1.0 (ENTERPRISE)
 *
 *  Description:
 *      Calculates delta (change) in Open Interest.
 *      این داده برای تشخیص:
 *      - ورود پول جدید
 *      - خروج پول
 *      - تغییرات ناگهانی لانگ/شورت
 *      بسیار مهم است.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesOIDelta {

    constructor() {
        this.lastOI = {};
    }

    handle(exchange, symbol, data) {
        const oi = Number(data.oi);

        const prev = this.lastOI[symbol] || oi;
        const delta = oi - prev;

        this.lastOI[symbol] = oi;

        return {
            exchange,
            symbol,
            type: "openInterest_delta",
            oi,
            delta,
            ts: data.ts || Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesOIDelta;
