# پلن فاز — چارت‌های تاریخی (Historical Charts)
**فاز: H (بعد از قفل‌شدن دامنهٔ ماکرو) · وضعیت: شروع — پیش از کدنویسی، دامنهٔ داده audit شد**

> دامنهٔ ماکرو در حالت Maintenance است (`MACRO_HANDOFF_v3.md`). این فاز **دامنهٔ جدید**
> است و هیچ فایل ماکرو بازنویسی نمی‌شود؛ فقط از قرارداد v3 استفاده می‌کند.

---

## ۱) Audit داده و زیرساخت (واقعی، از همین مخزن)

| جزء | مسیر | وضعیت |
|---|---|---|
| دادهٔ خام کندل | `collector/crypto/historical/crypto/BTCUSDT/candles_1m.db` | **۴٫۳۶GB**، فقط **۱ دقیقهٔ خام** OHLCV، کلید `(symbol, exchange, timestamp_raw)`، اسپات/فیوچرز جدا |
| ساخت تایم‌فریم در لحظه | `_engine/timeframe/build-tf.cjs` | ✅ (هیچ تایم‌فریمی persist نمی‌شود) |
| خلاصهٔ لحظه‌ای | `_engine/summary-dynamic/build-summary.cjs` | ✅ |
| API داینامیک | `collector/crypto/historical/api` → `GET /tf/:symbol/:tf` · `GET /summary/:symbol/:tf` | ✅ (منبع رسمی دادهٔ تاریخی) |
| اندیکاتورها | `collector/crypto/common/analysis/indicators/base/{price,volume,orderbook}` | ✅ (کد CJS — نیاز به **پورت خالص** به `frontend/lib/historical/indicators`) |
| RealTime | `collector/crypto/realtime/*` + `aggregator/{chart-data,market-indicator,fundamental-state}-service.cjs` | ✅ عقب — پل جلو در فاز `H4` |
| موتور چارت | `components/base/BaseChart` + `makeCandleSeries` + `priceScaleId`/`overlay` | ✅ آمادهٔ کندل‌استیک |
| سرور تاریخی | `collector/crypto/historical/api/server.cjs` | **پورت پیش‌فرض `4000`** (`HISTORICAL_API_PORT`) — یعنی فرانت دو upstream دارد: ماکرو `4001` · تاریخی `4000` |

**نکتهٔ یکپارچه‌سازی (H1):** پروکسی فرانت امروز فقط `MACRO_API_BASE` را می‌شناسد
(`lib/server/upstream.ts`). برای مسیر تاریخی باید یک **قاعدهٔ دوم** اضافه شود:
`HISTORICAL_API_BASE = process.env.HISTORICAL_API_BASE ?? "http://127.0.0.1:4000"` +
allowlist مستقل (`/tf/:symbol/:tf` · `/summary/:symbol/:tf`) تا **اصل allowlist** برای
دامنهٔ تازه هم رعایت شود (هیچ مسیر تازه‌ای بی‌اجازه رد نمی‌شود و هیچ مسیر قدیمی باز نمی‌ماند).

**فلسفهٔ داده:** «فقط ۱ دقیقهٔ خام ذخیره می‌شود؛ تایم‌فریم/اندیکاتور/زون در لحظه ساخته
می‌شود» — دقیقاً همان اصل **compute-on-read** که در v3 برای ماکرو تثبیت شد ⇒ این فاز
این اصل را ارث می‌برد و **هیچ جدول مشتق جدیدی** نمی‌سازد.

---

## ۲) نگاشت چهارلایه به دامنهٔ تاریخی

| لایه | ماکرو (انجام‌شده) | تاریخی (این فاز) |
|---|---|---|
| **TAMC** | زوم زمان‌محور · `futureMargin` میله‌محور · پریست‌های ۱M…MAX | همان زیرساخت؛ افزودن **آگاهی از تایم‌فریم** (`1m/5m/1h/4h/1D`) به `layout.zoom` و محور زمان + `secondsVisible` |
| **MACF** | ChartSpec v3 · theme shahrivar* · ۷ بج/سطر | همان spec + **افزودنی‌های تاریخی**: `symbol` · `exchange` · `market(spot|futures)` · `timeframe` · سری کندلی (`type:"candlestick"`) · لایه‌های overlay (MA/EMA/BB) · پنل زیرین (RSI/MACD/ATR) |
| **AIEL‑X** | CrossData/MacroMerge در حد صفحه | **CrossData دوطرفه**: ماکرو→تاریخی (رویدادهای CPI/نرخ بهره روی کندل) و تاریخی→ماکرو (نوسان/رژیم بازار به‌عنوان سری مشتق) · MacroMerge: سری‌های مشتق تاریخی (RV، drawdown، رژیم روند) · RealTime در `H4` |
| **UCL** | overlay فقط-افزودنی (مصوب) | همان: AI می‌تواند اندیکاتور/مارکر/رنگ اضافه کند — فقط روی overlay + audit |

---

## ۳) افزودنی‌های لازم به قرارداد (⇒ `CHART_SPEC_VERSION = "3.1"`)

چون این‌ها **ساختاری**اند، طبق قاعدهٔ نسخه‌بندی هندآف ماکرو، bump لازم است:

1. `HistoricalSpec` (بسط `ChartSpecV3`): `{ symbol, exchange, market, timeframe, overlays: OverlaySpec[], panes: PaneSpec[] }`
2. `OverlaySpec { id, kind:"ma"|"ema"|"bb"|"vwap"|"custom", params, scaleId, colorKey }`
3. `PaneSpec { id, kind:"rsi"|"macd"|"atr"|"volume", heightRatio }` (پنل زیرین؛ رعایت قاعدهٔ **یک مقیاس دیدنی در هر پنل**)
4. قواعد ولیدیشن تازه: تایم‌فریم مجاز · نماد مجاز · حداقل تعداد کندل · الزام `provenance` برای هر اندیکاتور (فرمول + پارامترها)
5. `MISSING_DISPLAY` بدون تغییر (همان `N/A`) · `ScaleSpec` بدون تغییر (همان `right`/`overlay`)

---

## ۴) نقشهٔ راه (H1 … H5)

| گام | دامنه | خروجی‌ها | معیار پذیرش |
|---|---|---|---|
| **H1** | **داده + spec** | پورت خالص اندیکاتورها به `lib/historical/indicators` · `lib/historical/timeframe.ts` · `HistoricalSpec` (spec 3.1) · **allowlist پروکسی** برای `/tf/:symbol/:tf` + `lib/server/historical.ts` | `tsc/eslint=0` · تست واحد طلایی برای MA/EMA/RSI/MACD/ATR/BB در برابر دادهٔ واقعی · SSR: یک endpoint تاریخی از فرانت پاسخ می‌دهد |
| **H2** | **اولین چارت کندلی** | `CandleChart` روی `BaseChart` (`type:"candlestick"`) + تم `shahrivar_hist` + لجند/متا/سیگنال مینیمال · صفحهٔ `/dashboard/historical` | SSR diagnostics (`data-spec-version="3.1"` · `data-hist-symbol` · `data-hist-tf`) · تست قرارداد نسخهٔ ۳.۱ |
| **H3** | **اندیکاتورها روی چارت** | overlays (MA/EMA/BB/VWAP) + panes (RSI/MACD/ATR/Volume) + سیگنال‌های تاریخی | هر overlay با `provenance` در tooltip · تست: مقادیر با منبع CJS مطابقت دارد |
| **H4** | **CrossData دوطرفه + RealTime (کریپتو)** | رویداد ماکرو روی کندل (از `releases.db`) · سری مشتق تاریخی (RV/drawdown/رژیم) به چارت‌های ماکرو · پل WS با throttle ۱–۴Hz | CrossChart: یک سری مشتق تاریخی در چارت مالی ماکرو دیده شود · کندل زنده با تأخیر <۲s |
| **H5** | **UCL روی تاریخی** | دستیار (DeepSeek API) با اکشن‌های اعلانی: افزودن اندیکاتور/مارکر/رنگ + overlay فقط-افزودنی + audit/rollback/kill-switch | افزودن یک اندیکاتور توسط AI و بازگردانی آن با یک فرمان، با ثبت در overlay |

