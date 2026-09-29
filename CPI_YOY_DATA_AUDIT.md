# CPI YoY Data Audit — 17-Country Matrix (Headline vs Core)

> **File:** `/CPI_YOY_DATA_AUDIT.md`
> **Generated:** 2026-09-19 · **Target chart:** `CPI YoY — Headline vs Core` (`frontend/components/domain/macro/CpiYoyChart.tsx`)
> **Source of truth:** `collector/macro/core_db/core.db` (read-only, live rows) + `backend/catalog/registry.cjs` + `core_db/build/build_core_db.cjs`
> **Scope:** 17 Tier-1/2 countries = `core_db/build/filters/countries.json` (verified identical to the requested list)
>
> **🔄 UPDATE (پس از P0):** ریشهٔ باگِ «۸ کشور rate / ۹ کشور index» **در مبدأ رفع شد**:
> `BIS::CPI` به دو سری جدا شکسته شد — `BIS::CPI_IDX` (کد ۶۲۸ = شاخص) و
> `BIS::CPI_YOY` (کد ۷۷۱ = نرخ سالانه) — و دیتابیس‌ها بازسازی شدند.
> جزئیات و اعداد: **`MACRO_DATA_INVENTORY.md` بند ۹**. وضعیت فعلی:
> `tools/cpi_audit.cjs --all` → `MATH-RISK entries: 0` و `kind mismatch: 0`.
> بنابراین جدول‌های «ناسازگاری» این سند **تاریخچه‌ای** هستند و دیگر برقرار نیستند
> (لایهٔ `guard:"cpi"` فرانت‌اند به‌عنوان شبکهٔ ایمنی باقی می‌ماند).

---

## 0) حکم نهایی (Executive Verdict)

| پرسش | پاسخ |
|---|---|
| آیا ماتریس داده برای چارت **«CPI YoY — Headline vs Core»** ۱۰۰٪ کامل است؟ | ❌ **خیر** |
| Headline CPI ماهانه برای چند کشور از ۱۷ کشور موجود است؟ | ✅ **۱۷ از ۱۷** — اما فقط از یک منبع (`BIS::CPI.M`) |
| Core CPI برای چند کشور موجود است؟ | ❌ **۱ از ۱۷** (فقط `USA`) |
| آیا هر دو سری «نرخ سالانه / rate» ذخیره شده‌اند؟ | ❌ **خیر** — ۹ کشور index، ۸ کشور rate (مخلوط در همان یک کد منبع) |
| نتیجه | چارت فعلی برای **۸ کشور از ۱۷ عدد اشتباه** نشان می‌دهد، و مقایسهٔ «Core vs Headline» برای **۱۶ کشور** بی‌معناست. |

---

## 1) روش بررسی (قابل بازتولید)

```bash
python3 /tmp/report_cpi.py    # ردیف‌های خام سری‌ها + تعداد نقاط جاری (valid_to IS NULL)
node    /tmp/kinds.cjs        # kind اعلامی بک‌اند (منبع حقیقت = registry.seriesProfile)
python3 /tmp/final_audit.py   # verdict نرخ/شاخص از خود اعداد (last-12 median + drift)
python3 /tmp/coverage.py      # پوشش EUROSTAT + همهٔ سری‌های rate
curl -s 'http://127.0.0.1:4001/api/inflation?mode=countries' -o /tmp/infl_c.json
python3 /tmp/payload_check.py # اعداد payload واقعی API (نه DB خام)
```

**قاعدهٔ قطعی برای «rate یا index»** (بدون حدس): از آخرین ۱۲ مقدار جاری، `median` گرفته می‌شود؛ اگر `median > 60` ⇒ **index/level**، وگرنه ⇒ **rate**. به‌علاوه `drift = median(last12)/median(first12)` گزارش می‌شود (سری index همیشه drift ≫ ۱ دارد).

---

## 2) جدول اصلی — وضعیت ۱۷ کشور برای «Headline vs Core»

ستون «نقاط» دو عدد دارد: `DB` = نقاط جاری در `core.db`، `payload` = نقاط داخل `history.full` پس از سقف `HISTORY_YEARS = 30` در `picker_lib.cjs`.

