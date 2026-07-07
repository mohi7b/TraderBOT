سند کامل معماری TraderBOT — نسخهٔ Ultra‑Pro
(ساختار پروژه + توضیح کامل هر فایل + ترتیب قرارگیری تمام بخش‌ها)
🏛 ساختار کلی پروژه
Code
TraderBOT/
│
├── collector/
│   └── binance/
│       ├── index.cjs
│       ├── ws-orderbook.cjs
│       ├── ws-trades.cjs
│       ├── ws-kline.cjs
│       ├── writer.cjs
│       ├── buffer.cjs
│       └── cleaner.cjs
│
└── ui/
    └── public/
        └── market/
            └── btcusdt/
                ├── 1m/
                ├── 5m/
                ├── 15m/
                ├── 1h/
                ├── 4h/
                └── 1d/
🧠 شرح کامل نقش هر فایل
🔹 index.cjs
فایل اصلی که همهٔ WebSocketها را اجرا می‌کند:

ws-orderbook

ws-trades

ws-kline

و writer را فعال می‌کند.

🔹 ws-orderbook.cjs
دادهٔ عمق بازار (Depth) را از Binance می‌گیرد:

buyDepth

sellDepth

totalBuy

totalSell

imbalance

marketPressure

و وارد buffer می‌کند.

🔹 ws-trades.cjs
معاملات لحظه‌ای را می‌گیرد:

buyVolume

sellVolume

bigTrades

priceList ← برای اسپایک‌ها

count

و وارد buffer می‌کند.

🔹 ws-kline.cjs
کندل ۱ دقیقه را می‌گیرد:

وقتی کندل بسته شد → writer.save1mCandle()

priceList را پاس می‌دهد

buffer.resetLive را اجرا می‌کند

🔹 buffer.cjs
حافظهٔ ۱ دقیقه‌ای:

trades

orderbook

priceList

priceSummary

volatility

marketDirection

و تابع:

summarizePrices()

resetLive()

🔹 writer.cjs
قلب سیستم Ultra‑Pro:

ساخت snapshot

ساخت سیگنال‌ها

ساخت تایم‌فریم‌های بالاتر

ذخیرهٔ فایل‌ها

پاک‌سازی فایل‌های قدیمی

و شامل ۶ بخش اصلی:

Code
1) imports
2) class Writer + constructor
3) ensureFolders()
4) save1mCandle()
5) computeSignals()
6) detectSpikes()   ← سیستم اسپایک پیشرفته
7) saveHigherTimeframes()
8) mergeCandles()
9) module.exports