---

## ۵) ریسک‌ها و کاهش‌شان

| ریسک | کاهش |
|---|---|
| `candles_1m.db` ۴٫۳GB و کوئری کند | استفادهٔ اجباری از `build-tf.cjs` در سمت سرور با `LIMIT`/پنجرهٔ زمانی + کش کوتاه‌مدت (۳۰–۶۰s) در پروکسی فرانت |
| دو سرور (ماکرو ۴۰۰۱ + تاریخی) | یک قاعده: هر منبع، یک allowlist؛ فرانت هرگز مستقیم به DB نمی‌زند |
| پورت اندیکاتورها (CJS → TS) | تست طلایی برابری خروجی با نسخهٔ CJS روی یک پنجرهٔ واقعی |
| کندل‌استیک در `BaseChart` | `makeCandleSeries` وجود دارد ولی تا امروز استفاده نشده ⇒ اولین کار H2 یک بازبینی کوچک موتور (مقیاس/لجند) است |
| حجم spec | افزودنی‌ها در فایل جدا `spec/historical.ts` و نگاه‌داشت `ChartSpecV3` بدون تغییر (سازگاری کامل ماکرو) |

---

## ۶) تصمیم‌های لازم از شما (پیش از کد H1)

1. **نمادها:** فقط `BTCUSDT` (که DB دارد) یا چند نماد؟ (فعلاً فقط BTCUSDT در DB موجود است.)
2. **تایم‌فریم‌ها:** کدام مجموعه؟ (`1m · 5m · 15m · 1h · 4h · 1D`)
3. **اندیکاتورهای نسخهٔ اول:** MA/EMA/BB (+VWAP) برای overlay و RSI/MACD/ATR/Volume برای پنل؟
4. **محل چارت:** صفحهٔ جدید `/dashboard/historical` یا توسعهٔ `/dashboard/crypto`؟
5. **spot یا futures یا هر دو؟** (DB هر دو را جدا دارد.)

---

## ۷) چنج‌لاگ اجرا — فاز H1 (تکمیل‌شده 2026-09-23)


### ۷.۱ تحویل‌شده

| قطعه | فایل | نکته |
|---|---|---|
| رجیستری سرویس/دامنه | `frontend/lib/historical/services.ts` | پورت ۴۰۰۰ · ۱۰ ونو + «همه» · ۱۰ تایم‌فریم · سقف‌ها · کش ۴۵s · `clampWindow` |
| **TAMC (مرز NY)** | `frontend/lib/historical/timeBoundary.ts` | D6: بدون دست‌زدن به DB/collector · `toNyAxisCandles`/`detectGaps`/`timeBoundarySelfTest` |
| اندیکاتورهای خالص | `frontend/lib/historical/indicators.ts` | EMA21/SMA50/Cross/Spread/آماره‌ها + `indicatorsSelfTest` |
| خواندن سرور | `frontend/lib/server/historical.ts` | allowlist مسیر/پارامتر · بدون throw · یکای ثانیه در query و میلی‌ثانیه در TAMC |
| قرارداد ۳.۱ | `frontend/lib/chart/spec/historical.ts` | `HistoricalSpecV31` + `OverlaySpec` + `PaneSpec` + ولیدیتور؛ **۳.۰ ماکرو دست‌نخورده** |
| تم کندلی | `frontend/lib/chart/themes/shahrivar_hist/*` | رنگ کندل/EMA/SMA/حجم/کراس + `wideLast` (بج هشدار دوبرابر) |
| افزودنی‌های موتور | `frontend/components/base/BaseChart.tsx` | رنگ کندل از تم · رنگ نقطه‌به‌نقطه · پنل زیرین (مقیاس مخفی) · بج عریض |
| چارت | `frontend/components/domain/historical/CandleChart.tsx` | کندل + EMA21/SMA50 + پنل حجم + **۸ بج** (۱ اصلی/۶ فرعی/۱ هشدار) + ۲۲ نشانگر `data-*` |
| صفحه | `app/dashboard/historical/crypto/page.tsx` | انتخابگر Asset/Venue/TF · پیام اختصاصی سرویس down · نمایش `clamped` |
| i18n | `messages/macro.{fa,en}.json` | بلوک `hist.*` + ۴ کلید `charts/hist_service_*` (هر دو فایل بازخوانی و اعتبارسنجی شدند) |
| تست + مستند | `test/chart-spec-v3.test.cjs` · `frontend/lib/historical/README.md` | قرارداد استاتیک ۳.۱ + هم‌خوانی i18n + SSR اختیاری |

### ۷.۲ تصمیم‌های مصوب

| کد | تصمیم |
|---|---|
| **D6** | مرز کندل‌ها (NY close) فقط در لایهٔ TAMC و با تابع موجود پروژه (`TimeShift`)؛ DB/collector/`bucketFloor` دست‌نخورده. |
| **D1** | ری‌استارت سرور تاریخی (:۴۰۰۰) مجاز شد — عملاً نیازی نبود، سرویس بالاست. |
| **D-H1** | در چارت کندلی `futureMargin` **میله‌محور** است ⇒ ۲۴ میله (یک روز در ۱h) به‌جای ۸۷۶۰ میلهٔ یک‌ساله؛ قابل تنظیم در UI در H2. |

### ۷.۳ وضعیت راستی‌آزمایی (صادقانه)

| بررسی | نتیجه |
|---|---|
| `tsc --noEmit` | **EXIT=0** (دو بار: پس از گام ۵ و پس از گام ۶) |
| قرارداد ماکرو (`test/chart-spec-v3.test.cjs` · USA/DEU/TUR) | **پاس** ⇒ هیچ رگرسیونی از افزودنی‌های موتور |
| قرارداد H1 (استاتیک + i18n) | پاس (پس از دو اصلاح در خودِ تست: مسیر تایپ‌ها و نادیده‌گرفتن کامنت‌ها) |
| SSR واقعی صفحهٔ تاریخی با کندل زنده | **تأییدنشده** — سرویس :۴۰۰۰ بالاست ولی رفت‌وبرگشت کامل در پنجرهٔ ابزار تمام نشد |
| نشانگر **گرافیکی** کراس روی کندل | پیاده نشد ⇒ بدهی مستند؛ مسیر: بوم لایه‌ها (`paintLayers`) در H2 |

### ۷.۵ بهبود کارایی سرویس تاریخی (اجرا شد 2026-09-23 · پس از H1)

| مسیر | قبل | بعد |
|---|---|---|
| `GET /tf/BTCUSDT/1h` بدون `exchange` (پیش‌فرض فرانت) · ۲۰۸ روز | ~۵۱ s | **۱٫۰۲ s** (بار دوم ۰٫۶۷ s) |
| `GET /tf/BTCUSDT/1d` بدون `exchange` | ۴۸٫۷ s | ۰٫۶۳ s |
| SSR صفحهٔ تاریخی | ۵۳ s | **۳٫۹۵ s** |

- **ریشهٔ واقعی** (با اندازه‌گیری، نه حدس): `listExchanges` = `COUNT(*) GROUP BY exchange` روی کل ایندکس نماد، **در هر درخواست بدون `?exchange`**. کوئری‌های دامنه‌دار خودشان سریع بودند (۲۰۸ روز ≈ ۱٫۵ s).
- **اصلاح‌ها** در `_engine/timeframe/build-tf.cjs` + `api/server.cjs`: تجمیع در SQL (بدون کشیدن ردیف‌های ۱m به JS)، کش فهرست صرافی‌ها (TTL ۱h) + warmup در راه‌اندازی (۲۶ s، فقط یک‌بار)، استفادهٔ مجدد از اتصال + `mmap_size`/`cache_size`.
- **تست طلایی دائمی:** `collector/crypto/historical/test/tf-golden.test.cjs` ⇒ `OHLC=0 · شناور=0 · timestamp=0` · `×۲٫۴` · `EXIT=0`.
- **راستی‌آزمایی SSR زنده (تأیید نهایی H1):** `HTTP=200 · t=3.95s · data-hist-candles="4557" · coverage="1.0000" · gaps="0" · cross="death:6" · cross-count="97" · data-points="candles:4557,ema21:4547,sma50:4508,volume:4557" · data-chart-signals="8" · data-signal-wide="2" · data-hist-time-boundary="ny-close"`.
- **یافتهٔ داده:** آخرین کندل انبار خام `2026-09-05` (کلکتور ~۱۸ روز عقب) ⇒ چارت تا همان تاریخ داده دارد (بدون کندل ساختگی). اجرای کلکتور = تصمیم جداگانه.

