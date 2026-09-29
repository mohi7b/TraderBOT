function vwap(trades) {
    const valid = (trades || []).filter((trade) => Number.isFinite(trade.price) && Number.isFinite(trade.qty) && trade.qty > 0);
    const volume = valid.reduce((sum, trade) => sum + trade.qty, 0);
    return volume ? valid.reduce((sum, trade) => sum + trade.price * trade.qty, 0) / volume : null;
}

function volumeDelta(trades) {
    return (trades || []).reduce((delta, trade) => {
        if (!Number.isFinite(trade.qty)) return delta;
        return delta + (trade.side === "buy" ? trade.qty : trade.side === "sell" ? -trade.qty : 0);
    }, 0);
}

function imbalance(trades) {
    const buy = (trades || []).filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + Number(trade.qty || 0), 0);
    const sell = (trades || []).filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + Number(trade.qty || 0), 0);
    return buy + sell ? (buy - sell) / (buy + sell) : 0;
}

module.exports = { vwap, volumeDelta, imbalance };
