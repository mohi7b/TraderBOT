/* ============================================================
 * File: collector/crypto/realtime/spot/candles/candles.cjs
 * Role:
 *   Spot Candles (Main Module)
 *   - دریافت کندل‌های اسپات (OHLCV)
 *   - مشابه نسخه فیوچرز
 *   - آماده برای تجمیع اسپات + فیوچرز
 * ============================================================ */

module.exports = function spotCandles(packet) {
    const { symbol, data, emit } = packet;

    if (!data.open || !data.close) return;

    emit({
        event: "candle",
        symbol,
        open: Number(data.open),
        high: Number(data.high),
        low: Number(data.low),
        close: Number(data.close),
        volume: Number(data.volume),
        timestamp: data.timestamp || Date.now()
    });
};
