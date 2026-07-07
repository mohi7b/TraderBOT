/**
 * File: index.cjs
 * Path: collector/binance/index.cjs
 * Description: ارسال REST + داده‌های لحظه‌ای به UI
 */

const axios = require("axios");
const buffer = require("./br_buffer.cjs");
const { sendInit, sendDelta } = require("./ws-server.cjs");

let historicalCandles = [];
let initSent = false;

// 1) دریافت REST فقط یک‌بار
async function loadREST() {
  const url =
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500";

  const res = await axios.get(url);

  historicalCandles = res.data.map((c) => ({
    time: Math.floor(c[0] / 1000),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));

  console.log("🔥 REST candles loaded:", historicalCandles.length);
}

loadREST();

// 2) هر ثانیه: پردازش بافر + ارسال داده‌های زنده
setInterval(() => {
  buffer.processDepthImportant();

  // بار اول → ارسال init
  if (!initSent && historicalCandles.length > 0) {
    sendInit(historicalCandles);
    initSent = true;
    return;
  }

  // قیمت لحظه‌ای
  if (buffer.live.lastPrice !== null) {
    sendDelta("price", buffer.live.lastPrice);
  }

  // حجم لحظه‌ای
  if (buffer.live.lastVolume !== null) {
    sendDelta("volume", buffer.live.lastVolume);
  }

  // دیوارهای فیک
  sendDelta("fakeWalls", buffer.live.fakeWalls);

  // مگنت
  sendDelta("magnet", buffer.live.priceMagnet);

  // رفتار مارکت‌میکر
  sendDelta("behavior", buffer.live.marketMakerBehavior);

}, 1000);
