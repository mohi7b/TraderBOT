// rest-depth.cjs

const axios = require("axios");

module.exports = async function getDepthSnapshot(symbol) {
  const url = `https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=500`;
  const res = await axios.get(url);
  return res.data;
};
