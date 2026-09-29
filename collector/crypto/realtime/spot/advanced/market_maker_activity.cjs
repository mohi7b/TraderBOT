/* ============================================================
 * File: collector/crypto/realtime/spot/advanced/market_maker_activity.cjs
 * Role:
 *   Spot Market Maker Activity
 *   - تشخیص فعالیت مارکت‌میکرها از روی depth + orderflow
 *   - مشابه pressure + imbalance در فیوچرز
 *   - کاربرد:
 *       * تشخیص spoofing
 *       * تشخیص absorption
 *       * تشخیص liquidity traps
 * ============================================================ */

module.exports = function spotMarketMakerActivity(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks || !data.price || !data.qty) return;

    const bidTop = Number(data.bids[0]?.[1] || 0);
    const askTop = Number(data.asks[0]?.[1] || 0);
    const qty = Number(data.qty);

    let activity = "neutral";

    if (qty > 2000 && bidTop > askTop) activity = "mm_buy_absorption";
    else if (qty > 2000 && askTop > bidTop) activity = "mm_sell_absorption";
    else if (bidTop > askTop * 3) activity = "mm_bid_spoofing";
    else if (askTop > bidTop * 3) activity = "mm_ask_spoofing";

    emit({
        event: "market_maker_activity",
        symbol,
        price: Number(data.price),
        qty,
        bidTop,
        askTop,
        activity,
        timestamp: data.timestamp || Date.now()
    });
};