| # | ISO3 | Headline CPI | منبع ماهانه + نقاط (DB / payload) | Core CPI | منبع + نقاط | rate یا نیاز به تبدیل؟ | گپ / ناهنجاری |
|---|------|--------------|-----------------------------------|----------|-------------|------------------------|----------------|
| 1 | **USA** | ✅ | `BIS::CPI.M` 1362 / 357 · `FRED::CPIAUCSL.M` 954 / 357 | ✅ | `FRED::CPILFESL.M` 834 / 357 | BIS=**rate** · FRED=index · Core=**index** → تبدیل لازم | تنها کشور با Core. خام BIS ≈3.36 (rate) ولی بک‌اند `yoy=24.397` ❌ |
| 2 | **CHN** | ✅ | `BIS::CPI.M` 379 / 358 | ❌ | — | **index** → تبدیل لازم | صفر Core. `OECD::CPI_YOY.M` فقط ۱ نقطه |
| 3 | **JPN** | ✅ | `BIS::CPI.M` 960 / 358 | ❌ | — | **index** → تبدیل لازم | `OECD::CPI_YOY.M` = ۲۲ نقطه ولی **همه صفر** |
| 4 | **DEU** | ✅ | `BIS::CPI.M` 931 / 358 · `EUROSTAT::HICP_ANR.M` 348 / 348 | ❌ | — | **rate** (هر دو) ✅ تبدیل لازم نیست | تنها کشور با ۲ منبع rate ماهانه. HICP آخرین `2025-12` (۸ ماه کهنه). بک‌اند `yoy=38.884` ❌ (خام 2.78) |
| 5 | **GBR** | ✅ | `BIS::CPI.M` 1339 / 358 · `EUROSTAT::HICP_ANR.M` 287 | ❌ | — | **index** → تبدیل لازم | HICP این کشور بی‌فایده: آخرین نقطه `2020-11`. `OECD::CPI_YOY` ۱ نقطه |
| 6 | **FRA** | ✅ | `BIS::CPI.M` 907 / 358 · `EUROSTAT::HICP_ANR.M` 348 / 348 | ❌ | — | BIS=**index** · HICP=**rate** ✅ | `OECD::CPI_YOY.M` ۱۱۳ نقطه ولی آخرین `2025-07` (کهنه) |
| 7 | **ITA** | ✅ | `BIS::CPI.M` 952 / 355 · `EUROSTAT::HICP_ANR.M` 348 / 348 | ❌ | — | BIS=**index** · HICP=**rate** ✅ | BIS آخرین `2026-04` → **۳ ماه عقب‌تر** از ۱۶ کشور دیگر (2026-07) |
| 8 | **CAN** | ✅ | `BIS::CPI.M` 1351 / 358 | ❌ | — | **rate** ✅ | بک‌اند `yoy=75.539` ❌ (خام 3.03) |
| 9 | **AUS** | ✅ | `BIS::CPI.M` 1251 / 357 | ❌ | — | **index** → تبدیل لازم | `OECD::CPI_YOY`: سالانه ۱۲ نقطه، ماهانه ۱ نقطه |
| 10 | **KOR** | ✅ | `BIS::CPI.M` 739 / 358 | ❌ | — | **index** → تبدیل لازم | `OECD::CPI_YOY`: ماهانه/فصلی هر کدام ۱ نقطه |
| 11 | **IND** | ✅ | `BIS::CPI.M` 879 / 357 | ❌ | — | **rate** ✅ | بک‌اند `yoy=89.992` ❌ (خام 4.38) |
| 12 | **TUR** | ✅ | `BIS::CPI.M` 751 / 358 | ❌ | — | **rate** ✅ | ابرتورم تاریخی → drift بی‌معنا. بک‌اند `yoy=-5.275` ❌ (خام 31.75) |
| 13 | **MEX** | ✅ | `BIS::CPI.M` 691 / 358 | ❌ | — | **rate** ✅ | بک‌اند `yoy=-11.24` ❌ (خام 3.12) |
| 14 | **BRA** | ✅ | `BIS::CPI.M` 559 / 358 | ❌ | — | **rate** ✅ | ابرتورم ۸۰/۹۰ (تا ۱۰۰٪+) در ابتدای سری. بک‌اند `yoy=-14.97` ❌ (خام 4.44) |
| 15 | **RUS** | ✅ | `BIS::CPI.M` 307 / 307 | ❌ | — | **index** → تبدیل لازم | کوتاه‌ترین سری ماهانه (از 2001-01) |
| 16 | **SAU** | ✅ | `BIS::CPI.M` 439 / 358 | ❌ | — | **index** → تبدیل لازم | صفر Core، صفر OECD (فقط BIS + IMF + WB سالانه) |
| 17 | **ZAF** | ✅ | `BIS::CPI.M` 1254 / 357 | ❌ | — | **rate** ✅ | `OECD::CPI_YOY.M` ۱۵۳ نقطه ولی آخرین `2025-01` (کهنه). بک‌اند `yoy=65.021` ❌ |

