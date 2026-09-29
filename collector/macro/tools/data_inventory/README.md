# `data_inventory/` — ابزارهای ممیزی موجودی دادهٔ ماکرو

> مرجع یافته‌ها: **`/MACRO_DATA_INVENTORY.md`** (ریشهٔ پروژه)
> همهٔ ابزارها فقط **خواندنی** هستند (دیتابیس با `readonly: true` باز می‌شود).

## ابزارها

| ابزار | زبان | چه می‌کند |
|---|---|---|
| **`source_report.cjs`** | Node | **گزارش جامع منابع**: کل `macro.db` را اسکن می‌کند و برای هر ۷ منبع (BIS/IMF/WB/OECD/FRED/EUROSTAT/OWID) فهرست کامل کدهای شاخص، خانواده‌بندی قیمتی، پوشش ۱۷ کشور و شواهد «زیرشاخص/وزن سبد وجود ندارد» را در `MACRO_SOURCE_INVENTORY.md` + `.json` می‌نویسد |
| **`funnel.cjs`** | Node | قیف فیلتر «۴۰۵k سری خام → ۱,۴۴۲ سری curated» را با **همان کد** `core_db/build/build_core_db.cjs` محاسبه می‌کند: per-dataset، مراحل کشور/اندیکاتور/فرکانس، و فهرست canonicalهایی که در هر منبع کد ندارند |
| **`raw_indicators.py`** | Python 3 | کل کدهای اندیکاتور **دیتابیس خام** را per-dataset استخراج می‌کند (تعداد سری، تعداد کشور، پوشش ۱۷ کشور هدف، فرکانس‌ها) |
| **`bis_unit_collision.py`** | Python 3 | ریشهٔ باگ «مخلوط نرخ/شاخص» در `BIS::CPI`: ترکیب‌های `(FREQ, UNIT_MEASURE)` در فایل خام `WS_LONG_CPI` را برای هر ۱۷ کشور نشان می‌دهد (۶۲۸ = Index و ۷۷۱ = YoY% که در loader روی هم می‌افتند) |

## اجرا

```bash
cd collector/macro

# ۰) گزارش جامع منابع (MD + JSON در ریشهٔ پروژه)
node tools/data_inventory/source_report.cjs

# ۱) قیف فیلتر (بدون پیش‌نیاز پایتون)
node tools/data_inventory/funnel.cjs

# ۲) فهرست کامل اندیکاتورهای دیتابیس خام (~۹۰ کد)
python3 tools/data_inventory/raw_indicators.py

# ۳) اثبات تصادم کلید BIS
python3 tools/data_inventory/bis_unit_collision.py
```

## نکات
- `funnel.cjs` مسیرها را از `__dirname` می‌سازد ⇒ از هر پوشه‌ای قابل اجراست و `better-sqlite3` را از `node_modules` ریشهٔ پروژه پیدا می‌کند.
- دو اسکریپت پایتون مسیر `collector/macro/db/macro.db` و `collector/macro/offline/**` را **مطلق** می‌خوانند (همان میزبان فعلی).
- `raw_indicators.py` روی WB هر ۱,۴۹۸ کد را خلاصه می‌کند و برای بقیهٔ منابع **همهٔ** کدها را کامل چاپ می‌کند.
