📘 HANDOFF.md — Global Liquidity Map Architecture
🟦 1) معرفی پروژه
globalliquidity یک سیستم کلان برای جمع‌آوری، پردازش، امتیازدهی و هشداردهی جریان نقدینگی در بازارهای جهانی است.
این سیستم کاملاً Config‑Driven طراحی شده تا هیچ مقدار ثابت در کد وجود نداشته باشد و همه چیز از طریق کانفیگ قابل تغییر باشد.

هدف اصلی:

ساخت Global Liquidity Map

ساخت Liquidity Score Engine

ساخت Liquidity Alert Engine

ذخیرهٔ دادهٔ ۵ دقیقه‌ای برای تحلیل‌های آینده

سازگاری کامل با کندل‌های بازارهای مالی

🟧 2) فلسفهٔ طراحی
✔️ Config‑Driven
تمام آستانه‌ها، وزن‌ها، APIها، ساختار بازارها و قوانین هشدار در کانفیگ هستند.

✔️ Zero Hard‑Coding
هیچ مقدار ثابت در کد وجود ندارد.

✔️ Single Database (5‑minute snapshots)
فقط یک دیتابیس داریم که هر ۵ دقیقه داده‌ها را ذخیره می‌کند.

✔️ Real‑Time + Historical
دادهٔ ۵ دقیقه‌ای هم برای هشدارها استفاده می‌شود
و هم برای تحلیل‌های بلندمدت.

✔️ Modular Architecture
هر بخش کاملاً جدا و قابل‌گسترش است.

🟩 3) ساختار پوشه‌ها
پوشهٔ اصلی:

Code
collector/globalliquidity
ساختار کامل:
Code
/globalliquidity
│
├── /config
├── /ingestors
├── /processors
├── /alert-engine
├── /database
│   ├── /tables
│   └── /storage
├── /api
├── /utils
├── /logs
└── index.cjs
🟫 4) نقش هر پوشه
🟦 /config
تمام تنظیمات سیستم:

api.config.cjs

thresholds.config.cjs

markets.config.cjs

weights.config.cjs

alerts.config.cjs

database.config.cjs

هیچ مقدار ثابت در کد نیست.

🟧 /ingestors
این پوشه داده‌ها را از APIها وارد سیستم می‌کند.

زیرپوشه‌ها:

equity

bonds

commodities

fx

crypto

macro

هر فایل یک نوع داده را ingest می‌کند.

🟩 /processors
این پوشه دادهٔ خام را تبدیل به سیگنال می‌کند:

flowProcessor

priceVolumeProcessor

macroProcessor

liquidityScoreEngine

🟥 /alert-engine
موتور هشدار نقدینگی:

alertTriggers

alertThresholds

alertSeverity

alertEvaluator

alertDispatcher

کاملاً کانفیگ‌محور.

🟫 /database
/tables
تعریف جدول‌ها:

liquidity_equity

liquidity_bonds

liquidity_commodities

liquidity_fx

liquidity_crypto

liquidity_fundflows

macro_signals

liquidity_alerts

/storage
فایل دیتابیس واقعی:

Code
globalliquidity.db
و فایل migrations.

🟪 /api
مسیرهای API:

liquidity.routes

alerts.routes

markets.routes

snapshots.routes

🟨 /utils
ابزارهای عمومی:

httpClient

math

logger

normalizer

cache

🟫 /logs
لاگ‌های سیستم:

alerts.log

ingestors.log

errors.log

🟦 5) استاندارد timestamp
برای تطبیق با کندل‌های بازار:

Code
2026-09-06T16:45:00Z
UTC

دقیقه‌های رُند (00, 05, 10, …)

ثانیه = صفر

🟧 6) دیتابیس ۵ دقیقه‌ای
هر ۵ دقیقه یک رکورد جدید وارد می‌شود.

این رکورد شامل:

دادهٔ Equity

دادهٔ Bonds

دادهٔ Commodities

دادهٔ FX

دادهٔ Crypto

دادهٔ Macro

امتیاز نقدینگی

هشدارها

این دیتابیس هم برای هشدارها استفاده می‌شود
و هم برای تحلیل‌های آینده.

🟩 7) موتور امتیازدهی (Liquidity Score Engine)
ورودی‌ها:
جریان پول (Flow Signal)

قیمت/حجم (Price/Volume Signal)

سیگنال کلان (Macro Signal)

وزن‌ها (در کانفیگ):
Code
flow: 0.5
priceVolume: 0.3
macro: 0.2
خروجی:
امتیاز بین -100 تا +100
و سیگنال:

inflow

outflow

neutral

🟥 8) موتور هشدار نقدینگی (Alert Engine)
سه آستانه:
Minimum Threshold

Adaptive Threshold

Severity Levels

شدت هشدار:
weak

moderate

strong

خروجی:
در جدول:

Code
liquidity_alerts
ذخیره می‌شود.

🟫 9) چرخهٔ اجرای سیستم
هر ۵ دقیقه:
ingestors داده را می‌گیرند

processors سیگنال‌ها را محاسبه می‌کنند

score engine امتیاز نقدینگی را می‌سازد

alert engine هشدارها را ارزیابی می‌کند

داده در دیتابیس ذخیره می‌شود

API خروجی را ارائه می‌دهد

🟪 10) فایل سازندهٔ پوشه‌ها
در ریشهٔ پروژه:

Code
createStructure.cjs
این فایل کل ساختار را اتوماتیک می‌سازد.

⭐ نتیجهٔ نهایی
این فایل HANDOFF.md یک سند کامل است که:

کل معماری پروژه را توضیح می‌دهد

نقش هر بخش را مشخص می‌کند

استانداردهای سیستم را تعریف می‌کند

برای هر توسعه‌دهنده قابل‌فهم است

برای آینده قابل‌گسترش است

این همان چیزی است که یک پروژهٔ حرفه‌ای باید داشته باشد