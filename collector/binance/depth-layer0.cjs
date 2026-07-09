// depth-layer0.cjs

module.exports = function updateDepthLayer0(buffer, snapshot) {

  const bids = [...snapshot.bids].sort((a, b) => b.price - a.price);
  const asks = [...snapshot.asks].sort((a, b) => a.price - b.price);

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const mid = (bestBid + bestAsk) / 2;

  buffer.live.depthLayer0 = {
    bids,
    asks,
    mid,
    updatedAt: Date.now()
  };
};