---

## ۸) H2 — شروع‌شده (2026-09-23)

### ۸.۱ نشانگر گرافیکی کراس (بدهی H1) ✅

| مورد | جزئیات |
|---|---|
| قرارداد | `CrossMarkerPoint` + `CrossMarkersLayer` در `lib/chart/types.ts` (افزودنی روی `ChartLayer`) |
| نقاش موتور | `paintCrossMarkers` + ثبت `"cross-markers"` در `LAYER_PAINTERS` (`lib/chart/layers.ts`) — ▲ زیر `low` برای طلایی · ▼ بالای `high` برای مرگ · رنگ از `goldenCross`/`deathCross` تم |
| دامنه | `lib/historical/crossLayer.ts` → `crossMarkerPoints()` + `crossMarkersLayer()` (**دادهٔ خالص/سریالایزپذیر**؛ هیچ تابعی از سرور به کلاینت نمی‌رود) |
| اتصال | `CandleChart` → `layers={chartLayers}` + نشانگر `data-hist-cross-markers` |
| تأیید | صفحهٔ زنده: `data-hist-cross-markers="97"` = `data-hist-cross-count="97"` · تست قرارداد `42 assertion` · `EXIT=0` · `tsc=0` |

**چرا نقاش درون‌موتوری و نه لایهٔ سفارشی؟** لایهٔ `CustomLayer` تابع `paint` می‌خواهد و
`CandleChart` یک Server Component است؛ پاس‌دادن تابع به Client Component همان باگ ۵۰۰/Turbopack
پروژه است. پس داده از دامنه و نقاشی در موتور (الگوی همهٔ لایه‌های فعلی).

### ۸.۲ رفع کرش DST + کلید i18n (بدهی‌های تازهٔ کشف‌شده در مرورگر)

| باگ | ریشه | رفع |
|---|---|---|
| `data must be asc ordered by time` (کرش صفحه) | در لحظهٔ تغییر ساعت، دو باکت ۱ساعته به **یک زمان NY** نگاشت می‌شدند (`2026-03-08T11:00Z`) | `collapseAxisCollisions()` در TAMC (ادغام دو باکت هم‌زمان‌شده؛ بدون کندل ساختگی) + تست DST در `timeBoundarySelfTest` + نگهبان ترتیب در موتور |
| `Uncaught Error: Value is null` در `applyZoom` | بازهٔ زوم نامعتبر ⇒ استثنای LWC | نگهبان بازه (رد مقادیر نامعتبر) + `try/catch` |
| `MISSING_MESSAGE: macro.hist_clamped_note` | کلید در بلوک `charts` بود، صفحه بدون پیشوند صدا می‌زد | سه کلید به `charts.hist_*` اصلاح شد |

منبع تشخیص: `frontend/.next/dev/logs/next-development.log` (لاگ کلاینت مرورگر).

### ۸.۳ باقی‌ماندهٔ H2

۱) کلید «فضای آینده» (`futureMargin`) در UI + پنل‌های RSI/MACD · ۲) چند نماد/ونو از DB واقعی ·
۳) tooltip چندسطری OHLC · ۴) ESLint در CI · ۵) بهبود UI (طبق ترتیب مصوب: بدهی‌ها سپس UI).

---

## ۹) Analysis Layer (AL) — فاز A1 تحویل شد (2026-09-23)

### ۹.۱ تصمیم‌های مصوب و نگاشت به کد

| تصمیم | پیاده‌سازی |
|---|---|
| **D7** کش دوگانه | `versioning.ts#analysisCacheKey()` = `indicatorId\|paramsHash\|symbol\|tf\|formulaVersion` + `paramsHash()` (FNV-1a) — کش RAM موجود (`HISTORICAL_CACHE`) + آماده برای DB قابل‌بازسازی |
| **D8** اجرا SSR+کلاینت | کتابخانهٔ یکتا در `lib/analysis/indicators/compute/*`؛ امروز در SSR اجرا می‌شود و همان توابع در کلاینت قابل اجرا هستند (بدون نسخهٔ دوم) |
| **D9** ساختار بازار نسخهٔ اول | Swing/BOS/CHoCH/FVG ⇒ فاز **A3** (Order Blocks/Liquidity به بعد) |
| **D10** providers offline-first | فاز **A4** (timeout/asOf/source/revision + `N/A`) |
| **D11** مهاجرت | ریاضی **فقط** در AL؛ `lib/historical/indicators.ts` = re-export shim؛ چارت بدون فرمول |
| **D12** قرارداد ۳.۲ | نسخهٔ `HistoricalSpec` هنوز ۳.۱ است؛ افزودنی‌های ۳.۲ (چند overlay/pane + `confirmedAt` + provisional/confirmed) با A3 اعمال می‌شود |

### ۹.۲ تحویل A1

- `versioning.ts` · `params.json` + `params.schema.ts` (اسکیما + fail-fast + `paramValue`) · `types.ts`
- هفت ماژول ریاضی خالص: `ema` `sma` `rsi` `macd` `atr` `bbands` `vwap`
- رجیستری ۹ شناسی: `ema` `ema_fast` `ema_slow` `sma` `rsi` `macd` `atr` `bbands` `vwap`
- `selftest.ts`: بردارهای دستی + ناوردها + اعتبار `params.json` (منتشر در `data-al-selftest`)
- پل چارت: `integrations/chart/indicators.ts` + اتصال `CandleChart` (EMA21/SMA50 از AL) + پنل `?pane=rsi|macd`
- **یک تغییر معنایی مستند:** seed EMA به **میانگین سادهٔ period مقدار اول** تغییر کرد تا با مرجع CJS یکی باشد
  (قبل: اولین مقدار). خودآزمون، خطای محاسبهٔ دستی خودم را هم گرفت (بردار درست: `[null,null,2,3]`).

### ۹.۳ شواهد اجرایی

```
tsc --noEmit            → TSC=0
eslint .                → LINT_EXIT=0 (0 error · 6 warning)
node test/analysis-a1   → 53 assertion · EXIT=0
   ✔ ساختار AL + رجیستری ۹ شناسه + D11 (بدون ریاضی در چارت) + params.json
   ✔ خودآزمون: ok:17 (SMA/EMA/RSI/MACD/ATR/BB/VWAP + ناورد + اسکیما)
   ✔ برابری AL↔CJS روی دادهٔ واقعی: EMA21 79738.501≈79738.501 · SMA50 80065.442≈80065.442 (۴۵۴۴ کندل محور)
   ✔ پنل: ?pane=macd → candles:4552,ema21:4532,sma50:4503,macd.line:4527
node test/chart-spec-v3 → 42 assertion · EXIT=0 (ماکرو بدون رگرسیون)
```

### ۹.۴ پیشنهاد فاز بعد

**A2 (Signal Engine):** حرکت `cross/spread/candleStats` از `historical/indicators.ts` به
`analysis/signals/` + رجیستری سیگنال با `hintKey`، و تبدیل `SIGNAL_LIBRARY` به shim روی AL
(تا چارت‌های ماکرو نشکنند) — سپس Divergence / Volume Spike / ATR Breakout / الگوهای کندلی.

---

## ۱۰) AL — فاز A2 (Signal Engine) تحویل بخش اول (2026-09-23)

### ۱۰.۱ تحویل‌شده

