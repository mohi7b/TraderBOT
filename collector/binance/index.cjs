// collector/binance/index.cjs      OK
/**
 * TraderBOT — Collector
 * Version: 2025-02-07
 * Status: Stable
 * Description:
 *   نسخه پایدار کالکتور با سه کانال WS (9001 / 9002 / 9003)
 *   این نسخه تست شده و بدون خطا اجرا می‌شود.
 */



const axios = require("axios");
const buffer = require("./br_buffer.cjs");

// سه کانال جدید
const { sendRealtime } = require("./ws-server-realtime.cjs");
const { sendMedium } = require("./ws-server-medium.cjs");
const { updateSlowData } = require("./ws-server-slow.cjs");

// WS های بایننس
const startDepthDiff = require("./ws-depth-diff.cjs");
const wsDepth20Safe = require("./ws-depth20-safe.cjs");
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

// ================================
// 🔥 REST Candles
// ================================
async function loadREST() {
  const url =
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500";

  const res = await axios.get(url);

  historicalCandles = res.data.map((c) => ({
    time: Math.floor(c[0] / 1000),
    open: +c[1],
    high: +c[2],
    low: +c[3],
    close: +c[4],
    volume: +c[5],
  }));

  console.log("\x1b[32m🔥 REST candles loaded\x1b[0m");
}

loadREST();

// ================================
// 🔥 Start WS
// ================================
function startAllWS() {
  startDepthDiff("BTCUSDT", buffer);
  wsDepth20Safe("BTCUSDT", buffer);

  wsTrades("BTCUSDT", buffer);
  wsAggTrade("BTCUSDT", buffer);
  wsLiquidations("BTCUSDT", buffer);
  wsOpenInterest("BTCUSDT", buffer);
  wsIndexPrice("BTCUSDT", buffer);
  wsEstFunding("BTCUSDT", buffer);
  wsKline("BTCUSDT", buffer, writer);

  console.log("\x1b[32m✔ All Binance WS Connected\x1b[0m");
}

startAllWS();

// ================================
// 🔥 ارسال داده‌ها به UI
// ================================
setInterval(() => {
  if (!initSent && historicalCandles.length > 0) {
    sendMedium("initCandles", historicalCandles);
    initSent = true;
    return;
  }

  // آنی
  sendRealtime("price", buffer.live.lastPrice);
  sendRealtime("volume", buffer.live.lastVolume);

  if (buffer.live.depthLayer0)
    sendRealtime("depthLayer0", buffer.live.depthLayer0);

  if (buffer.live.depthLayer1)
    sendRealtime("depthLayer1", buffer.live.depthLayer1);

  // میان‌مدت
  if (buffer.live.depthLayer2)
    sendMedium("depthLayer2", buffer.live.depthLayer2);

  if (buffer.live.depthLayer3)
    sendMedium("depthLayer3", buffer.live.depthLayer3);

}, 1000);

// ================================
// 🔥 داده‌های ساعتی
// ================================
setInterval(() => {
  updateSlowData({
    marketHealth: buffer.live.marketHealth,
    liquidityScore: buffer.live.liquidityScore,
    timestamp: Date.now(),
  });
}, 3600_000); // هر 1 ساعت
