// collector/binance/index.cjs

const axios = require("axios");
const buffer = require("./br_buffer.cjs");
const { sendInit, sendDelta } = require("./ws-server.cjs");

const startDepthDiff = require("./ws-depth-diff.cjs");
const wsTrades = require("./ws-trades.cjs");
const wsAggTrade = require("./ws-aggtrade.cjs");
const wsLiquidations = require("./ws-liquidations.cjs");
const wsOpenInterest = require("./ws-openinterest.cjs");
const wsIndexPrice = require("./ws-indexprice.cjs");
const wsEstFunding = require("./ws-estfunding.cjs");
const wsKline = require("./ws-kline.cjs");

const Writer = require("./writer.cjs");
const writer = new Writer("BTCUSDT");

let historicalCandles = [];
let initSent = false;

// ============================================================
// 🔥 1) Load REST candles once
// ============================================================
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

// ============================================================
// 🔥 2) Start WebSockets (NO RECONNECT ANYWHERE)
// ============================================================
function startAllWS() {
  startDepthDiff("BTCUSDT", buffer);
  wsTrades("BTCUSDT", buffer);
  wsAggTrade("BTCUSDT", buffer);
  wsLiquidations("BTCUSDT", buffer);
  wsOpenInterest("BTCUSDT", buffer);
  wsIndexPrice("BTCUSDT", buffer);
  wsEstFunding("BTCUSDT", buffer);
  wsKline("BTCUSDT", buffer, writer);

  console.log("✔ All WS connected (NO RECONNECT)");
}

startAllWS();

// ============================================================
// 🔥 3) Send FULL OrderBook snapshot every 500ms
// ============================================================
setInterval(() => {
  const snapshot = buffer.getOrderBookSnapshot();
  sendDelta("depthRest", snapshot);
}, 500);

// ============================================================
// 🔥 4) Every second: process buffer + send live data
// ============================================================
setInterval(() => {
  buffer.processDepthImportant();

  if (!initSent && historicalCandles.length > 0) {
    sendInit(historicalCandles);
    initSent = true;
    return;
  }

  sendDelta("price", buffer.live.lastPrice);
  sendDelta("volume", buffer.live.lastVolume);

  sendDelta("depthImportant", buffer.live.depthImportant);
  sendDelta("pressureScore", buffer.live.depthImportant.pressureScore);
  sendDelta("dominantSide", buffer.live.depthImportant.dominantSide);
  sendDelta("balancePoint", buffer.live.depthImportant.balancePoint);

  // 🔥 نسخهٔ جدید: فقط depthStatus واقعی
  sendDelta("depthStatus", buffer.live.depthStatus);

  sendDelta("depthTop20", buffer.live.depthTop20);

}, 1000);