| قطعه | فایل | نکته |
|---|---|---|
| قرارداد رویداد سیگنال | `analysis/signals/types.ts` | `SignalEvent{kind,index,t,tone,label,value,meta}` · `SignalDescriptor{id,category,params,compute,formulaVersion,hintKey,tone,labelKey}` |
| رجیستری سیگنال | `analysis/signals/registry.ts` | `SIGNAL_REGISTRY` (cross · volume_spike · atr_breakout) + `computeSignal()` (fail-fast) + `listSignals()` (واژگان بسته برای AI) |
| ریاضی سیگنال | `signals/compute/{cross,volume,volatility}.ts` | کراس golden/death (منتقل‌شده از H1) · جهش حجم (z-score پنجرهٔ قبلی) · شکست ATR (`k·ATR`) — همه با `maxEvents` برای payload سبک |
| پارامترها | `params.json` بخش `signals` + `SIGNAL_PARAM_SCHEMA` | همان قاعدهٔ «خارج از کد» + `signalParamsFor()` + `validateSignalParams()` (fail-fast) |
| پرووننس | `versioning.ts` | `cross/golden_cross/death_cross/volume_spike/atr_breakout(_up/_down)`: `1.0.0` |
| لایهٔ بصری عمومی | `lib/chart/{types,layers}.ts` | `SignalMarkerPoint` + `SignalMarkersLayer` + `paintSignalMarkers` (رنگ از تُن/تم · شکل: دایره/مثلث) |
| پل چارت | `integrations/chart/signals.ts` | رویداد → لایهٔ مارکر + `counts` + `formulaVersions` + `signalCountsSummary()` |
| اتصال | `CandleChart.tsx` | ATR از AL برای سیگنال (بدون رسم) · `data-al-signals` و `data-al-signal-formulas` · لایهٔ قدیمی cross با لایهٔ عمومی جایگزین شد |
| i18n | `macro.{fa,en}.json` → `al.signals.*` | hint برچسب VS/AB با پارامترهای ICU (`{window}` `{z}` `{k}`) |

### ۱۰.۲ شواهد

```
tsc --noEmit          → TSC=0
eslint .              → LINT_EXIT=0 (0 error · 6 warning)
node test/analysis-a1 → 65 assertion · EXIT=0
   ✔ self-test AL: ok:18  (شامل اعتبار پارامترهای سیگنال)
   ✔ برابری AL↔CJS: EMA21/SMA50 دقیق روی ۴۵۴۴ کندل محور
   ✔ A2 signals: atr_breakout_down:19, atr_breakout_up:31, death_cross:49, golden_cross:48, volume_spike:50
     formulas: cross:1.0.0, volume_spike:1.0.0, atr_breakout:1.0.0
node test/chart-spec-v3 → 42 assertion · EXIT=0 (ماکرو سبز · کراس ۹۷ = همان عدد قبل از مهاجرت)
```

### ۱۰.۳ A2-2 (تکمیل‌شده همان روز)

| قطعه | فایل | نکته |
|---|---|---|
| **الگوهای کندلی** | `signals/compute/patterns.ts` | دوجی · چکش · ستارهٔ ثاقب · پوشای صعودی/نزولی با **تعریف میخکوب‌شده** (`body ≤ dojiRatio·range` · `shadow ≥ shadowRatio·body` · شرط‌های پوشا) و `confirmedIndex = index` (بدون کندل آینده) |
| **دایورجنس** | `signals/compute/divergence.ts` | پیوت فرکتال متقارن (`pivot`, `lookback`) + مقایسهٔ سقف/کف قیمت با اسیلاتور (اولین کلید `rsi*`) · **`confirmedIndex = index + pivot`** (انضباط نگاه-به-آینده) |
| **انضباط نگاه-به-آینده** | `signals/types.ts` | فیلد تازهٔ `confirmedIndex` در `SignalEvent` (پیش‌نیاز D12 برای A3) |
| **پارامترها** | `params.json` (`patterns`/`divergence`) + `SIGNAL_PARAM_SCHEMA` | `dojiRatio=0.1` · `shadowRatio=2` · `pivot=2` · `lookback=30` · `maxEvents=50` |
| **پرووننس** | `versioning.ts` | `patterns/divergence` و ۷ نوع رویداد = `1.0.0` |
| **SHIM (D11)** | `signals/compute/stats.ts` (AL) + `lib/chart/signals.ts` | آمار مشترک (`mean/stdev/slope/round/clamp`) **تک‌منبع** شد: کتابخانهٔ ماکرو از AL import می‌کند (σ نمونه‌ای عیناً حفظ شد) |
| **اتصال** | `CandleChart.tsx` | RSI از AL برای دایورجنس (سری رسم نمی‌شود) + هر دو سیگنال تازه به‌صورت خودکار از رجیستری می‌آیند (بدون تغییر چارت) |
| **i18n** | `macro.{fa,en}.json` → `al.signals.{patterns,divergence}` | hint با پارامترهای ICU (`{dojiRatio}` `{shadowRatio}` `{pivot}` `{lookback}`) |

**شواهد:** `tsc=0` · `eslint = 0 error` · تست AL **۷۴ assertion** · تست قرارداد **۴۲ assertion** · EXIT=0 در هر دو.
شمارش واقعی روی BTCUSDT/1h:
`golden_cross:48 · death_cross:49 · volume_spike:50 · atr_breakout_up:31 · atr_breakout_down:19 ·
pattern_doji:9 · pattern_hammer:9 · pattern_shooting_star:8 · pattern_bullish_engulfing:13 ·
pattern_bearish_engulfing:11 · divergence_bearish:30 · divergence_bullish:20`

### ۱۰.۴ باقی‌ماندهٔ A2/A3

۱) **بج‌های AL** روی سطر سیگنال (فعلاً همه‌چیز روی لایهٔ مارکر است) + اتصال `hintParams` به tooltip بج‌ها
۲) انتقال **کامل** `SIGNAL_LIBRARY` ماکرو به AL (فعلاً فقط آمار مشترک منتقل شد؛ ریاضی دامنهٔ ماکرو با تست برابری منتقل می‌شود)
۳) **A3 — ساختار بازار:** Swing (fractal) · BOS · CHoCH · FVG با `confirmedIndex` و نمایش provisional/confirmed (افزودنی‌های قرارداد ۳.۲)

---

## ۱۱) AL — فاز A3 (ساختار بازار) + قرارداد ۳.۲ + سیاست شلوغی چارت (2026-09-23)

### ۱۱.۱ تحویل‌شده (D9: نسخهٔ اول = Swing · BOS · CHoCH · FVG)

| قطعه | فایل | تعریف میخکوب‌شده |
|---|---|---|
| `market-structure/types.ts` | قرارداد | `SwingPoint` · `StructureBreak` · `FvgZone` · `StructureTrend` — همه با `confirmedIndex` |
| `swing.ts` | Swing | فرکتال **اکید** (تساوی پیوت نمی‌سازد) · `confirmedIndex = index + pivot` · ادغام پیوت‌های نزدیک‌تر از `minBars` · `lastConfirmedSwing` |
| `bos.ts` | BOS/CHoCH | شکست با `close` فراتر از آخرین سوینگ **تأییدشده** · هر سوینگ حداکثر یک‌بار · ماشین حالت: هم‌جهت=BOS · خلاف=CHoCH · تأیید در همان کندل |
| `choch.ts` | فیلترها | `classifyBreaks` (re-export) + `onlyChoch` / `onlyBos` |
| `fvg.ts` | FVG | سه‌کندلی (`low[i] > high[i−2]` / `high[i] < low[i−2]`) + `filledIndex` |
| `engine.ts` | موتور | `analyzeStructure()` + **`structureInvariantErrors()`** (ناورد نگاه-به-آینده برای CI) |
| `signals/compute/structure.ts` | پل سیگنال | `structureEvents()` (BOS/CHoCH) + `fvgEvents()` با `unfilledOnly` |
| رجیستری | `signals/registry.ts` | دو سیگنال تازه ⇒ مجموع **۷ سیگنال** |
| پارامترها | `params.json` + اسکیما | `structure{pivot=2, minBars=3, maxEvents=50}` · `fvg{maxEvents=50, unfilledOnly=1}` |
| پرووننس | `versioning.ts` | `structure/bos_*/choch_*` = 1.0.0 · **`fvg` = 1.1.0** (تغییر معنا: فقط پرنشده‌ها) |

