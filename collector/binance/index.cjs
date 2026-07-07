/**
 * File: index.cjs
 * Description: Binance Collector Runner (Stable Version)
 */

const axios = require("axios");
const buffer = require("./br_buffer.cjs");
const { sendInit, sendDelta } = require("./ws-server.cjs");

// WS modules
const startDepthDiff = require("./ws-depth-diff.cjs");
const wsTrades = require("./ws-trades.cjs");
const wsAggTrade = require("./ws-aggtrade.cjs");
const wsLiquidations = require("./ws-liquidations.cjs");
const wsOpenInterest = require("./ws-openinterest.cjs");
const wsIndexPrice = require("./ws-indexprice.cjs");
const wsEstFunding = require("./ws-estfunding.cjs");
const wsKline = require("./ws-kline.cjs");

// Writer
const Writer = require("./writer.cjs");
const writer = new Writer("BTCUSDT");

// AutoReconnect
const { autoReconnect } = require("./ws-reconnect.cjs");

// Terminal colors
const green = "\x1b[32m";
const reset = "\x1b[0m";

let historicalCandles = [];
let initSent = false;

// ============================================================
// 1) Load REST candles once
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

  console.log(green + "🔥 REST candles loaded: " + historicalCandles.length + reset);
}

loadREST();

// ============================================================
// 2) Start all WebSockets
// ============================================================
function startAllWS() {
  console.log(green + "🚀 Starting Binance WebSockets..." + reset);

  autoReconnect(() => startDepthDiff("BTCUSDT", buffer), "depth-diff");
  console.log(green + "✔ depth-diff connected" + reset);

  autoReconnect(() => wsTrades("BTCUSDT", buffer), "trades");
  console.log(green + "✔ trades connected" + reset);

  autoReconnect(() => wsAggTrade("BTCUSDT", buffer), "aggtrade");
  console.log(green + "✔ aggtrade connected" + reset);

  autoReconnect(() => wsLiquidations("BTCUSDT", buffer), "liquidations");
  console.log(green + "✔ liquidations connected" + reset);

  autoReconnect(() => wsOpenInterest("BTCUSDT", buffer), "openInterest");
  console.log(green + "✔ openInterest connected" + reset);

  autoReconnect(() => wsIndexPrice("BTCUSDT", buffer), "indexPrice");
  console.log(green + "✔ indexPrice connected" + reset);

  autoReconnect(() => wsEstFunding("BTCUSDT", buffer), "estFunding");
  console.log(green + "✔ estFunding connected" + reset);

  autoReconnect(() => wsKline("BTCUSDT", buffer, writer), "kline");
  console.log(green + "✔ kline connected" + reset);
}

startAllWS();

// ============================================================
// 3) Animation: program is running
// ============================================================
let frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
let i = 0;

setInterval(() => {
  process.stdout.write(
    "\r" + green + "⚡ Collector running " + frames[i = (i+1) % frames.length] + reset
  );
}, 120);

// ============================================================
// 4) Every second: process buffer + send live data
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
  sendDelta("depthStatus", buffer.live.orderbook);
  sendDelta("depthImbalance", buffer.live.depthImbalance);

  sendDelta("totalLiquidity", buffer.live.totalLiquidity);
  sendDelta("weightedLiquidity", buffer.live.weightedLiquidity);
  sendDelta("marketMakerPressure", buffer.live.marketMakerPressure);

  sendDelta("depthMeta", buffer.live.depthMeta);

}, 1000);
