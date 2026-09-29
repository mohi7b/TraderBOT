# `update/` — سیستم به‌روزرسانی زندهٔ ماکرو

> اجرا: `node collector/macro/update/update_live.cjs [--source=OECD] [--force] [--dry-run]`
> مبنا: `lib/paths.cjs` (مسیرها) · `lib/sqlite.cjs` (query/exec) · `lib/light_checker.cjs` (پروب سبک)

## خط لوله

```
read update_schedule.json
  → light check (پروب سبک: آیا دادهٔ جدید هست؟)
  → smart downloader  (downloaded/<source>/)
  → extractor         (ZIP فقط: extracted/<source>/)
  → normalizer        (normalized/<source>/{series,data}.csv)
  → comparator+writer (INSERT / REVISION / IGNORE در db/macro.db)
```

## 🆕 آپدیت افزایشی (P1 — 2026-09-20)

هدف: اجرای روزانه سبک بماند — به‌جای دانلود کل تاریخچه، فقط دوره‌های جدیدتر از
**watermark** موجود در `macro.db` گرفته می‌شود.

| منبع | پارامتر | watermark (نمونه) | کاهش حجم |
|---|---|---|---|
| **OECD** (فلوی قیمت‌ها) | `startPeriod=<آخرین ماه − ۱>` | `OECD.CPI_IDX_*` → `2026-08` | **۷۵,۴۸۷ → ۱۰۸ ردیف** (۱۵ ثانیه) |
| **EUROSTAT** | `lastTimePeriod=<ماه‌های عقب + ۲>` | `EUROSTAT.HICP_*` → `2025-12` | **۱۲۱,۰۹۷ → ۳,۶۳۰ ردیف** (۱۲ ثانیه) |
| **FRED** | (بدون تغییر: فایل‌ها کوچک‌اند) | — | — |

پیاده‌سازی در `lib/smart_downloader.cjs`:

```js
latestDbDate({ dataset, indicatorLike, frequency })   // MAX(date) از macro.db
oecdStartPeriod(canonicalDate, freq)                  // ۱ دوره عقب‌تر (برای بازنگری‌ها)
eurostatLastTimePeriod(canonicalDate, "M" | "A")      // تعداد دورهٔ آخر (+۲ حاشیه)
downloadOecdPrices(opts)                              // فلوی DSD_PRICES@DF_PRICES_ALL
```

> **چرا ایمن است؟** `comparator_writer.cjs` فقط `INSERT` (رکورد جدید) و
> `REVISION` (بستن نسخهٔ قبلی + درج نسخهٔ جدید) انجام می‌دهد و **هرگز** رکوردی را
> به‌خاطر غیبت در CSV حذف نمی‌کند ⇒ فایل جزئی (incremental) دادهٔ قدیمی را از بین نمی‌برد.
> آزمون واقعی: `before=12,456,538` → `after=12,457,149` ردیف (فقط افزودن، بدون حذف).

## ⚠️ دو نکتهٔ فنی OECD (کشف‌شده 2026-09-20)

1. **`fetch` نود کار نمی‌کند:** سرور SDMX سازمان OECD به درخواستی که از `fetch`
   (undici) بیاید و هدر `Accept` داشته باشد **500 Internal server error** می‌دهد.
   همان درخواست با ماژول `https` نود یا `curl` پاسخ ۲۰۰/CSV می‌دهد
   ⇒ این ماژول از `httpsGetText()` استفاده می‌کند.
2. **جداکنندهٔ OR باید `%2B` باشد:** کلید SDMX از `+` برای OR استفاده می‌کند،
   ولی `+` داخل URL به **فاصله** تفسیر می‌شود و 404 می‌دهد.

## پارامترها

| آرگومان | اثر |
|---|---|
| `--source=<BIS\|IMF\|WORLD_BANK\|OECD\|EUROSTAT\|FRED>` | فقط یک منبع |
| `--force` | نادیده‌گرفتن «دادهٔ جدید نیست» و بازدانلود |
| `--allow-new-series` | اجازهٔ درج سری‌های ناشناخته (پیش‌فرض: فقط سری‌های موجود) |
| `--only-light` | فقط مرحلهٔ پروب سبک |
| `--dry-run` | نمایش برنامه بدون تغییر دیتابیس |
