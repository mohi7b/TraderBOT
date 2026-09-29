# هندآف دامنهٔ ماکرو — Chart Engine v3.0
**وضعیت دامنه: ✅ Spec‑Locked / Stable — از این پس در حالت Maintenance**

| مورد | مقدار |
|---|---|
| بازهٔ کار v3.0 | **2026-09-23** (پس از تثبیت ۴ چارت ماکرو در 2026-09-21…23) |
| نسخهٔ قرارداد | **`CHART_SPEC_VERSION = "3.0"`** |
| نسخهٔ ریاضی دامنه‌ها | `cpi 1.0` · `policy 1.0` · `growth 1.0` · `financial 1.0` |
| چارت‌های تحویل‌شده | `CpiYoyChart` · `PolicyRateChart` · `GrowthChart` · `FinancialChart` |
| صفحه | `/dashboard/macro` (هر ۴ چارت زیر هم) |
| تست قرارداد | `node test/chart-spec-v3.test.cjs [COUNTRY…]` |

---

## ۱) مراحل انجام‌شده در v3.0

1. **لایهٔ قرارداد (`frontend/lib/chart/spec/`)**: `types.ts` · `version.ts` · `missing.ts` · `scales.ts` · `validate.ts` · `hints.ts` · `index.ts` · `README.md`.
2. **پاک‌سازی دِیون i18n**: همهٔ tooltipهای سیگنال از متن ثابت به `hintKey`+`hintParams`؛ ~۲۹ کلید زیر `macro.signals.*` در **fa/en**؛ صفحه قالب‌های ترجمه را به‌شکل **دادهٔ سریالایزپذیر** (`signalHints`) پاس می‌دهد و موتور با `resolveHint()` جای‌گذاری می‌کند.
3. **ScaleSpec + دیاگنوستیک SSR**: هر چارت `data-spec-version` · `data-math-version` · `data-missing-policy` منتشر می‌کند (+ `data-growth-cadence` · `data-growth-annual-fallback` · `data-financial-*`).
4. **هم‌سان‌سازی «بدون داده»**: سیاست واحد `na` ⇒ **`N/A`** در همهٔ چارت‌ها؛ برچسب سیگنال **ثابت** می‌ماند.
5. **تست قرارداد SSR**: ۴ spec · نسخهٔ ریاضی · سیاست‌ها · ۴ سطر ۷ بجی · نبود شکست خط · نبود tooltip ترجمه‌نشده.
6. **تکمیل دادهٔ چارت رشد برای کشورهای کم‌سری** (SAU/CAN/GBR/KOR) با **fallback سالانهٔ World Bank**.

## ۲) مشکلات کشف‌شده و رفع آن‌ها (همه در `lib/chart/README.md §۸` مستند شد)

