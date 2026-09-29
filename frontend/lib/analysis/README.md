# Analysis Layer (AL) — `frontend/lib/analysis`

> لایهٔ تحلیل: **تنها منبع حقیقت** اندیکاتورها (و در فازهای بعد سیگنال/ساختار/دادهٔ خارجی).
> چارت انجین فقط **نمایش‌دهندهٔ** خروجی این لایه است.
> تصمیم‌های مصوب: **D7…D12** (کش دوگانه · اجرا در SSR+کلاینت · ساختار بازار نسخهٔ اول · providers offline-first · مهاجرت با shim · قرارداد ۳.۲).

## ۱) ساختار (وضعیت فعلی = فاز A1)

| مسیر | نقش | وضعیت |
|---|---|---|
| `versioning.ts` | `AL_VERSION` · `FORMULA_VERSIONS` · `paramsHash()` · `analysisCacheKey()` | ✅ A1 |
| `indicators/params.json` | پارامترها **بیرون از کد** (تنها منبع حقیقت) | ✅ A1 |
| `indicators/params.schema.ts` | اسکیما (`type/min/max/step/default`) + ولیدیتور fail-fast + `paramsFor`/`paramValue` | ✅ A1 |
| `indicators/types.ts` | قرارداد `IndicatorSeries`(هم‌طول با `null` گرم‌شدن) · `Descriptor` · `OHLC` | ✅ A1 |
| `indicators/compute/*.ts` | ریاضی خالص: `ema` `sma` `rsi` `macd` `atr` `bbands` `vwap` | ✅ A1 |
| `indicators/registry.ts` | `INDICATOR_REGISTRY` (۹ شناسه) + `computeIndicator()` + `isSeriesMap()` | ✅ A1 |
| `indicators/selftest.ts` | بردارهای طلایی دستی‌محاسبه + ناوردها ⇒ `alSelfTestSummary()` | ✅ A1 |
| `integrations/chart/indicators.ts` | AL → `ChartSeriesInput` (نقاط بدون تهی · `colorKey` تم · `scaleMargins` پنل) | ✅ A1 |
| `signals/types.ts` · `signals/registry.ts` | قرارداد **رویداد** سیگنال + `SIGNAL_REGISTRY` + `computeSignal()` | ✅ A2 |
| `signals/compute/{cross,volume,volatility}.ts` | کراس (golden/death) · جهش حجم (z-score) · شکست ATR | ✅ A2 |
| `integrations/chart/signals.ts` | رویداد → **لایهٔ مارکر** (`signal-markers`) + شمارش/پرووننس | ✅ A2 |
| `signals/compute/{patterns,divergence}.ts` | الگوهای کندلی (دوجی/چکش/ثاقب/پوشا) · دایورجنس (پیوت + اسیلاتور با `confirmedIndex`) | ✅ A2-2 |
| `signals/compute/stats.ts` | آمار مشترک (`mean/stdev/slope/round/clamp`) — **تک‌منبع** برای ماکرو و بازار (D11) | ✅ A2-2 |
| `market-structure/` · `external/` · `news/` · `engine/` | طبق نقشه | ⏳ A3…A5 |

## ۲) افزودن یک اندیکاتور (۴ گام، بدون دست‌زدن به چارت)

1. ریاضی خالص را در `indicators/compute/<id>.ts` بنویس (خروجی هم‌طول با `null` گرم‌شدن).
2. پارامترها را در `indicators/params.json` بگذار و در `params.schema.ts` قاعده بده (min/max/step/default + `descriptionKey`).
3. در `versioning.ts` یک `FORMULA_VERSIONS` برای شناسه اضافه کن (provenance + کلید کش).
4. در `registry.ts` یک `descriptor(...)` اضافه کن (دسته · خروجی · `scalePolicy`).

> چارت هیچ تغییری لازم ندارد: `?pane=<id>` یا افزودن به `buildIndicator` کافی است.

## ۳) قواعد سختِ این لایه

- **بدون مقدار جعلی:** خروجی هم‌طول ورودی است و «ناموجود» = `null` (روی چارت رسم نمی‌شود).
- **بدون رنگ/متن هاردکد:** فقط `colorKey` (اسلات تم) و `descriptionKey` (i18n).
- **provenance اجباری:** هر سری با `formulaVersion` و پارامترهای مؤثر منتشر می‌شود
  (`data-al-formula` · `data-al-params` در SSR).
