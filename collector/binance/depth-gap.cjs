// depth-gap.cjs
// مدیریت گپ در diff های اوردر بوک

const axios = require("axios");

async function reloadSnapshot(symbol, orderbook) {
  console.log("🔄 Reloading depth snapshot...");

  const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=5000`;
  const res = await axios.get(url);

  const bids = res.data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
  const asks = res.data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

  orderbook.reset(bids, asks);

  console.log("✅ Snapshot reloaded.");
}

module.exports = { reloadSnapshot };
