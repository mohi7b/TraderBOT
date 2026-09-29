# Macro — Calendar

ماشین تقویم انتشار داده‌های کلان برای ۶ منبع (FRED, OECD, EUROSTAT, IMF, BIS, WORLD_BANK).

فلسفه: اینجا «چه زمانی» را تعریف می‌کنیم؛ اجرای دانلود/نرمال/ADBC در `../update` انجام می‌شود.

## فایل‌ها

| فایل | نقش |
|------|-----|
| `cadence.cjs` | ساخت مدل cadence (از `../config.cjs` = SOURCES.*.cadence) + قانون poll window/anchor |
| `is-due.cjs` | تصمیم «آیا منبع الان باید poll شود؟» — ورودی: source + lastCheckMs |
| `release-rule.cjs` | (محل) خواندن تقویم «صریح» (مثل BIS_REL_CAL / FRED releases/dates) |
| `data/cadence.json` | نسخهٔ داده‌ای override قانون‌ها (دستی) |
| `index.cjs` | export عمومی |
| `tests/calendar.test.cjs` | تست بدون DB |

## روش استفاده

```js
const { isDue } = require("./calendar/is-due.cjs");

if (isDue("FRED", { lastCheckMs: last })) {
  // run update pipeline
}
```

## مدل قانون

Rough anchor rules:
- daily   → poll هر روز (window 6h)
- weekly  → poll دوشنبه (window 1d)
- monthly → poll ابتدای ماه (1-2 ام) (window 2d)

مقادیر `cadence` از config.cjs و override‌ها از `data/cadence.json` تا نشود hard-code.