### جمع‌بندی جدول
- **Headline ماهانه**: ۱۷/۱۷ از `BIS::CPI.M` (تنها گزینهٔ ماهانهٔ مشترک).
- **Core**: ۱/۱۷ → مقایسهٔ «Headline vs Core» فقط برای **USA** معنا دارد.
- **rate-index**: **۸ کشور rate** (USA, DEU, CAN, IND, TUR, MEX, BRA, ZAF) · **۹ کشور index** (CHN, JPN, GBR, FRA, ITA, AUS, KOR, RUS, SAU) — همه در یک کد واحد `BIS::CPI`.
- منبع rate ماهانهٔ جایگزین (غیر BIS) فقط برای ۴ کشور: `DEU, FRA, ITA` (HICP_ANR تا 2025-12) و `GBR` (کهنه 2020-11).

---

## 3) شاهد مستقل #۱ — verdict از اعداد خام DB (`BIS::CPI.M`)

`drift = median(last12) / median(first12)` — سری نرخ حول یک میانگین نوسان می‌کند (drift ≈ ۱)، سری شاخص صعود بلندمدت دارد (drift ≫ ۱).

| ISO3 | n (DB) | first | last | last12 median | drift | **verdict** | registry اعلام می‌کند |
|---|---|---|---|---|---|---|---|
| USA | 1362 | 1913-01 | 2026-07 | 2.964 | 0.656 | **rate** | index ❌ |
| CHN | 379 | 1995-01 | 2026-07 | 133.402 | 1.807 | index | index ✅ |
| JPN | 960 | 1946-08 | 2026-07 | 119.056 | 36.580 | index | index ✅ |
| DEU | 931 | 1949-01 | 2026-07 | 2.332 | 0.106 | **rate** | index ❌ |
| GBR | 1339 | 1915-01 | 2026-07 | 156.653 | 96.374 | index | index ✅ |
| FRA | 907 | 1951-01 | 2026-07 | 128.470 | 18.579 | index | index ✅ |
| ITA | 952 | 1947-01 | 2026-04 | 132.384 | 44.002 | index | index ✅ |
| CAN | 1351 | 1914-01 | 2026-07 | 2.358 | 0.458 | **rate** | index ❌ |
| AUS | 1251 | 1922-04 | 2026-06 | 151.383 | 52.888 | index | index ✅ |
| KOR | 739 | 1965-01 | 2026-07 | 136.866 | 45.155 | index | index ✅ |
| IND | 879 | 1953-04 | 2026-06 | 2.370 | 0.883 | **rate** | index ❌ |
| TUR | 751 | 1964-01 | 2026-07 | 31.932 | 452867.389 | **rate** | index ❌ |
| MEX | 691 | 1969-01 | 2026-07 | 3.776 | 235.884 | **rate** | index ❌ |
| BRA | 559 | 1980-01 | 2026-07 | 4.452 | 12779551000.681 | **rate** | index ❌ |
| RUS | 307 | 2001-01 | 2026-07 | 293.859 | 7.765 | index | index ✅ |
| SAU | 439 | 1990-01 | 2026-07 | 137.855 | 1.958 | index | index ✅ |
| ZAF | 1254 | 1922-01 | 2026-06 | 3.505 | 4.231 | **rate** | index ❌ |

## 4) شاهد مستقل #۲ — `latest.yoy` تولیدشده توسط خود بک‌اند

خروجی زندهٔ `GET /api/inflation?mode=countries` (همهٔ ۱۷ سری BIS با `series_kind = "index"`):

