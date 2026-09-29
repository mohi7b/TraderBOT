/* ============================================================
 * File: collector/crypto/realtime/spot/liquidity/liquidity_delta.cjs
 * Role:
 *   Spot Liquidity Delta
 *   - تغییرات لحظه‌ای نقدینگی
 *   - مشابه delta در فیوچرز
 * ============================================================ */

const last = {};

module.exports = function spotLiquidityDelta(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bidLiquidity = data.bids
        .slice(0, 50)
        .reduce((sum, level) => sum + Number(level[1]), 0);

    const askLiquidity = data.asks
        .slice(0, 50)
        .reduce((sum, level) => sum + Number(level[1]), 0);

    const prev = last[symbol] || { bid: bidLiquidity, ask: askLiquidity };

    const delta = {
        bidDelta: bidLiquidity - prev.bid,
        askDelta: askLiquidity - prev.ask
    };

    last[symbol] = { bid: bidLiquidity, ask: askLiquidity };

    emit({
        event: "liquidity_delta",
        symbol,
        bidLiquidity,
        askLiquidity,
        delta,
        timestamp: data.timestamp || Date.now()
    });
};
