// depth-checksum.cjs
// اعتبارسنجی اوردر بوک با checksum

const crypto = require("crypto");

function calcChecksum(orderbook) {
  const bids = orderbook.bids.slice(0, 10);
  const asks = orderbook.asks.slice(0, 10);

  const parts = [];

  bids.forEach(([p, q]) => parts.push(`${p}:${q}`));
  asks.forEach(([p, q]) => parts.push(`${p}:${q}`));

  const str = parts.join(":");
  return crypto.createHash("crc32").update(str).digest("hex");
}

function verifyChecksum(orderbook, binanceChecksum) {
  const local = calcChecksum(orderbook);
  return local === binanceChecksum;
}

module.exports = { verifyChecksum };
