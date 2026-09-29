1) هدف کلان سیستم
سیستم collector/historical/ یک دیتابیس آفلاین فقط-خلاصه می‌سازد که:

دادهٔ خام REST را از منابع مختلف دریافت می‌کند

آن را به ۹ سطح خلاصه‌سازی تبدیل می‌کند

فقط خلاصه‌ها را ذخیره می‌کند

کاملاً مستقل از WebSocket است

قابل rebuild کامل بدون شبکه است

قابل update incremental است

برای هر بازار و هر symbol دیتابیس مستقل می‌سازد

این سیستم ستون فقرات دادهٔ تاریخی TraderBOT است.

2) ساختار مسیرها — Multi‑Asset / Market‑Scoped / Symbol‑Scoped
ساختار جدید:

Code
collector/
  historical/
    <market>/              ← crypto / fx / commodities / indices / bonds / etf
      <symbol>/            ← BTCUSDT / ETHUSDT / XAUUSD / EURUSD / SPX / ...
        config.cjs
        ny-time.cjs
        summary-types.cjs
        logger.cjs
        historical.db
مثال‌ها:
Code
collector/historical/crypto/BTCUSDT/
collector/historical/crypto/ETHUSDT/
collector/historical/fx/EURUSD/
collector/historical/commodities/XAUUSD/
collector/historical/indices/SPX/
چرا این ساختار؟
هر بازار رفتار زمانی متفاوت دارد

هر symbol دیتابیس مستقل می‌خواهد

pipeline باید بتواند هر symbol را جدا build/update کند

آینده‌نگری: اضافه‌کردن طلا/نفت/فارکس بدون تغییر معماری

3) قواعد طلایی (غیرقابل نقض)
R1 — مرجع زمانی = NY Close
همهٔ باکت‌ها بر اساس 16:00 America/New_York بسته می‌شوند.

R2 — کلید هر ردیف = UTC epoch-ms
نه زمان محلی، نه برچسب NY.

R3 — تبدیل زمان فقط با Intl
ممنوع: moment/luxon/date-fns.

R4 — همهٔ توابع deterministic
ممنوع: Date.now / Math.random.

R5 — هیچ وابستگی npm جدید
فقط built‑in + better-sqlite3.

R6 — هیچ دادهٔ خامی در DB ذخیره نمی‌شود
نه OHLCV، نه ترید، نه depth، نه funding، نه OI.

R7 — MICRO فقط canonical ذخیره می‌شود
raw per-exchange فقط در RAM.

4) بازارها (Markets)
نسخهٔ جدید سند از چند بازار پشتیبانی می‌کند:

Market	مثال Symbol	منبع داده
crypto	BTCUSDT	REST صرافی‌ها
fx	EURUSD	FX providers
commodities	XAUUSD / WTI	CME / ICE / REST
indices	SPX / NASDAQ	Index providers
bonds	US10Y	Treasury feeds
etf	SPY / QQQ	Market data APIs


این ساختار آینده‌نگر است.

5) صرافی‌ها (Crypto Venues)
لیست ثابت ۵ صرافی اصلی:

Binance

Bybit

OKX

KuCoin

Bitget

این‌ها در config.cjs قرار می‌گیرند.

6) ۹ سطح خلاصه‌سازی (NY Close Anchored)
Code
MICRO → H1 → H4 → D1 → D5 → W1 → M1 → Y1 → Y4
تعریف‌ها:
MICRO = 1m

H1 = 60m NY

H4 = بلوک‌های ۴ساعته NY

D1 = 16:00 دیروز → 16:00 امروز

D5 = ۵ روز معاملاتی NY

W1 = هفتهٔ NY (جمعه 16:00)

M1 = آخرین روز NY ماه

Y1 = آخرین روز NY سال

Y4 = ۴ سال متوالی (یا هاوینگ)

7) درخت فایل نهایی
Code
collector/historical/<market>/<symbol>/
├── config.cjs
├── ny-time.cjs
├── summary-types.cjs
├── logger.cjs
├── historical.db
├── pipeline.cjs
├── fetch/
│   ├── client.cjs
│   ├── interface.cjs
│   ├── binance.cjs
│   ├── bybit.cjs
│   ├── okx.cjs
│   ├── bitget.cjs
│   ├── kucoin.cjs
│   └── coverage.cjs
├── micro_engine/
│   ├── index.cjs
│   ├── state.cjs
│   ├── features_base.cjs
│   ├── features_structure.cjs
│   └── canonical.cjs
├── summary/
│   ├── aggregate.cjs
│   ├── levels.cjs
│   └── rewind.cjs
└── db/
    ├── schema.sql
    ├── index.cjs
    ├── writer.cjs
    ├── reader.cjs
    ├── coverage.cjs
    ├── jobs.cjs
    └── maintenance.cjs
8) حالت‌های اجرا
--build
کل تاریخ → MICRO → DB → سطوح بالا → coverage.

--update
از coverage → دادهٔ جدید → rewind 48h → بازنویسی MICRO → recompute سطوح متأثر.

--rebuild-from-db
فقط از MICRO ذخیره‌شده → H1..Y4
بدون شبکه.

9) حجم تخمینی
MICRO کامل ۴ سال برای ۲ symbol ≈ ۸.۴M ردیف
کل DB ≈ چندصد MB
با retentionDays ≈ زیر ۱۰۰MB

10) ریسک‌ها
نبود depth تاریخی

محدودیت تاریخچهٔ 1m

OI/funding coarse

DST

محدودیت RAM

rate-limit

11) پرامپت‌های اصلاح‌شدهٔ P0–P11 (نسخهٔ کوچک و قابل‌اجرا)
✔ P0 — پایه
config / ny-time / summary-types / logger

✔ P1 — fetch core + Binance
✔ P2–P5 — سایر صرافی‌ها
✔ P6 — micro base
✔ P7 — micro structure
✔ P8 — summary engine
✔ P9 — db layer
✔ P10 — pipeline
✔ P11 — E2E tests