| ISO3 | مقدار خام آخرین نقطه | `latest.yoy` بک‌اند | ارزیابی |
|---|---|---|---|
| USA | 3.365 | **24.397** | ❌ بی‌معنا |
| CAN | 3.032 | **75.539** | ❌ بی‌معنا |
| DEU | 2.782 | **38.884** | ❌ بی‌معنا |
| IND | 4.380 | **89.992** | ❌ بی‌معنا |
| TUR | 31.754 | **−5.275** | ❌ بی‌معنا |
| MEX | 3.118 | **−11.240** | ❌ بی‌معنا |
| BRA | 4.443 | **−14.970** | ❌ بی‌معنا |
| ZAF | 4.981 | **65.021** | ❌ بی‌معنا |
| CHN | 133.457 | 0.500 | ✅ معقول |
| FRA | 131.120 | 2.118 | ✅ معقول |
| GBR | 159.784 | 2.806 | ✅ معقول |
| ITA | 135.430 | 2.731 | ✅ معقول |
| JPN | 120.413 | 1.898 | ✅ معقول |
| KOR | 138.667 | 2.789 | ✅ معقول |
| SAU | 139.392 | 1.831 | ✅ معقول |
| AUS | 153.331 | 3.942 | ✅ معقول |
| RUS | 301.658 | 5.971 | ✅ معقول |

**نتیجهٔ دو شاهد:** دقیقاً همان **۸ کشوری** که verdict ما `rate` بود، `latest.yoy` بی‌معنا دارند. ریشه: `registry.cjs` خط ۱۹۲ → `"BIS::CPI": { kind: "index" }` برای **همهٔ** ۱۷ کشور هاردکد شده، در حالی که ۸ کشور در `macro.db` نرخ (YoY%) ذخیره کرده‌اند.

---

## 5) گپ‌های ساختاری (مستقل از دادهٔ خام)

| # | یافته | شاهد | اثر روی چارت |
|---|---|---|---|
| G1 | **Core CPI فقط برای USA** | `build_core_db.cjs:129-136` → `CORE_CPI: { FRED: ["CPILFESL"], بقیه: [] }` و `FRED::CPILFESL` فقط ۱ کشور (USA) | «Headline vs Core» برای ۱۶ کشور فقط یک خط (Headline) نشان می‌دهد |
| G2 | **در `mode=countries` سری Core کاملاً حذف می‌شود** | payload: `CPI: 17, GDP_DEFL: 12` و `CORE_CPI: []` | اگر پروکسی را به این mode تغییر دهیم، **Core حتی برای USA هم از بین می‌رود** |
| G3 | **در payload پیش‌فرض فقط ۶ کشور CPI دارند** | `default → {CPI: 9, CORE_CPI: 1, PPI: 1, GDP_DEFL: 1}` و CPI فقط AUS,BRA,CAN,DEU,KOR,USA | دراپ‌داون فعلی ۶ کشور؛ ۱۱ کشور دیگر غایب |
| G4 | **`history.full` کل تاریخ نیست؛ سقف ۳۰ سال** | `picker_lib.cjs: HISTORY_YEARS = 30` → BIS USA DB=1362 ولی payload=357 | «۵ سال/۱۰ سال» از payload قابل استخراج است، «Max/کل تاریخ» نه (برای USA به 1996-10، برای RUS به 2001-01 محدود می‌شود) |
| G5 | **`display` = ۳ سال** | `DISPLAY_POINTS = { M: 36, Q: 12, A: 3 }` | default رسم همان ۳۶ نقطه است |
| G6 | **IMF سالانه شامل پیش‌بینی تا ۲۰۳۱** | `IMF::PCPIPCH` هر ۱۷ کشور: `last = 2031` | محور X تا ۲۰۳۱ کشیده می‌شود؛ نیاز به تفکیک/کلیپ ناحیهٔ forecast |
| G7 | **`OWID::CPI` با unit اشتباه** | `seriesProfile('OWID','CPI','CPI')` → `kind: "level"`, `display_unit: "YoY %"` ولی مقدار ≈148 | برچسب واحد روی چارت **درست نیست** |
| G8 | **`OECD::CPI_YOY` عملاً خالی/صفر است** | USA M=6، CHN M=1، JPN M=22 (همه 0.0)، DEU M=11 (همه 0.0)، KOR M=1، SAU M=1 | منبع rate استاندارد OECD در دسترس **نیست**؛ باید کنار گذاشته شود |
| G9 | **کهنگی‌های نامتقارن** | ITA (2026-04)، AUS/IND/ZAF (2026-06)، بقیه (2026-07)؛ EUROSTAT HICP تا 2025-12؛ GBR HICP تا 2020-11 | آخرین نقطهٔ «as-of» بین کشورها هم‌تراز نیست |

