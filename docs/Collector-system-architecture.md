📘 System Architecture Documentation (Markdown Version)
Multi‑Symbol Real‑Time Market Collector — Full Architecture & Data Flow

🟩 1) Overview
این سیستم یک Real‑Time Multi‑Symbol Collector است که داده‌های بازار را از Binance دریافت کرده و:

کندل‌های 1m و 1h را ذخیره می‌کند

snapshot لحظه‌ای می‌سازد

فشار خرید/فروش را محاسبه می‌کند

orderbook را خلاصه می‌کند

تایم‌فریم‌های استاندارد می‌سازد

داده‌ها را در ساختار فایل‌های بهینه ذخیره می‌کند

برای چندین symbol همزمان کار می‌کند

بدون null، بدون گپ، بدون race condition اجرا می‌شود

🟩 2) System Components
Core Modules
aggregator — مدیریت state برای هر symbol

snapshot-builder — ساخت snapshot لحظه‌ای

writer — ذخیره امن و atomic داده‌ها

scheduler — ساخت تایم‌فریم‌های استاندارد

cleanup — حذف امن فایل‌های قدیمی

run-collector — اجرای کل سیستم

WebSocket Streams
ws-trades — تریدهای لحظه‌ای

ws-orderbook — عمق بازار

ws-kline — کندل 1m

🟩 3) File Structure (Optimized)
Code
ui/
└── public/
    └── data/
        ├── market/
        │   └── <symbol>/
        │       └── timeframes.json
        │
        └── history/
            └── <symbol>/
                ├── 1m/
                │   └── <timestamp>.json
                ├── 1h/
                │   └── <timestamp>.json
                ├── 1d/
                │   └── <timestamp>.json
                ├── 1w/
                │   └── <timestamp>.json
                └── 1M/
                    └── <timestamp>.json
🟩 4) Config Structure
Code
config/symbols.json
json
{
  "symbols": ["btcusdt", "ethusdt", "bnbusdt"]
}
🟩 5) Data Flow Diagram
Code
          ┌──────────────────────┐
          │   Binance WebSocket  │
          └──────────┬───────────┘
                     │
     ┌───────────────┼────────────────┐
     │                │                │
┌────▼─────┐   ┌─────▼─────┐   ┌──────▼──────┐
│ ws-trades│   │ ws-orderbk │   │ ws-kline 1m │
└────┬─────┘   └─────┬─────┘   └──────┬──────┘
     │               │                │
     ▼               ▼                ▼
┌──────────┐   ┌────────────┐   ┌──────────────┐
│addTrade  │   │addOrderbook │   │addCandle(1m) │
└────┬─────┘   └──────┬─────┘   └──────┬───────┘
     │               │                │
     └───────────────┴────────────────┘
                     ▼
             ┌──────────────┐
             │  aggregator   │
             └──────┬───────┘
                    ▼
           ┌──────────────────┐
           │ snapshot-builder │
           └──────┬──────────┘
                  ▼
        ┌──────────────────────┐
        │ writeSnapshot (1s)   │
        │ writeHistory (1m/1h) │
        └─────────┬────────────┘
                  ▼
        ┌──────────────────────┐
        │   scheduler (TFs)    │
        └─────────┬────────────┘
                  ▼
        ┌──────────────────────┐
        │ writeTimeframes.json │
        └─────────┬────────────┘
                  ▼
        ┌──────────────────────┐
        │     cleanup.js       │
        └──────────────────────┘
🟩 6) Candle Lifecycle
1m Candle
از WS-Kline دریافت می‌شود

در RAM ذخیره می‌شود

در history ذخیره می‌شود

snapshot ساخته می‌شود

1h Candle
هر 1 ساعت snapshot ساخته می‌شود

در history ذخیره می‌شود

🟩 7) Timeframe Lifecycle
Input
history/<symbol>/1m

history/<symbol>/1h

Output
market/<symbol>/timeframes.json

Standard Timeframes
1m

2m

5m

15m

30m

1h

2h

4h

6h

12h

1d

1w

1M

🟩 8) Module Responsibilities
aggregator
مدیریت state

ذخیره trades

ذخیره orderbook

ذخیره کندل‌ها

snapshot-builder
ساخت snapshot

فشار خرید/فروش

orderbook خلاصه‌شده

کندل جاری

writer
atomic write

کاهش I/O

ذخیره history

ذخیره timeframes

scheduler
ساخت تایم‌فریم‌ها

محافظ null

محافظ کندل ناقص

cleanup
حذف امن فایل‌های قدیمی

جلوگیری از حذف کندل‌های لازم

run-collector
اجرای کل سیستم

مدیریت WSها

مدیریت snapshotها

مدیریت scheduler

مدیریت cleanup

🟩 9) Execution Order
Load symbols from config

Initialize state for each symbol

Start WebSocket streams

Store 1m candles

Build 1s snapshots

Build 1h snapshots

Write history

Run scheduler

Build timeframes

Run cleanup

Run 24/7

🟩 10) Critical Development Notes
هر symbol باید state مستقل داشته باشد

writer باید atomic باشد

scheduler باید null را skip کند

cleanup باید فقط فایل‌های کامل را حذف کند

WSها باید داده کامل بدهند

snapshot باید همیشه candle داشته باشد

ساختار فایل‌ها باید ثابت بماند