### ۱۱.۲ قرارداد ۳.۲ (D12)

- `HISTORICAL_SPEC_VERSION = "3.2"` (ماکرو همچنان **۳.۰**)
- نوع تازهٔ `StructureSpec { confirmedOnly?, provisionalStyle?("dim"|"dashed"|"hidden"), requireConfirmedIndex? }`
- ولیدیتور کانونیک `validateHistoricalSpec` + alias سازگار `validateHistoricalSpecV31` · دو قاعدهٔ تازه (هشدارِ `requireConfirmedIndex=false` · خطای ترکیب متناقض)
- **نمایش provisional/confirmed:** مارکر تأییدنشده کم‌رنگ + خط‌چین (`alpha=0.35`) و شمارش در `data-al-provisional`

### ۱۱.۳ سیاست شلوغی چارت (مصوب کاربر 2026-09-23)

| قانون | پیاده‌سازی |
|---|---|
| فقط **ساختارهای مهم** روی بوم | `buildSignals({ display: ["cross", "structure", "fvg"] })` در `CandleChart` |
| بقیهٔ سیگنال‌ها حذف **نمی‌شوند** | محاسبه و در `data-al-signals` منتشر می‌شوند (آمادهٔ روشن‌کردن آینده) |
| زیرمجموعهٔ رسم‌شده قابل‌بازرسی | `data-al-markers` (فقط خانواده‌های رسم‌شده) |
| FVG پرنشده | `fvg.unfilledOnly=1` (پیش‌فرض) — نواحی پرشده فقط در `meta` می‌مانند |
| پنل مدیریت لایه‌ها | **تصویب شد** (کار بعدی): کلید خاموش/روشن اندیکاتور و سیگنال روی چارت، با تکیه بر همین `display` |

### ۱۱.۴ شواهد نهایی

```
tsc --noEmit            → TSC=0
eslint .                → LINT_EXIT=0 (0 error · 6 warning)
node test/analysis-a1   → 87 assertion · EXIT=0
   ✔ خودآزمون AL ok:22 (بردارهای مرجع + ناورد ساختاری/نگاه-به-آینده)
   ✔ برابری AL↔CJS: EMA21/SMA50 دقیق روی ۴۵۴۳ کندل محور
   ✔ ساختار روی دادهٔ واقعی: bos_up:19 · bos_down:11 · choch_up:10 · choch_down:10
   ✔ FVG پس از سیاست جدید: fvg_bull:2 (فقط پرنشده) · بقیهٔ خانواده‌ها محاسبه‌شده ولی رسم‌نشده
node test/chart-spec-v3 → EXIT=0 (قرارداد ۳.۲ + ماکرو ۳.۰ بدون رگرسیون)
```

### ۱۱.۵ باقی‌ماندهٔ AL

۱) **پنل مدیریت لایه‌ها** (خاموش/روشن اندیکاتور و سیگنال روی چارت) — مصوب، کار بعدی
۲) **بج‌های AL** روی سطر سیگنال + tooltip با `hintParams`
۳) انتقال کامل ریاضی `SIGNAL_LIBRARY` ماکرو به AL (فعلاً آمار مشترک منتقل شده)
۴) فازهای **A4** (دادهٔ خارجی/news) و **A5** (AI Integration با spec JSON و audit/rollback)

---

## ۱۲) Server Layer · Historical — فازهای S1 + S2 (2026-09-24)

### ۱۲.۱ تحویل‌شده

| بخش | فایل | کار |
|---|---|---|
| **Normalizer (تک‌نسخهٔ سرور · v1.0.0)** | `_engine/normalize/normalize.cjs` | صعودی اکید · حذف تکرار/آینده/نامعتبر · `gaps[]`/`missingBars`/`coveragePct` · تفکیک **`{closed, forming}`** · **هیچ کندل ساختگی** |
| هم‌آینهٔ قرارداد | `api/utils/spec-version.cjs` | `{ baseVersion:"3.0", specVersion:"3.2" }` |
| probe تازگی | `_engine/timeframe/build-tf.cjs#latestTimestampRaw` | `MAX(timestamp_raw)` روی ایندکس PK (O(log n)) |
| **Worker Thread (D23)** | `api/workers/engine-worker.cjs` | میزبان موتور: `ping · warmup · tf · metadata` · مالک اتصال SQLite |
| **Engine Proxy** | `api/utils/engine-proxy.cjs` | چرخهٔ عمر ورکر (+احیا) · **کش RAM: TTL 60s / LRU 60 + hit·miss·eviction** · **in-flight dedup** · timeout · fallback درون‌پروسه (`HISTORICAL_INLINE=1`) |
| `/tf` | `api/routes/tf-dynamic.cjs` | ساخت در ورکر + کش · افزودنی: `closed`/`forming`/`gaps`/`coveragePct`/`latestTimestamp`/`lagSeconds`/`meta{cached,clamped,normalizer,spec}` · `candles = closed+forming` (سازگاری عقب‌رو D24) · **سقف پنجره در API** (`MAX_CANDLES=5000`) |
| `/metadata/:symbol` | `api/routes/metadata.cjs` | از **پروکسی** (ورکر + کش ۵دقیقه‌ای) · تازگی/پوشش ۷روزه/ونوها/timezone/`tickSize:null` صادق · `cache.metaCached` |
| `/candles` alias · `/health` | `api/server.cjs` | alias بدون شکستن مسیر فعلی · `/health` با `ready/uptime/warmup/engine{…workers,hits,misses,deduped,ttl}` |
| تست‌ها | `test/normalize-s1.test.cjs` · `test/worker-s2.test.cjs` | S1: ۴۰ assertion · S2: ۲۵ assertion |

### ۱۲.۲ شواهد عددی

```
worker-s2     : ✔ /health در 52ms در حالی که warmup در ورکر می‌دود · workerAlive=true
                ✔ cold=47,572ms (miss) · warm=18ms (hit) · 1951 کندل
                ✔ ۳ درخواست موازی ⇒ workerCalls=1 · deduped=2
                ✔ from=0 ⇒ clamped=true · 4551 کندل (سقف ۵۰۰۰)
                ✔ قرارداد: closed/forming/gaps/coverage/latestTimestamp (۱۰۰٪) · 25 assertion · EXIT=0
normalize-s1  : ✔ واحد: coverage=50% · gaps=2 · closed=2 · forming=true
                ✔ زنده: ready=true پس از warmup · lag=19d · coverage7d=0% · venues=10 · tickSize=null
                ✔ /tf closed=4543 · /candles alias ✓ · صفحهٔ فرانت 4550 کندل · 40 assertion · EXIT=0
analysis-a1   : 87 assertion · EXIT=0 (بدون رگرسیون)
chart-spec-v3 : 43 assertion · EXIT=0 (ماکرو ۳.۰ دست‌نخورده · H1 ۳.۲)
```

### ۱۲.۳ انتخاب‌های مستند
- **D13/D19:** دیتابیس منبع حقیقت می‌ماند (RAM-only ممنوع) · «بدون خواندن مکرر» با TTL/LRU محقق شد، نه با آینهٔ کامل.
- **D23:** ورکر حلقهٔ HTTP را آزاد می‌کند، **ولی صف ورکر سری است** ⇒ درخواست سرد پس از استارت پشت warmup می‌ماند (`cold=47.5s`). **S3: warmup با اولویت پایین یا ورکر جداگانه.**
- **سطح گپ:** گپ‌گیری در سطح **باکت** (`1.5×tfWidth`) ⇒ `gaps=0` می‌تواند با ناقص‌بودن دقیقه‌ها هم‌زمان باشد؛ سطح دقیقه‌ای همان `coverage7d` در `/metadata` است (کریپتو ۲۴/۷ ⇒ «session» فقط NY-close برای `1d+`).

### ۱۲.۴ باقی‌ماندهٔ S3/S4
۱) اولویت‌بندی صف ورکر (warmup مؤخر یا ورکر جدا) تا `cold` از پشت warmup آزاد شود
۲) TF-کش **دیسکی** قابل بازسازی (D22) + `pre-warm` برای 1d/1w/1mo
۳) سیم‌کشی فرانت به `closed` (AL روی بسته‌ها) و نمایش `forming` به‌صورت provisional
۴) تست LRU با >۶۰ کلید (`evictions`) + مستندسازی envهای `HISTORICAL_*`