---

## 6) منابع پشتیبان «از قبل rate» (برای Cross-check و Fallback)

### 6.1 سالانه — **هر ۱۷ کشور** ✅
`WB::FP.CPI.TOTL.ZG` (kind=rate, YoY %) — تعداد نقاط DB: USA 65 · CHN 39 · JPN 66 · DEU 66 · GBR 66 · FRA 66 · ITA 66 · CAN 66 · AUS 66 · KOR 66 · IND 66 · TUR 66 · MEX 66 · BRA 45 · RUS 33 · SAU 62 · ZAF 66 — همه تا `2025`.

### 6.2 سالانه با پیش‌بینی تا ۲۰۳۱ — **هر ۱۷ کشور**
`IMF::PCPIPCH` (rate) و `IMF::PCPIEPCH` (rate) — ۴۱ تا ۵۲ نقطه در هر کشور، `last = 2031⚠️`.

### 6.3 ماهانه rate (غیر BIS) — فقط ۴ کشور
| ISO3 | منبع | نقاط | آخرین نقطه | یادداشت |
|---|---|---|---|---|
| DEU | `EUROSTAT::HICP_ANR.M` | 348 | 2025-12 | HICP (نه CPI ملی) |
| FRA | `EUROSTAT::HICP_ANR.M` | 348 | 2025-12 | HICP |
| ITA | `EUROSTAT::HICP_ANR.M` | 348 | 2025-12 | HICP |
| GBR | `EUROSTAT::HICP_ANR.M` | 287 | **2020-11** | ⚠️ کهنه — غیرقابل استفاده |

### 6.4 فصلی rate (لکه‌دار، فقط برای Cross-check)
`OECD::CPI_YOY.Q`: FRA 96 · ITA 95 · TUR 98 · ZAF 92 · MEX 82 — بقیهٔ کشورها ۱–۳ نقطه (بی‌استفاده).

---

## 7) اثر روی چارت فعلی + گزینه‌های پیشنهادی

### 7.1 وضعیت فعلی صفحه (`/dashboard/macro` با payload پیش‌فرض)
`pickSeries(series, "CPI", country)` اولین سری با `indicator.code === "CPI"` را برمی‌دارد و سپس `computeYoyRows` روی آن **دوباره** YoY می‌سازد:

| کشور دراپ‌داون | سری‌ای که انتخاب می‌شود | درست/غلط |
|---|---|---|
| AUS | `IMF::PCPIPCH.A` (rate، آخرین 2031) | ❌ غلط + محور تا ۲۰۳۱ |
| BRA | `BIS::CPI.M` (rate) | ❌ غلط |
| CAN | `BIS::CPI.M` (rate) | ❌ غلط |
| DEU | `BIS::CPI.M` (rate) | ❌ غلط |
| KOR | `OECD::CPI_Q` (index) | ⚠️ نسباً درست ولی فصلی و کهنه |
| USA | `FRED::CPIAUCSL.M` (index) | ✅ درست |

⇒ **۴ کشور از ۶ کشور قابل‌انتخاب، عدد اشتباه می‌دهند** و Core فقط برای USA وجود دارد.

### 7.2 گزینه‌ها (قبل از تغییر پروکسی)