- **کلید کش (D7):** `analysisCacheKey()` = `indicatorId|paramsHash|SYMBOL|tf|formulaVersion`
  — کش RAM + DB قابل‌بازسازی؛ **هرگز منبع حقیقت نیست**.
- **بدون کد تولیدی AI در runtime (A5):** AI فقط spec می‌دهد؛ اجرا از همین رجیستری بسته.

## ۴) ریاضی و مرجع‌ها

| اندیکاتور | تعریف قفل‌شده | مرجع |
|---|---|---|
| `ema` | `k = 2/(period+1)` · **seed = میانگین سادهٔ `period` مقدار اول** | **CJS** (`collector/crypto/common/analysis/indicators/base/price/price-indicators.cjs`) |
| `sma` | میانگین سادهٔ پنجرهٔ متحرک | **CJS** |
| `atr` | `TR` استاندارد · **میانگین ساده** (نه Wilder) | **CJS** |
| `rsi` | Wilder: seed میانگین ساده · هموارسازی `(avg·(n−1)+x)/n` | بردار کلاسیک وایلدر (≈۷۰٫۴۶) |
| `macd` | `line = EMA(fast)−EMA(slow)` · `signal = EMA(line)` با seed ساده · `hist = line−signal` | ناوردهای دقیق (سری ثابت ⇒ صفر) |
| `bbands` | `SMA ± k·σ` با **σ جامعه** | بردار `[1..20]` ⇒ `middle=10.5` · `upper=22.03256` |
| `vwap` | قیمت معمول `(h+l+c)/3` · تجمعی از ابتدای سری | بردار دو کندلی (۱۷٫۵) |

> تغییر هر تعریف ⇒ **bump `formulaVersion`** (وگرنه کش/پرووننس دروغ می‌گوید).

## ۵) تست

```bash
node test/analysis-a1.test.cjs        # ساختار + params + خودآزمون SSR + برابری AL↔CJS + پنل
node test/chart-spec-v3.test.cjs      # قرارداد چارت (ماکرو ۳٫۰ + تاریخی ۳٫۱)
```

- **برابری عددی:** صفحه مقدار AL را در `data-hist-ema21`/`data-hist-sma50` منتشر می‌کند و تست،
  انتظار را با **مرجع CJS** روی همان سری محور (انتقال NY + ادغام DST) حساب و مقایسه می‌کند.
- **خودآزمون:** `data-al-selftest="ok:N"` (بردارهای دستی + ناوردها + اعتبار `params.json`).

## ۶) حالت‌های رابط کاربری

| پارامتر | اثر |
|---|---|
| `?pane=none` (پیش‌فرض) | پنل **حجم** با رنگ‌های تم |
| `?pane=rsi` · `?pane=macd` | پنل اندیکاتور **AL** (بج‌ها/سری از رجیستری؛ حجم کنار می‌رود) |

## ۷) چنج‌لاگ

| تاریخ | تغییر |
|---|---|
| 2026-09-23 | **A1**: رجیستری + `params.json`/اسکیما + ۷ اندیکاتور + خودآزمون + پل چارت + مهاجرت D11 (`historical/indicators` = re-export) · ESLint سبز (۰ خطا) |
| 2026-09-23 | **A2**: `signals/` (قرارداد رویداد + رجیستری) + سه سیگنال (کراس/جهش حجم/شکست ATR) + لایهٔ مارکر عمومی `signal-markers` + انتقال کراس از `historical/indicators` به AL + کلیدهای `al.signals.*` در fa/en · گیت: ۶۵ assertion |
| 2026-09-23 | **A2-2**: الگوهای کندلی · دایورجنس (با `confirmedIndex`) · `stats.ts` (تک‌منبع آمار ماکرو↔بازار · D11) + `confirmedIndex` در قرارداد رویداد |
| 2026-09-23 | **A3**: ساختار بازار (`swing`/`bos`/`choch`/`fvg` + `engine`) · `structureInvariantErrors()` (ناورد نگاه-به-آینده) · ۲ سیگنال تازه (۷ سیگنال کل) · **قرارداد ۳.۲** (`StructureSpec` + provisional/confirmed) · **سیاست شلوغی چارت**: فقط `cross`+`structure`+`fvg` پرنشده رسم می‌شود (`data-al-markers`) و بقیه محاسبه/منتشر می‌مانند |