| # | مشکل | ریشه | رفع |
|---|---|---|---|
| ۱ | صفحه ۵۰۰ + **کرش Turbopack** (panic روی متن فارسی) | پاس‌دادن **تابع** به Client Component — ممنوع در Next | پاس‌دادن **دادهٔ سریالایزپذیر** `signalHints` + `resolveHint()` در `spec/hints.ts` |
| ۲ | خطای React Compiler روی `pas.current` | نام `current` شبیه `ref.current` | استخراج `pasCurrentValue` بیرون از `useMemo` + افزودن به deps |
| ۳ | ۵۰۰ با `Cannot read … 'zoom'` | `getThemePreset()` تم resolve‌شده می‌دهد و `layout` ران‌تایم ندارد | چیدمان صریح در کامپوننت (`GROWTH_CHART_LAYOUT`) |
| ۴ | فضای آینده برای دادهٔ فصلی ۳ سال می‌شد | `futureMargin` **میله‌محور** است نه زمان‌محور | فصلی ۴ میله · سالانه ۱ میله · ماهانه ۱۲ (همه = یک سال) |
| ۵ | tooltip همهٔ خطوط یک مقدار | مقدار از «مقیاس قیمت → اولین سری» خوانده می‌شد | `seriesByIdRef.get(s.id)` |
| ۶ | سیگنال‌های بازار `N/A` می‌شدند | تطبیق سری فقط با `canon` بود، کد provider در `provider_code` | تطبیق با **هر سه هویت** (`code` · `provider_code` · `id`) |
| ۷ | سری روزانه هرگز وارد core.db نمی‌شد | فیلتر فقط M/Q/A | تجمیع **ماهانه** در دانلودر FRED |
| ۸ | بیلد با `filter violation` روی استثنای XM رد می‌شد | اعتبارسنجی استثنا را نمی‌شناخت | `FILTER_EXCEPTIONS` (یک منبع حقیقت) |
| ۹ | چارت رشد `SAU/CAN/GBR/KOR` بی‌داده بود | فقط ۱ نقطهٔ فصلی + کف ۸ نقطه | کف نمایش ۲ + **fallback سالانهٔ WB** (`NY.GDP.MKTP.KD.ZG`) |
| ۱۰ | `rankOfQuarter("2025")` = `-∞` | تاریخ سالانه الگوی `YYYY-Qn` نداشت | `YYYY ⇒ فصل ۴ سال` |
| ۱۱ | دادهٔ آیندهٔ IMF (تا ۲۰۳۱) | سری‌های WEO پیش‌بینی دارند | گارد «نقطهٔ جلوتر از مرجع» + حذف `NGDP_RPCH` از fallback |
| ۱۲ | پیام «No CPI data…» در چارت رشد/نرخ بهره | یک کلید مشترک به همه پاس می‌شد | چهار کلید `charts.empty_{cpi,policy,growth,financial}` |
| ۱۳ | `Yld` در حالت بی‌داده برچسبش هم `N/A` می‌شد | برچسب به‌جای مقدار عوض می‌شد | برچسب ثابت + فقط مقدار `N/A` |
| ۱۴ | نمادهای `⚡`/`🔥` روی Rmi/Im | درخواست کاربر | نمایش خالص عدد |
| ۱۵ | `—` در چارت رشد و `N/A` در چارت مالی | سه قرارداد موازی | یکپارچه‌سازی روی **`N/A`** |

## ۳) فایل‌های جدید و تغییرات (خلاصهٔ یک‌نگاه)

**جدید — فرانت‌اند**
`lib/chart/spec/{types,version,missing,scales,validate,hints,index}.ts` + `spec/README.md` ·
`lib/macro/{growth,financial,macroSignals}.ts` ·
`components/domain/macro/{GrowthChart,FinancialChart}.tsx` + سند `.md` ·
`lib/chart/themes/{shahrivar_growth,shahrivar_financial}/*` · `test/chart-spec-v3.test.cjs`

**ویرایش — فرانت‌اند**
`components/base/BaseChart.tsx` (`signalHints` · `resolveHint` · نردبان چهارسطحی `valueTone` · tooltip per-series · `breakAfter` · `markers`) ·
`lib/chart/{types,signals,adapters,themePresets}.ts` · `lib/server/{upstream,macro}.ts` ·
`app/dashboard/macro/page.tsx` · `messages/{macro,themeNames}.{fa,en}.json` ·
`components/domain/macro/{CpiYoyChart,PolicyRateChart,EventMarkers}.tsx` · `lib/chart/README.md`

**ویرایش — کلکتور**
`backend/http.cjs` (گروه‌های `1D_monetary` · `1E_growth_core` · `1F_market`) ·
`backend/catalog/registry.cjs` · `backend/core/picker_lib.cjs` ·
`core_db/build/build_core_db.cjs` (`GDP_GROWTH` · `MARKET_GLOBAL` · `FILTER_EXCEPTIONS`) ·
`core_db/build/filters/indicators.json` (۲۰ canon) ·
`offline/fred/download_fred_offline.cjs` (`long_term_rate` · `market_global` + تجمیع ماهانه) ·
`update/lib/smart_downloader.cjs` · `core_db/README.md`

## ۴) تصمیم‌های معماری (قطعی برای این دامنه)