| گزینه | کار | هزینه | نتیجه |
|---|---|---|---|
| **A. اصلاح مبدأ (توصیهٔ من)** | در `registry.cjs` مقدار `BIS::CPI` از هاردکد `index` به **per-country detected** تغییر کند (۸ کشور `rate`، ۹ کشور `index`) — یا `series_kind` بر اساس دامنهٔ داده در `macro.db` استنتاج شود | کم (یک تابع + تست) | `latest.yoy` برای هر ۱۷ کشور درست می‌شود؛ فرانت فقط باید `series_kind` را باور کند |
| **B. اصلاح مصرف‌کننده (فرانت)** | `series-utils.ts` با قاعدهٔ «اگر `kind === 'rate'` ⇒ مقدار خام همان YoY است، تبدیل نکن» + انتخاب بهترین منبع per country | متوسط | چارت درست می‌شود ولی زیرساخت بک‌اند همچنان اشتباه است |
| **C. مسیر Core** | افزودن Core به `INDICATOR_MAP` (نیازمند ingest از FRED/OECD/BLS) یا پذیرش واقعیت: «Core فقط USA» و طراحی چارت به‌صورت **اختیاری/شرطی** | بالا (ingest) | بدون آن، «Headline vs Core» برای ۱۷ کشور ناممکن است |
| **D. مسیر Country mode** | افزودن یک mode/endpoint جدید مثل `?mode=canon&canon=CPI&limit=60` تا هم ۱۷ کشور و هم Core و هم PPI در یک payload بیایند (بدون حذف Core) | متوسط (بک‌اند) | پیش‌نیاز چارت‌های مقطعی و دراپ‌داون کامل ۱۷ کشور |

**ترتیب پیشنهادی:** `A` (رفع باگ rate/index) → `B` (لایهٔ انتخاب سری در فرانت) → `D` (payload کامل ۱۷ کشور) → `C` (Core = یک برنامهٔ ingest جداگانه).

---

## 8) پیوست — اعداد خام `BIS::CPI.M` (۱۷ کشور)

| ISO3 | series_id | n (DB, جاری) | first | last | last12 median | verdict |
|---|---|---|---|---|---|---|
| USA | `BIS.US.CPI.M` | 1362 | 1913-01 | 2026-07 | 2.964 | rate |
| CHN | `BIS.CN.CPI.M` | 379 | 1995-01 | 2026-07 | 133.402 | index |
| JPN | `BIS.JP.CPI.M` | 960 | 1946-08 | 2026-07 | 119.056 | index |
| DEU | `BIS.DE.CPI.M` | 931 | 1949-01 | 2026-07 | 2.332 | rate |
| GBR | `BIS.GB.CPI.M` | 1339 | 1915-01 | 2026-07 | 156.653 | index |
| FRA | `BIS.FR.CPI.M` | 907 | 1951-01 | 2026-07 | 128.470 | index |
| ITA | `BIS.IT.CPI.M` | 952 | 1947-01 | 2026-04 | 132.384 | index |
| CAN | `BIS.CA.CPI.M` | 1351 | 1914-01 | 2026-07 | 2.358 | rate |
| AUS | `BIS.AU.CPI.M` | 1251 | 1922-04 | 2026-06 | 151.383 | index |
| KOR | `BIS.KR.CPI.M` | 739 | 1965-01 | 2026-07 | 136.866 | index |
| IND | `BIS.IN.CPI.M` | 879 | 1953-04 | 2026-06 | 2.370 | rate |
| TUR | `BIS.TR.CPI.M` | 751 | 1964-01 | 2026-07 | 31.932 | rate |
| MEX | `BIS.MX.CPI.M` | 691 | 1969-01 | 2026-07 | 3.776 | rate |
| BRA | `BIS.BR.CPI.M` | 559 | 1980-01 | 2026-07 | 4.452 | rate |
| RUS | `BIS.RU.CPI.M` | 307 | 2001-01 | 2026-07 | 293.859 | index |
| SAU | `BIS.SA.CPI.M` | 439 | 1990-01 | 2026-07 | 137.855 | index |
| ZAF | `BIS.ZA.CPI.M` | 1254 | 1922-01 | 2026-06 | 3.505 | rate |

> نکته: `series.country` برای BIS با کد ISO2 ذخیره می‌شود (`US`, `CN`, …) و توسط `registry.toISO3()` به ISO3 ترجمه می‌شود؛ `series_id` هم ISO2 دارد (`BIS.US.CPI.M`) ولی در payload بک‌اند به شکل `BIS_USA_CPI_M` نرمال‌سازی می‌شود.

---

*End of audit — همهٔ اعداد بالا از ردیف‌های زندهٔ `core.db` و پاسخ زندهٔ API پورت ۴۰۰۱ استخراج شده‌اند؛ هیچ مقداری تخمینی نیست.*

