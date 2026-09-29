# Chart Engine v3 — قرارداد (`lib/chart/spec/`)

> **نسخهٔ قرارداد: `3.0`** — هر تغییر ناسازگار در این پوشه ⇒ `CHART_SPEC_VERSION` بالا می‌رود.

## چرا این پوشه؟

پیش از v3 هر چارت دامنه (تورم · سیاست پولی · رشد · شرایط مالی) قرارداد خودش را
داخل کد کامپوننت می‌ساخت و نتیجه سه درد واقعی بود:

1. **سه قرارداد موازی برای «بدون داده»**: حذف بج · `—` · `N/A` (رفتار ناهمگون بین چارت‌ها).
2. **متن tooltip هاردکد در دامنه** (نقض «هیچ متن ثابتی در کامپوننت‌ها» در `ROADMAP_FRONTEND §5`).
3. **نسخهٔ ریاضی ثبت نمی‌شد** ⇒ عوض شدن وزن FCI یا آستانهٔ PAS، تحلیل دیروز را غیرقابل‌بازتولید می‌کرد.

## فایل‌ها

| فایل | نقش |
|---|---|
| `types.ts` | `ChartSpecV3` · `ScaleSpec` · `SeriesSpec` · `MissingPolicy` · `Provenance` · `SeriesStatus` + `CHART_SPEC_VERSION` |
| `version.ts` | `MATH_VERSIONS` (نسخهٔ ریاضی هر دامنه) · `chartKeyOf(domain, country)` |
| `missing.ts` | **تنها** پیاده‌سازی سه سیاست `hide`/`dash`/`na` + `missingSignal()` (هیچ مقدار ساختگی، رنگ سفید، بدون فلش) |
| `scales.ts` | `PRIMARY_SCALE` (راست دیدنی) · `OVERLAY_SCALE` (کمکی مخفی) · `scalesFor()` |
| `validate.ts` | ولیدیتور دستی (سبک `themeSpec.ts`) + `warnChartSpec()` در dev |
| `hints.ts` | `lookupHint()` · `formatHint()` · `resolveHint()` — حل tooltip از کلید i18n روی **کلاینت** |

## قواعد سخت (error در ولیدیتور)

1. `specVersion` = نسخهٔ جاری
2. `key` / `theme` / `mathVersion` غیرخالی
3. حداقل یک سری `role: "main"`
4. یکتایی `id` سری‌ها و مقیاس‌ها
5. هر `series.scaleId` تعریف‌شده باشد
6. **حداکثر یک مقیاس دیدنی** (قاعدهٔ «دو محور دیدنی ممنوع»)
7. سری `role: "derived"` **اجباراً** `provenance` با `formulaId` + `sourceSeriesIds`
8. `signals.max ≥ ۱` و `customIds` بدون تکرار
9. `layout.zoom` در `ZOOM_PRESETS`

## سیاست «بدون داده» (یکسان‌سازی‌شده — 2026-09-23)

| سیاست | نمایش | وضعیت |
|---|---|---|
| `hide` | بج رسم نمی‌شود | فعال — سیگنال‌های کتابخانه‌ای چارت تورمی (`cpi`) |
| `dash` | `—` | **دیگر استفاده نمی‌شود** (سازگاری) — به‌درخواست کاربر همه به `N/A` یکپارچه شد |
| `na` | `N/A` | **استاندارد فعلی** — چارت‌های `policy` · `growth` · `financial` |

قواعد ثابت در همهٔ حالت‌ها:
- **عنوان/برچسب سیگنال همیشه ثابت می‌ماند** (`Yld` · `Real` · `PMI` · `NOW` · `OGI` …) و
  فقط **مقدار** `N/A` می‌شود (قبلاً برای `Yld` برچسب هم به `N/A` تبدیل شده بود ✗).
- **بدون مقدار ساختگی/صفر** · رنگ متن سفید خنثی · **بدون فلش** · بدون شدت.

## i18n tooltipها (چرا تابع نداریم)

چارت‌ها Client Component و صفحه Server Component است ⇒ طبق Next **تابع** را
نمی‌توان پاس داد (نسخهٔ اول `hintText` صفحه را ۵۰۰ کرد و Turbopack را روی متن
فارسی پنیک کرد). الگوی نهایی:

```
messages/macro.{fa,en}.json →  signals.<id>.<field>   (قالب + {param})
صفحه (سرور)      →  signalHints = (await getMessages()).macro.signals   ← دادهٔ ساده
BaseChart (کلاینت) →  resolveHint(signal, signalHints)  ← جست‌وجو + جای‌گذاری {param}
دامنه            →  hintKey + hintParams  (بدون هیچ متن ثابتی)
```

## دیاگنوستیک SSR (قابل‌بازرسی بدون مرورگر)

هر چهار چارت این attributeها را منتشر می‌کنند:
`data-spec-version` · `data-math-version` · `data-missing-policy`

## نسخهٔ ریاضی دامنه‌ها (فعلی)

| دامنه | نسخه | نکته |
|---|---|---|
| `cpi` | 1.0 | ISS + سیگنال‌های کتابخانه |
| `policy` | 1.0 | PAS (EFT=0.4C+0.6F) + Real/Yld/Rmi/Im/Gap/Prf |
| `growth` | 1.0 | GAS (GFT=0.4/0.6) + GMI/OGI/GSI/PMI/NOW/GAPg |
| `financial` | 1.0 | FAS (FCI وزنی) + Y10/Credit/DXY/Equity/Liquidity/Vol |

## نسل بعد (v3.1 … v3.5 — مصوب کاربر)

`v3.1` CrossData/MacroMerge · `v3.2` Events (از `calendar/releases.db`) ·
`v3.3` RealTime (فقط کریپتو) · `v3.4` UserData (نقاط خرید/فروش) ·
`v3.5` UCL با **DeepSeek API** + اکشن‌های اعلانی + **overlay فقط-افزودنی**
(هرگز نوشتن روی `core.db`/`macro.db`) + audit/rollback/kill-switch.