1. **قرارداد اول** — هیچ چارتی بدون `ChartSpec v3` معتبر ساخته نمی‌شود (ولیدیتور سخت).
2. **مشتق را ذخیره نکن، در خواندن حساب کن** (هم‌راستا با `historical/api`).
3. **ریاضی خالص بیرون از React** (`lib/macro/*`) · **ظاهر فقط در تم** · **سیگنال دامنه‌ای با `signals.custom`**.
4. **حداکثر یک مقیاس دیدنی** (سری دوم ⇒ `overlay` مخفی).
5. **سری مشتق ⇒ `provenance` اجباری** (`formulaId` + `sourceSeriesIds`).
6. **بدون داده ⇒ بج `N/A` با برچسب ثابت** (هیچ مقدار ساختگی/صفر).
7. **هر endpoint جدید باید در allowlist پروکسی فرانت ثبت شود.**
8. `core.db` **مشتق** است (بازسازی آزاد) و `macro.db` **دست‌نخورده** می‌ماند.
9. UCL فقط **overlay فقط-افزودنی** · RealTime فقط **کریپتو** · UCL v1 با **DeepSeek API**.

## ۵) وضعیت نهایی چارت‌های ماکرو

| چارت | تم | سری‌ها | سیگنال‌ها (یک خط) | missing |
|---|---|---|---|---|
| تورم | `shahrivar` | Headline (قرمز) · Core (آبی) · 3M (خاکستری نقطه‌چین) | `Iss · Trend · Mom · Dev · Vol · Pressure · Stability` | `hide` |
| نرخ بهره | `shahrivar_policy` | Rate (کهربایی) · CPI (آبی) | `Pas · Real · Yld · Rmi · Im · Gap · Prf` | `na` |
| رشد | `shahrivar_growth` | GDP YoY (سبز فسفری) · QoQ SAAR (آبی) · روند | `Gas · GMI · OGI · GSI · PMI · NOW · GAPg` | `na` |
| شرایط مالی | `shahrivar_financial` | FCI (آبی درخشان) · 10Y کشور (overlay مخفی) | `Fas · Y10 · Credit · DXY · Equity · Liquidity · Vol` | `na` |

هر ۴ چارت **هم‌ارتفاع ۳۱۲px** · لجند داخل چارت · نام کشور داخل چارت · ۱۷ کشور.
پوشش داده: CPI ۱۷/۱۷ · POLICY_RATE ۱۷/۱۷ (+XM) · YIELD_10Y ۱۲/۱۷ · رشد فصلی ~۱۱ + **سالانه ۱۷/۱۷** · بازار جهانی ۵/۵ · **PMI/NOW موجود نیست** (بج `N/A`).

## ۶) نکات عملیاتی (مهم)

1. **بعد از هر بازسازی `core.db`** ⇒ **ری‌استارت بکاند** (fd به inode قدیمی) **و ری‌استارت سرور dev** (کش payloadهای `fetchMacroGroup`).
2. هر گروه/endpoint جدید = سه ویرایش هم‌زمان: `http.cjs` + `lib/server/upstream.ts` + `lib/server/macro.ts`، بعد فراخوانی در صفحه.
3. محیط ما **مرورگر headless ندارد** ⇒ راستی‌آزمایی با **SSR + `data-*`** (`data-spec-version` · `data-chart-signals` · `data-signal` · `data-growth-*` · `data-financial-*`).
4. گیت همیشگی: `npx tsc --noEmit` · `npx eslint <files>` · `node test/chart-spec-v3.test.cjs`.
5. متن فارسی در پیام خطا می‌تواند هایلایتر Turbopack را بکشد؛ دیباگ با SSR/لاگ.

## ۷) وضعیت Spec و Versioning

- **Spec در ۳.۰ قفل شد.** تغییر **ساختاری** (فیلد تازه در `ChartSpecV3` · سیاست missing جدید · قاعدهٔ ولیدیشن) ⇒ **`3.1`** + migration note در `spec/README.md` + به‌روزرسانی تست.
- تغییر **ریاضی/آستانه** ⇒ فقط `MATH_VERSIONS.<domain>++` + چنجلاگ سند همان چارت.
- تغییر ظاهر خالص ⇒ بدون bump.

## ۸) وضعیت دامنه: **Maintenance**

- ✅ مجاز: رفع باگ · اصلاح پوشش داده · i18n · به‌روزرسانی نسخهٔ ریاضی با مستندسازی.
- ⛔ ممنوع بدون bump: تغییر ساختار spec · تغییر ترتیب/تعداد سیگنال‌ها · افزودن canon بدون چک‌لیست §۶.
- 🚫 چارت/دامنهٔ جدید در این فولدر ساخته نمی‌شود ⇒ فاز بعدی: **Historical Charts** — سند: `HISTORICAL_CHARTS_PLAN.md`.


