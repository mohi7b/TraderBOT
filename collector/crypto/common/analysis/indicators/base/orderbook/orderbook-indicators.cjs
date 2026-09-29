function spreadBps(bestBid, bestAsk) {
    const bid = Number(bestBid);
    const ask = Number(bestAsk);
    const mid = (bid + ask) / 2;
    return Number.isFinite(mid) && mid > 0 ? (ask - bid) / mid * 10000 : null;
}

function microprice(bestBid, bestAsk, bidQty, askQty) {
    const bid = Number(bestBid);
    const ask = Number(bestAsk);
    const bidSize = Number(bidQty);
    const askSize = Number(askQty);
    return bidSize + askSize > 0 ? (ask * bidSize + bid * askSize) / (bidSize + askSize) : null;
}

function depthImbalance(bidLiquidity, askLiquidity) {
    const bid = Number(bidLiquidity);
    const ask = Number(askLiquidity);
    return bid + ask > 0 ? (bid - ask) / (bid + ask) : 0;
}

module.exports = { spreadBps, microprice, depthImbalance };