### ۷.۴ پیشنهاد برای H2 (بازبینی‌شده نسبت به جدول بخش ۴)

صفحهٔ کندلی، تم، spec و موتور **در H1 انجام شد** ⇒ H2 عملاً باید روی این‌ها تمرکز کند:
۱) نشانگر گرافیکی Golden/Death Cross روی کندل (بوم لایه‌ها) · ۲) کلید «فضای آینده» و پنل RSI/MACD در UI ·
۳) چند نماد و فهرست ونو از DB واقعی · ۴) tooltip چندسطری OHLC + حجم · ۵) ESLint و تست SSR خودکار در CI.

---

## ۱۳) Client Engine · فازهای C1–C4 (2026-09-24) — «چارت سبک، زنده، بدون لگ»

### ۱۳.۱ C1 — پنجرهٔ واحد: تصمیم در **سرور**
| موضوع | نتیجه |
|---|---|
| کلاینت | `clampWindow` از مسیر داده **حذف** شد (تابع برای سازگاری می‌ماند، deprecated) · فقط `tf` فرستاده می‌شود |
| سرور | اگر `from` نباشد، **خودسرور** پنجرهٔ مجاز را می‌سازد (`to − allowed`) و در `meta.window` گزارش می‌دهد (هیچ درخواستی «از ابتدای تاریخ» خوانده نمی‌شود) |
| لنگر | اگر پنجره بعد از آخرین داده بیفتد ⇒ **لنگر روی آخرین کندل موجود** (`meta.anchored`) + یک تلاش دوباره در پاسخ خالی |
| متادیتا | خواندن **مقاوم از سه سطح** (`data.meta` → ریشه → `data`). باگ واقعی: `clamped/anchored/window` داخل `data.meta`اند و قبلاً بی‌صدا `false` می‌شد |
| دیاگنوستیک SSR | `data-hist-window` · `data-hist-anchored` · `data-hist-lag` |

**شاهد رفع باگ اصلی:** ۱m/۵m چارت **خالی** بود (`count=0` چون سقف ۵۰۰۰ کندل پنجره‌ای کوتاه‌تر از عقب‌ماندگی ۱۸٫۸ روزه می‌ساخت) ⇒ حالا `1m=5000` · `5m=5000` و در SSR دیده می‌شوند.

### ۱۳.۲ C2 — مبنای ریاضی = **کندل‌های بستهٔ `closed`**
- قرارداد داده: `HistoricalCandlesResult ⇒ closed[] / forming` (اختیاری · سازگار عقب‌رو: شکل قدیمی ⇒ `closed = candles`) · کش سه‌گانه
- **همهٔ ریاضی AL روی `sigAxis`:** EMA21/SMA50 **و** کراس/ساختار/FVG — تصمیم صریح کاربر: «اندیکاتورها فقط روی کندل‌های بسته‌شده»
- `sigAxis` با **برش قابل‌اثبات** (`closed.length === axis.length − 1`) و در غیر آن **no-op** (هیچ off-by-one)
- `forming` فقط **رندر provisional** + `data-hist-forming` · `data-al-basis` · `data-al-basis-bars`
- assertion تازه در `test/analysis-a1.test.cjs` (دو حالت با/بدون forming) و **مرجع تست برابری هم‌مبنا با چارت**

### ۱۳.۳ C3 — diff + ETag/304 (**فقط `/tf`**)
- `since=<ms>` ⇒ `diff { since, appended[], revisedTail }` — قرارداد merge: **بازنویسی دم + افزودن دنباله** (idempotent) · `forming` همیشه کامل
- **ETag پایدار از محتوای معنادار** (بدون `window.to`/`nowMs`، وگرنه پنجرهٔ لغزان هش را هر ثانیه عوض می‌کرد) · `Cache-Control: no-cache` · «تغییری نیست» = **۳۰۴ با ۰ بایت**
- flag فوری: `HISTORICAL_DIFF=0`
- مسیر مرورگر: `app/api/historical/tf/route.ts` (allowlist دقیق + عبور ETag + بازگرداندن ۳۰۴ خالی) + `HistoricalLivePoller.tsx` (۴۵s · **توقف در تب مخفی** · **backoff نمایی تا ۳۰۰s** · `router.refresh()` فقط وقتی `appended>0` · flag `NEXT_PUBLIC_HISTORICAL_LIVE=0`)
- سوئیت تازه: `collector/crypto/historical/test/diff-c3.test.cjs` — **۱۷ assertion**

### ۱۳.۴ C4 — کش LRU کلاینت + سنجه‌های عددی
- `HISTORICAL_CACHE_MAX_SYMBOLS=3` (**LRU نمادمحور**: ورود نماد چهارم ⇒ تخلیهٔ کامل قدیمی‌ترین نماد) · `HISTORICAL_CACHE_TTL_MS=30000`
- `latestTimestamp` هر ورودی + **بازپخش متادیتای سرور روی cache-hit** (باگ واقعی: پنجرهٔ سرور ذخیره نمی‌شد ⇒ پاسخ کش با miss ناهمگون بود)
- شمارنده‌ها: `hits/misses/evictions/expired` + `historicalCacheStats()`
- سوئیت تازه: `test/cache-c4.test.cjs` (hit · ms · سوییچ TF · اعتبار پنجره/لنگر/عقب‌ماندگی · baseline KB)

### ۱۳.۵ شواهد عددی (اندازه‌گیری‌شده، نه ادعا)
```
C4 : بار دوم همان TF ⇒ data-hist-cache=hit · data-hist-ms: 1280ms → 0ms
     سوییچ TF: 1m=miss · 1h=hit · 1m(دوباره)=hit  ⇒ صفر درخواست تازه به سرور تاریخی
C3 : etag=W/"…" · If-None-Match ⇒ 304 با 0 بایت · 200 ⇒ 1.86MB (1h)
     diff(since=now−6h) ⇒ appended=5 · revisedTail=2026-09-23T23:00Z
baseline: /tf 1m=1808KB · /tf 1h=1860KB · SSR 1m=1290KB · SSR 1h=1298KB
کلکتور : حلقهٔ دقیقه‌ای روشن ⇒ lag≈0.004d و forming زنده (پیش‌تر lag=18.8d)
```
**نتیجهٔ صادقانه دربارهٔ «کاهش `data-*`»:** بار payload از **JSON کندل‌ها** است نه از اتریبیوت‌های تشخیصی (۳۰۴ = ۰ بایت) ⇒ حذفشان تست‌های قرارداد را می‌شکست و سود ~۰ داشت ⇒ نگه داشته شد. نقاش مارکر هم بدون تغییر ماند (تعداد اندازه‌گیری‌شده ≈ ۹–۵۴ ⇒ O(n) بی‌هزینه).

### ۱۳.۶ envهای `HISTORICAL_*` (مرجع عملیاتی)
| env | پیش‌فرض | کار |
|---|---|---|
| `HISTORICAL_API_PORT` | `4000` | پورت سرویس تاریخی |
| `HISTORICAL_INLINE` | — | `1` ⇒ اجرای موتور درون‌پروسه (بدون ورکر) |
| `HISTORICAL_WARMUP_DELAY_MS` | `3000` | تأخیر warmup (استارت‌های memo-گرم سریع) |
| `HISTORICAL_WARM_SYMBOLS` | `BTCUSDT` | نمادهای warmup |
| `HISTORICAL_EXCHANGE_MEMO` / `…_TTL_MS` | روشن / `24h` | memo دیسکی اسکن صرافی (S3) |
| `HISTORICAL_DIFF` | روشن | `0` ⇒ خاموشی diff |
| `HISTORICAL_MAX_CANDLES` (سقف پنجره) | `5000` | clamp پنجره در API |
| `HISTORICAL_CACHE_MAX_SYMBOLS` | `3` | ظرفیت LRU نماد در کلاینت |
| `HISTORICAL_CACHE_TTL_MS` | `30000` | TTL کش کلاینت |
| `NEXT_PUBLIC_HISTORICAL_LIVE` | روشن | `0` ⇒ خاموشی poller زنده |

