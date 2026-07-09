// depth-layer2.cjs

function buildCumulative(levels) {
  let cum = 0;
  return levels.map(l => {
    cum += l.qty;
    return { ...l, cumulative: cum };
  });
}

function buildDelta(levels) {
  return levels.map((l, i) => {
    const prev = levels[i - 1]?.cumulative || 0;
    const delta = l.cumulative - prev;
    return { ...l, delta };
  });
}

function pickTop(levels, count) {
  return [...levels]
    .sort((a, b) => b.delta - a.delta)
    .slice(0, count);
}

function findMirror(level, oppositeLevels) {
  let best = null;
  let bestDiff = Infinity;

  for (const o of oppositeLevels) {
    const diff = Math.abs(o.cumulative - level.cumulative);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }

  return best;
}

module.exports = function buildDepthLayer2(buffer) {
  const full = buffer.live.depthLayer0;
  if (!full) return;

  const bids = full.bids;
  const asks = full.asks;

  const bidsCum = buildCumulative(bids);
  const asksCum = buildCumulative(asks);

  const bidsDelta = buildDelta(bidsCum);
  const asksDelta = buildDelta(asksCum);

  const bidPoints = pickTop(bidsDelta, 100);
  const askPoints = pickTop(asksDelta, 100);

  bidPoints.sort((a, b) => b.price - a.price);
  askPoints.sort((a, b) => a.price - b.price);

  bidPoints.forEach((b, i) => b.levelTag = -(i + 1));
  askPoints.forEach((a, i) => a.levelTag = +(i + 1));

  for (const b of bidPoints) {
    const mirror = findMirror(b, askPoints);
    b.reachPrice = b.cumulative * b.price;
    if (mirror) {
      b.mirrorPrice = mirror.price;
      b.mirrorLayer = mirror.levelTag;
      b.mirrorReachPrice = mirror.cumulative * mirror.price;
    }
  }

  for (const a of askPoints) {
    const mirror = findMirror(a, bidPoints);
    a.reachPrice = a.cumulative * a.price;
    if (mirror) {
      a.mirrorPrice = mirror.price;
      a.mirrorLayer = mirror.levelTag;
      a.mirrorReachPrice = mirror.cumulative * mirror.price;
    }
  }

  buffer.live.depthLayer2 = {
    bids: bidPoints,
    asks: askPoints,
    mid: full.mid,
    updatedAt: Date.now()
  };
};
