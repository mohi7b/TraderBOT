// depth-layer3.cjs

// -----------------------------
// 1) cumulative
// -----------------------------
function buildCumulative(levels) {
  let cum = 0;
  return levels.map(l => {
    cum += l.qty;
    return { ...l, cumulative: cum };
  });
}

// -----------------------------
// 2) delta (تغییر تجمیعی)
// -----------------------------
function buildDelta(levels) {
  return levels.map((l, i) => {
    const prev = levels[i - 1]?.cumulative || 0;
    const delta = l.cumulative - prev;
    return { ...l, delta };
  });
}

// -----------------------------
// 3) انتخاب بزرگ‌ترین دیوارها
// -----------------------------
function pickTopWalls(levels, count) {
  return [...levels]
    .sort((a, b) => b.delta - a.delta)
    .slice(0, count);
}

// -----------------------------
// 4) پیدا کردن نقطهٔ متناظر (mirror)
// بر اساس cumulative
// -----------------------------
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

// -----------------------------
// 5) ساخت لایه ۳
// -----------------------------
module.exports = function buildDepthLayer3(buffer) {
  const full = buffer.live.depthLayer0;
  if (!full) return;

  const bids = full.bids;
  const asks = full.asks;

  // cumulative
  const bidsCum = buildCumulative(bids);
  const asksCum = buildCumulative(asks);

  // delta
  const bidsDelta = buildDelta(bidsCum);
  const asksDelta = buildDelta(asksCum);

  // دیوارهای نقدینگی
  const bidWalls = pickTopWalls(bidsDelta, 50);
  const askWalls = pickTopWalls(asksDelta, 50);

  // مرتب‌سازی
  bidWalls.sort((a, b) => b.price - a.price);
  askWalls.sort((a, b) => a.price - b.price);

  // برچسب‌ها
  bidWalls.forEach((b, i) => b.levelTag = -(i + 1));
  askWalls.forEach((a, i) => a.levelTag = +(i + 1));

  // mirror برای هر bid
  for (const b of bidWalls) {
    const mirror = findMirror(b, askWalls);
    if (mirror) {
      b.mirrorPrice = mirror.price;
      b.mirrorLayer = mirror.levelTag;
      b.mirrorReachPrice = mirror.cumulative * mirror.price;
    }
    b.reachPrice = b.cumulative * b.price;
  }

  // mirror برای هر ask
  for (const a of askWalls) {
    const mirror = findMirror(a, bidWalls);
    if (mirror) {
      a.mirrorPrice = mirror.price;
      a.mirrorLayer = mirror.levelTag;
      a.mirrorReachPrice = mirror.cumulative * mirror.price;
    }
    a.reachPrice = a.cumulative * a.price;
  }

  // خروجی نهایی
  buffer.live.depthLayer3 = {
    bids: bidWalls,
    asks: askWalls,
    mid: full.mid,
    updatedAt: Date.now()
  };
};