### ۱۳.۷ باقی‌ماندهٔ صادقانه (تأییدنشده/کار بعدی)
۱) **مشاهدهٔ زندهٔ poller در مرورگر** (کد/تایپ/لینت تأیید شده، مشاهدهٔ خودکار ندارد)
۲) **اولویت صف ورکر** تا `cold` از پشت warmup آزاد شود (S4)
۳) TF-کش **دیسکی** (D22) + `pre-warm` برای 1d/1w/1mo (S4)
۴) **پنل مدیریت لایه‌ها** (AL) و فازهای A4/A5
۵) دیتابیس منبع حقیقت می‌ماند (D13/D19) — «بدون خواندن مکرر» با TTL/LRU محقق شد، نه آینهٔ کامل

---

## ۱۴) Server Layer · فاز S4 (2026-09-24) — warmup جدا + کش دیسکی تایم‌فریم

### ۱۴.۱ S4-A — رفع `cold=47.5s`: **دو اسلات ورکر**
باگ اندازه‌گیری‌شدهٔ S2/D23: صف ورکر **سری** است و اسکن صرافی (warmup) جلوی `/tf` و `/metadata` را می‌گیرد. چون op در حال اجرا **قابل‌پیش‌گیری نیست**، اولویت صف کافی نبود ⇒ **ورکر جداگانه**:
| قطعه | تغییر |
|---|---|
| `api/utils/engine-proxy.cjs` | `slots = { interactive, warmup }` · هر اسلات: `worker` + `pending` + `nextId` مستقل · `callWorker(op)` روی اسلات مربوطه · timeout/error هر اسلات روی `pending` خودش (+ احیای مستقل) |
| شمارنده | `warmWorkerCalls` |
| `/health` | `workerAlive/workerThreadId/workerPending` **و** `warmWorkerAlive/warmWorkerThreadId/warmWorkerPending` |

**اثبات عددی** (با پاک‌کردن memo تا warmup واقعاً سنگین شود):
```
t+5s : ready=false · warmWorkerAlive=true (thread 1) · workerAlive=false
       ⇒ اسکن صرافی در ترد خودش؛ ورکر تعاملی دست‌نخورده
لاگ  : GET /health {"status":200,"ms":11}   ⇒ پاسخ‌دهی در حین warmup
```

### ۱۴.۲ S4-B — کش دیسکی تایم‌فریم (D22) + pre-warm
| قطعه | جزئیات |
|---|---|
| ماژول | `api/utils/tf-disk-cache.cjs` — نوشتن **اتمی** (`tmp`+`rename`) · `version` اسکیما · TTL به‌عنوان **فیلتر ارزان** · شمارنده‌های `hits/misses/writes/stale/invalid/bytes` · **fail-open** (خطای دیسک ⇒ کش خاموش، سرویس سالم) |
| اعتبارسنجی | `rawLatest` هر snapshot با `latestTimestampRaw()` همین لحظه سنجیده می‌شود؛ قاعدهٔ حاکم **هم‌گروهی باکت** است (نگاه پایین) |
| pre-warm | `prewarm(symbols, tfs)` در بوت، **پس‌زمینه** (بلاک `ready` نمی‌کند) · هر TF جداگانه try (fail-open) · گزارش در `warmup.prewarm[]` و لاگ `tf pre-warm done (disk cache)` |
| شاهد روی دیسک | `BTCUSDT__1d__any__any__any.json` = ۵۲۶٬۷۱۷ بایت · `BTCUSDT__1w__any__any__any.json` = ۷۶٬۱۶۸ بایت |

**دو باگ واقعی که در همین فاز پیدا و رفع شد:**
۱) **ناهم‌کلیدی:** `prewarm` کلید `any__any` می‌نوشت ولی `route` کلید پنجرهٔ محاسبه‌شدهٔ C1 را می‌خواند ⇒ **هیچ‌وقت hit نمی‌شد** و `/tf 1d` سرد **>۹۰s** می‌ماند. رفع: پارامترهای `diskKeyFrom/diskKeyTo` ⇒ کلید کش دیسکی روی **پنجرهٔ خودِ درخواست** بسته می‌شود (پیش‌فرضِ فرانت بدون پنجره = هم‌کلید با prewarm).
۲) **قاعدهٔ سخت‌گیرانهٔ تساوی دقیق** با کلکتور فعال هر دقیقه invalid می‌شد ⇒ کش بی‌فایده. رفع: قاعدهٔ **هم‌گروهی باکت** (`floor(ts / tfWidthMs)`) ⇒ سری سروشده همان سری بازسازی است به‌جز «نوک باکت جاری» که ممکن است تا یک باکت عقب‌تر باشد؛ در سمت چارت بی‌اثر است چون **مبنای AL = `closed`** است (با کت نیم‌کاره هرگز وارد ساختار/اندیکاتور نمی‌شود) و نوک زنده با poll/diff تازه می‌شود.

### ۱۴.۳ envهای تازهٔ S4
| env | پیش‌فرض | کار |
|---|---|---|
| `HISTORICAL_TF_DISK` | روشن | `0` ⇒ خاموشی کش دیسکی |
| `HISTORICAL_TF_DISK_TTL_MS` | `600000` | فیلتر ارزان سن snapshot |
| `HISTORICAL_TF_DISK_DIR` | `api/.cache/tf` | محل snapshotها |
| `HISTORICAL_PREWARM` | روشن | `0` ⇒ بدون pre-warm |
| `HISTORICAL_PREWARM_TFS` | `1d,1w,1mo` | تایم‌فریم‌های پیش‌گرم |

### ۱۴.۴ رفع‌های عددی فاز دوم S4 (اندازه‌گیری‌شده)
| یافته | قبل | بعد | رفع |
|---|---|---|---|
| **prewarm روی ورکر تعاملی بود** ⇒ `/tf 1h` در حین prewarm | **>۱۰۰s** (تایم‌اوت) ✗ | **۱٫۳s** ✓ | `callWorker(op, args, {warm:true})` + `run({warm})` + `getTf({warm})` ⇒ pre-warm روی **ورکر warmup** |
| **هزینهٔ پنهان `getMetadata` برای یک عدد** (`latestTimestamp` لنگر C1 در **هر** `/tf`) | `/tf 1d` = **۹۵s** حتی با hit کش دیسکی ✗ | `proxy.latestTimestamp()` (probe مستقیم) | route لنگر از probe می‌گیرد، نه متادیتای کامل |
| ⚠️ **probe هم ارزان نبود** | `latestTimestampRaw(symbol, exchange=null)` روی ۴٫۷۸M ردیف = **۵۰٬۱۲۹ms** ✗ (ادعای «O(log n)» S1 برای حالت فیلترشده نادرست بود؛ ایندکس فیلتر را نمی‌پوشاند) | memo با TTL | `latestCache` + `HISTORICAL_LATEST_TTL_MS` (پیش‌فرض ۶۰s) · تغییر اسکیما/ایندکس store خام **ممنوع** ⇒ راه‌حل لایه‌ای |
| ساخت هر TF سنگین (۱d/۱w/۱mo) | — | **۵۶–۷۵ ثانیه** ✗ | کش دیسکی + pre-warm تنها راه کاربردی برای این TFهاست (اکنون فعال ✓) |

**کش دیسکی در عمل:** `hits=1` (سرو از دیسک ✓) · `stale=3` · `writes=5` · snapshotها: `1d`=۵۲۶٬۷۱۷B و `1w`=۷۶٬۱۶۸B ✓

**تست تازه:** `collector/crypto/historical/test/evict-s4.test.cjs` — eviction واقعی LRU با `cacheMax+7` کلید متمایز و ارزان (assert: `cacheSize ≤ cacheMax` · `evictions>0` · `misses>baseline` · hit روی تازه‌ترین کلید).

