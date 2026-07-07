/**
 * File: rest_klines.cjs
 * Path: collector/binance/rest_klines.cjs
 * Description: دریافت کندل‌های REST برای چارت UI
 */

const axios = require("axios");

async function getRESTKlines(symbol = "BTCUSDT", interval = "1m", limit = 500) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const res = await axios.get(url);

  return res.data.map((c) => ({
    time: Math.floor(c[0] / 1000),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

module.exports = { getRESTKlines };