### ۱۴.۵ رفع گلوگاه ۷۵ ثانیه‌ای مسیر سرد (S4 · فاز سوم)
| تغییر | جزئیات |
|---|---|
| **اثر انگشت DB (O(1))** | `dbFingerprint(symbol)` = `size:mtimeMs` فایل `candles_1m.db` (با `resolveRaw1mPath`). **اعتبار درجهٔ یک** برای snapshot دیسکی: اگر فایل خام تغییر نکرده ⇒ هیچ دادهٔ تازه‌ای نیست ⇒ سرو از دیسک **بدون هیچ کوئری** ✓ · شمارندهٔ `diskHitFingerprint` |
| **درجهٔ دوم اعتبار** | اگر فایل تغییر کرده باشد: قاعدهٔ **هم‌گروهی باکت** با `latestTimestamp()` (که **memo** ۶۰s دارد) — و اگر snapshot فرمت قدیم/بی‌اثرانگشت باشد فقط همین مسیر اجرا می‌شود |
| **لنگر تنبل (lazy anchor)** | پیش‌بررسی «پنجره بعد از آخرین داده است؟» حذف شد (بدون probe گران ممکن نبود ✗) ⇒ همان نتیجه از شاخهٔ **پاسخ خالی** می‌آید و probe فقط **یک بار** در همان حالت اجرا می‌شود ⇒ مسیر گرم/کش‌دیسکی **صفر probe** |
| env | `HISTORICAL_LATEST_TTL_MS` (پیش‌فرض ۶۰s) — TTL memo لنگر |

**علت‌یابی صادقانه (کشف S4):** `latestTimestampRaw(symbol, exchange)` روی ۴٫۷۸M ردیف **۵۰–۷۵ ثانیه** است ✗ — ادعای «O(log n)» در §۱۲.۱ برای حالت فیلترشده **نادرست** بود (ایندکس، شرط فیلتر را نمی‌پوشاند). چون تغییر ایندکس/اسکیما روی store خام **ممنوع** است، رفع در لایهٔ سرویس انجام شد: memo + اثر انگشت فایل + لنگر تنبل. ⇒ هزینهٔ گران از مسیر درخواست حذف شد (به‌جز یک بار در بوت اول برای snapshotهای بی‌اثرانگشت).

### ۱۴.۶ باقی‌ماندهٔ S4 (صادقانه)
۱) تست **احیای ورکر warmup** پس از خطا (کد آماده، تست نزده — نیاز به fault injection) · ۲) گرم‌کردن memo لنگر برای **کلید صرافیِ پیش‌فرض فرانت** (اکنون pre-warm فقط کلید `auto` را گرم می‌کند) · ۳) مشاهدهٔ زندهٔ poller در مرورگر · ۴) ثبت اعداد بوت نهایی در همین بخش.

---

## ۱۵) S5 — مبدأ محور **ثابت `21:00 UTC`** (2026-09-24) · حذف کامل وابستگی به DST نیویورک

### ۱۵.۱ چرا (باگ اندازه‌گیری‌شده)
تست برابری AL↔CJS اختلاف **سیستماتیک** `1.08e-3` در EMA21 می‌داد و در دو اجرا **بیت‌به‌بیت یکسان** بود ⇒ نویز/زمان‌بندی نبود ✗. تشخیص با لاگ دو سری:
```
candles=5001 · chartBars=5000 · axis=4999   ✗   ⇒ یک میله در محور ادغام می‌شد
```
`collapseAxisCollisions` در **گذر DST نیویورک** دو باکت UTC را به یک زمان محلی نگاشت می‌کرد ✗ ⇒ **دنبالهٔ closes** دو طرف فرق می‌کرد ⇒ اختلاف در همهٔ اندیکاتورها (EMA/SMA/RSI/MACD/ATR/BB/VWAP).

### ۱۵.۲ تأییدهای پیش از تغییر (شش‌گانه · مصوب کاربر)
| پرسش | پاسخ + شاهد |
|---|---|
| برخورد DST | مبدأ ثابت ⇒ نگاشت `ts` یا `ts+K` ⇒ **تضمین ریاضی عدم برخورد** ✓ (تست قبلی خودش انتظار برخورد داشت ✗) |
| پنجرهٔ C1 (۵۰۰۰) | تماماً UTC-ms سمت سرور (`clampWindow`) ⇒ بی‌اثر ✓ · و ادغام میله حذف می‌شود ✓ |
| اندیکاتورها | منبع اختلاف **همان ادغام** بود ⇒ با دنبالهٔ خام، برابری **دقیق** ✓ |
| `diff`/`revisedTail` (C3) | روی timestamp خام UTC ساخته می‌شوند ⇒ بی‌اثر ✓ |
| کش دیسکی/اثر انگشت (S4-B) | اثر انگشت = `size:mtime` · کلید = پنجرهٔ خام · payload = کندل خام UTC ⇒ **بدون invalidate** ✓ |
| جای دیگر | فقط فیلد اطلاعاتی `metadata.nyClose` ✗ — موتور/کلکتور/DB تماماً UTC ✓ |

### ۱۵.۳ تغییر اعمال‌شده
| فایل | تغییر |
|---|---|
| `timeBoundary.ts` | `AXIS_ORIGIN_HOUR_UTC=21` + `AXIS_ORIGIN_MS` + **`toAxisTime(ts, tf)`**: داخل‌روزی = **بدون شیفت** · روزانه+ = `ts + 21h` ✓ · `toNyAxisTime` = **alias deprecated** (همهٔ فراخوان‌ها خودکار روی نگاشت تازه) |
| self-test | ناوردهای تازه: شیفت داخل‌روزی = ۰ · close روزانه = `21:00Z` · در گذر DST: **۲ کندل، فاصلهٔ دقیقاً ۱h، صفر ادغام** ✓ |
| `CandleChart.tsx` | `data-hist-time-boundary="utc-21"` ✓ |
| `metadata.cjs` | `axisOrigin: { kind:"fixed-utc", hour:21 }` ✓ (+ `nyClose` deprecated) |
| تست‌ها | `analysis-a1#buildAxis` آینهٔ مبدأ ثابت ✓ · دو assertion `chart-spec-v3` → `utc-21` ✓ |
| i18n | توصیف قالب `shahrivar_hist` (fa/en) به مبدأ ثابت به‌روز شد ✓ |

### ۱۵.۴ شواهد عددی پس از تغییر
```
tsc=0 · eslint=0
analysis-a1 : EXIT=0 · ✔ parity EMA21 84295.898≈84295.898 · SMA50 85354.979≈85354.979 (5000 کندل · مبنا=closed)
              diag: axis=5000 == chartBars=5000          ← ادغام حذف شد (قبلاً 4999 ✗)
chart-spec-v3: EXIT=0 (۳ کشور) · normalize-s1: 40 assertion ✓
SSR          : data-hist-time-boundary="utc-21" · data-hist-candles="5001"
```
⇒ **تنها قلم باز قبلی (پارټی A1) بسته شد** ✓

### ۱۵.۵ اثر بر لایه‌های دیگر
- **موتور/دیتابیس/کلکتور: دست‌نخورده** (UTC خام ✓ · `bucketFloor` ✓ · D6 محترم ✓)
- C3 (diff/poller) و S4 (کش RAM/دیسک/اثر انگشت) **بی‌اثر** ✓
- قرارداد نمایش: `data-hist-time-boundary="utc-21"` (جای `ny-close`) · `metadata.axisOrigin`
- ⚠️ **`R1 — NY Close` در `_legacy/DESIGN.md` برای چارت تاریخی منسوخ شد** (چارت‌های ماکرو/ری‌تایم دست‌نخورده ✓)
- `nyOffsetMinutes`/`nyCloseMsOfUtcDay`/`toNyAxisTime` فقط برای سازگاری باقی‌ماندند (deprecated ✓)

### ۱۵.۶ تصمیم معنایی (صریح)
برچسب محور برای کاربر نهایی **۲۱:۰۰ UTC** است (در EDT معادل ۱۷:۰۰ نیویورک ✗). این **تصمیم مصوب** است: یکنوایی/پایداری محور و حذف برخورد، به‌جای هم‌راستایی با ساعت محلی نیویورک در تابستان.



