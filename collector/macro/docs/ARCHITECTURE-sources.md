# Macro Data Architecture — Source Priority & Collector Standardization

> **وضعیت:** طراحی (Design). هیچ منبع جدید و هیچ تغییر کد در این مرحله انجام نشده.
> **هدف:** استانداردسازی، اولویت‌بندی منابع، و ساختار گروه‌های ماکرو برای بلندمدت.

---

## ⚖️ اصل بنیادی (Non-negotiable Principle)

> **جداسازی کامل منابع (Source Isolation).**
> برای هر منبع داده (`FRED, OECD, Eurostat, IMF, BIS, World Bank, OWID` و …)
> داده‌ها **باید در جدول‌ها/ردیف‌های جداگانه ذخیره شوند**. هیچ داده‌ای نباید با
> دادهٔ منبع دیگر **میکس یا overwrite** شود. `collector` بر اساس **اولویت منبع**
> بهترین دادهٔ موجود را انتخاب کرده و **فقط همان** را به فرانت‌اند ارسال می‌کند.

**چرا:** بازتولیدپذیری، ردیابی، و امکان مقایسه/fallback. اگر منابع ادغام شوند،
دیگر نمی‌فهمیم یک عدد از کجا آمده یا کدام به‌روزتر است.

**چگونه در معماری فعلی محقق می‌شود:**
- `series_id = <dataset>.<country>.<indicator>.<frequency>` → نام منبع در خودِ کلید
  است (`IMF.IRN.LUR.A`، `OWID.USA.CPI.A`, `BIS.US.CPI.M`). پس منابع هرگز
  با هم تصادم/overwrite ندارند.
- `sources` جدول جداگانه دارد؛ هر dataset یک ردیف.
- انتخاب «بهترین منبع» فقط در **لایهٔ خواندن (picker/query)** انجام می‌شود، نه در
  ذخیره‌سازی — که همان نقطهٔ درست است.
- (فاز P0) جدول `source_priority` همین انتخاب را صریح و قابل‌تنظیم می‌کند.

---

## 🔑 اصل دوم (Non-negotiable): کلید مشترک کشور = ISO3

> **همهٔ منابع باید از کلید کشور مشترک `ISO3` استفاده کنند.** هیچ منبعی نباید
> کلید متفاوت داشته باشد. اگر منبعی نام یا کد کشور متفاوت داشت، **در مرحلهٔ
> importer باید به ISO3 تبدیل شود** — نه در لایهٔ نمایش، نه در core.

**چرا:** یک کلید واحد در `series.country` یعنی join/فیلتر/گروه‌بندی بین منابع
بی‌دردسر است و picker می‌تواند منابع را مقایسه کند.

**وضعیت فعلی کد (Audit):**

| منبع | کد خام در `macro.db` | تبدیل به ISO3؟ | وضعیت |
|---|---|---|---|
| IMF | ISO3 | identity | ✅ |
| WB | ISO3 | identity | ✅ |
| OECD | ISO3 | identity | ✅ |
| FRED | ISO3 | identity | ✅ |
| **EUROSTAT** |۲حرفی (`DE`,`FR`) | `countryToISO3()` در `loadTidyFile` | ✅ |
| **BIS** | **ISO2** (`US`,`DE`) | **❌ ندار** — فقط در `core_db` با `COUNTRY_ALIAS` | ❌ **نقض** |

**→ اقدام لازم (فاز جدا):** `loadBisFile` باید در importer از نگاشت ISO2→ISO3
استفاده کند تا `series.country` برای BIS هم ISO3 شود (`BIS.USA.CPI.M` نه `BIS.US.CPI.M`).
این تغییر **core_db را لمس می‌کند** (چون `COUNTRY_ALIAS.BIS` دیگر لازم نخواهد بود)
و باید با احتیاط و همراه با rebuild کامل انجام شود.

---

## 🥇 اصل سوم (Non-negotiable): سهم منصفانهٔ هر منبع در انتخاب

> **در هر forward/pass انتخاب سری‌ها، هر منبع داده باید دقیقاً یک سهم
> (یک سری) بگیرد. هیچ منبعی حق ندارد سری دوم بگیرد تا زمانی که همهٔ
> منابع سهم اول خود را گرفته باشند.**

پیامدها:
- منابع اول صف بیش‌ازحد سهم نمی‌گیرند.
- منابع آخر صف (مثل `OWID`) حذف نمی‌شوند.
- رفتار انتخاب قابل‌پیش‌بینی است.
- اولویت‌بندی منابع معنا می‌یابد.
- collector می‌تواند کیفیت/تازگی منابع را مقایسه کند.

**قاعدهٔ `MAX_SERIES`:**
```text
MAX_SERIES >= count(eligible_sources)          (اجباری)
```
اگر تعداد منابع بیشتر از `MAX_SERIES` باشد، `MAX_SERIES` باید **حداقل برابر
تعداد منابع** باشد تا همهٔ منابع سهم اول خود را بگیرند.
پس از تکمیل سهم اول همه، اگر ظرفیت باقی ماند، **دور دوم** آغاز می‌شود و
منابع بر اساس کیفیت، تازگی و پوشش انتخاب می‌شوند.

**پیاده‌سازی (picker_lib):**
- انتخاب مرحله‌ای dataset-fair: در هر pass به ترتیب `DATASETS` (اولویت منبع)،
  هر صف دقیقاً **یک** سری می‌دهد.
- `MAX_SERIES` به‌صورت داینامیک `= max(configured, eligibleSources)` می‌شود.
- دور دوم+ طبق ترتیب اولویت و تازگی (bucket داخلی newest-first) پر می‌شود.

---

## 🚫 اصل چهارم (Non-negotiable): بک‌اند ماکرو، API-only

> **بک‌اند ماکرو هیچ UI نمایشی نباید داشته باشد.** تمام مسیرهای سرو HTML،
> فایل‌های استاتیک یا داشبوردهای داخلی باید حذف یا غیرفعال شوند.
> بک‌اند فقط **API** ارائه می‌دهد و تمام نمایش توسط **فرانت‌اند مستقل**
> (`frontend/` روی پورت ۳۰۰۰) انجام می‌شود.

**به‌جای UI داخلی، سه ابزار استاندارد:**
| مسیر | کاربرد | مصرف‌کننده |
|---|---|---|
| `GET /health` | بررسی وضعیت سرویس (uptime/version/DB) | health-check / ناظر |
| `GET /debug/macro` | وضعیت منابع، سری‌ها، کش، گروه‌ها، متادیتا | فقط توسعه‌دهنده |
| `GET /api/docs` | API Explorer ساده (لیست routeها) | فقط توسعه‌دهنده |

**چرا:** جلوگیری از تداخل UIها، خوانایی بک‌اند، جداسازی کامل فرانت/بک،
و استانداردسازی مقیاس‌پذیر.

**پیامدهای کد:**
- `backend/http.cjs` دیگر نباید `dashboard/test/**` را سرو کند
  (`serveStatic` و `DASH_TEST` حذف/بی‌اثر).
- پوشهٔ `collector/macro/dashboard/` (UI قدیمی) باید حذف یا به `_legacy/` منتقل شود.
- `backend/test.html` (UI قدیمی) حذف شود.
- فرانت‌اند رسمی = `frontend/` (Next.js) روی پورت ۳۰۰۰/۳۰۰۱.

---

## 0) معماری فعلی (As-Is) — تأییدشده از کد

```
offline/{fred,oecd,eurostat,imf,bis,worldbank}/*.csv   ← دادهٔ خام هر منبع
        │
        ▼  db_build/main_offline_loader.cjs (+ normalize.cjs)
   db/macro.db        ← MAIN DB (منبع حقیقت)؛  جداول: series, data, sources
        │                (+ inflation_targets — جدید chart02)
        ▼  core_db/build/build_core_db.cjs (+ filters/*.json + INDICATOR_MAP + COUNTRY_ALIAS)
   core_db/core.db    ← subset سبک برای API؛  جداول: series, data, sources
        │
        ▼  backend/ (picker → modules/{inflation,growth,labor} → http.cjs)
   /api/{inflation,growth,labor}   ← فقط ۳ گروه (۶ گروه هدفِ تسک)
```

**۶ منبع فعلی** (`config/config.cjs`): `FRED, OECD, EUROSTAT, IMF, BIS, WORLD_BANK`

**۱۳ شاخص کانونیکال** (`filters/indicators.json`):
`GDP, CPI, CORE_CPI, PPI, UNEMP, EMP, M1, M2, PMI, CLI, IND_PROD, RETAIL_SALES` (+1)

**شکاف‌های کلیدی:**
1. نگاشت «شاخص کانونیکال → گروه ماکرو» وجود ندارد (گروه‌ها در `http.cjs` hard-code).
2. ۳ گروه از ۶ گروه ساخته نشده: `Trade, Monetary, Fiscal`.
3. هیچ‌جا «اولویت منبع» (source priority) تعریف نشده — picker صرفاً round-robin می‌کند.

---

## 1) مرحله ۱ — ساختار اولویت‌بندی (Design Only)

### 1.1 گروه‌های شش‌گانه ماکرو

| گروه | key | canonical indicators |
|---|---|---|
| Inflation | `1A_inflation` | `CPI, CORE_CPI, PPI, GDP_DEFL` |
| Growth | `1B_growth` | `GDP, IND_PROD, RETAIL_SALES, CLI, PMI` |
| Labor | `1C_labor` | `UNEMP, EMP, LFS_PART, WAGE` |
| **Trade** | `1D_trade` | `EXPORTS, IMPORTS, TRADE_BAL, CURRENT_ACCT` |
| **Monetary** | `1E_monetary` | `M1, M2, POLICY_RATE, CREDIT, YIELD_10Y` |
| **Fiscal** | `1F_fiscal` | `GOV_DEBT, GOV_DEFICIT, GOV_REVENUE, GOV_SPEND` |

### 1.2 فیلدهای اولویت منبع (پیشنهاد)

هر «شاخص کانونیکال × منبع» یک ردیف اولویت دارد:

```
source_priority
─────────────────────────────────────────────────────────────
indicator     TEXT   -- کانونیکال: CPI, GDP, POLICY_RATE, ...
source_id     TEXT   -- FRED | OECD | EUROSTAT | IMF | BIS | WB | ...
priority      INT    -- 1 = بهترین؛ بزرگ‌تر = پشتیبان
frequency     TEXT   -- M | Q | A  (بهترین فرکانس موجود در این منبع)
coverage      TEXT   -- global | oecd | eu | usa | g20 | ...
quality       TEXT   -- high | medium | low
enabled       INT    -- 1/0
notes         TEXT
─────────────────────────────────────────────────────────────
PK (indicator, source_id)
```

**الگوریتم انتخاب منبع برای یک (کشور، شاخص):**
1. همهٔ ردیف‌های `source_priority` با `indicator = X` و `enabled = 1` را بگیر.
2. آن‌هایی که کشور را پوشش می‌دهند را فیلتر کن (`coverage`).
3. کم‌ترین `priority` را انتخاب کن.
4. اگر سری خالی بود → priority بعدی (fallback زنجیره‌ای).
5. اگر هیچ‌کدام نبود → سری خالی است (و گروه «ناقص» علامت می‌خورد).

### 1.3 جدول کمکی: coverage کشور

```
source_country_coverage
─────────────────────────────────────────────
source_id   TEXT   -- FRED
country     TEXT   -- ISO3
covered     INT    -- 1/0
─────────────────────────────────────────────
PK (source_id, country)
```
(می‌توان با یک پرس‌وجوی `SELECT DISTINCT country FROM series WHERE dataset=?` آن را از خودِ macro.db تولید کرد — بدون دادهٔ دستی.)

### 1.4 معماری ذخیره‌سازی در macro.db

```
macro.db
├── series            (موجود)
├── data              (موجود)
├── sources           (موجود)
├── inflation_targets (موجود — chart02)
└── [جدید]
    ├── source_priority          ← اولویت هر (شاخص × منبع)
    ├── source_country_coverage  ← کدام منبع، کدام کشور
    └── macro_groups             ← نگاشت شاخص → گروه (۱ تا ۶)
```

`macro_groups`:
```
indicator   TEXT PK   -- CPI
group_key   TEXT      -- 1A_inflation
group_title TEXT      -- Inflation
weight      REAL      -- اختیاری (برای امتیاز گروه)
```

> همهٔ این‌ها در **macro.db (Main)** ساخته می‌شوند — **نه core.db** — چون core با هر rebuild پاک می‌شود (همان درسی که در chart02 گرفتیم).

### 1.5 الگوریتم Collector (طراحی)

```
برای هر گروه G در ۶ گروه:
   برای هر شاخص C در G:
      برای هر کشور K در countries:
         1. از source_priority منابع معتبر با پوشش K را مرتب کن
         2. اول منبعی که دادهٔ به‌روزتر/باکیفیت‌تر دارد را بردار
         3. اگر داده موجود نبود → منبع بعدی (fallback)
         4. اگر همه نبودند → gap ثبت کن (در جدول coverage_gaps)
  گروه را به picker بده → /api/<group>
```

---

## 2) مرحله ۲ — لیست منابع فعلی (گزارش، بدون تغییر)

| منبع | groupsy که پوشش می‌دهد | دادهٔ گرفته‌شده | cadence |
|---|---|---|---|
| **FRED** | Inflation, Growth, Labor, Monetary | `CPIAUCSL, CPILFESL, PPIACO, GDP, GDPC1, UNRATE, M1SL, M2SL` (فقط USA) | daily |
| **OECD** | Inflation, Growth, Labor | `CPI_IDX, CPI_YOY, PPI, GDP_VPV_*, UNEMP_RATE, CLI, INDPRO` | daily |
| **EUROSTAT** | Inflation, Growth, Labor | `HICP_*, GDP_*, UNE_RT_M, LFSI_EMP_Q` (EU) | daily |
| **IMF** | Growth, Labor | `NGDPD, NGDP_RPCH, PPPGDP, PCPIPCH, LUR` (annual) | weekly |
| **BIS** | Monetary, Trade | `CPI, policy rates, credit` (2 bulk ZIPs) | weekly |
| **WORLD_BANK** | Growth, Labor, Monetary | WDI کامل (`NY.GDP.*, SL.UEM.*, FM.LBL.*`) | monthly |

### گروه‌های ناقص
| گروه | وضعیت |
|---|---|
| Inflation | ✅ کامل (۴+ منبع) |
| Growth | ✅ کامل |
| Labor | ✅ خوب |
| **Trade** | ❌ **تقریباً هیچ** — نه EXPORTS/IMPORTS، نه CURRENT_ACCT |
| **Monetary** | ⚠️ نیمه — فقط M1/M2 + بخشی از BIS (policy rate) |
| **Fiscal** | ❌ **هیچ** |

### منابعی که باید تکمیل/اضافه شوند (گزارش)
- **Trade:** `IMF DOTS` (Direction of Trade), `UN Comtrade`, `WTO`
- **Monetary:** `BIS policy rates` (فعلاً فقط ZIP خام)، `IMF IFS`
- **Fiscal:** `IMF Fiscal Monitor`, `World Bank` (بعضی سری‌ها هست ولی استخراج نمی‌شود)

---

## 3) مرحله ۳ — لیست مرجع پیشنهادی هر گروه (پیشنهاد، بدون اجرا)

### Inflation
| منبع | چرا | داده | freq | coverage | کیفیت |
|---|---|---|---|---|---|
| OECD | استاندارد همگن | CPI, Core, PPI | M | OECD | high |
| Eurostat | رسمی EU | HICP | M | EU | high |
| IMF | پوشش جهانی | CPI, PPI | M/A | global | high |
| World Bank | تاریخی بلند | FP.CPI.TOTL | A | global | high |
| **OWID** | backfill از 1960 | CPI index | A | 200+ | medium |

### Growth
| منبع | داده | freq | coverage |
|---|---|---|---|
| OECD | GDP, INDPRO, CLI | Q/M | OECD |
| World Bank | GDP (بلندمدت) | A | global |
| Eurostat | GDP EU | Q | EU |
| IMF | GDP forecast | A | global |

### Labor
| منبع | داده | freq | coverage |
|---|---|---|---|
| OECD | UNEMP, EMP, wages | M | OECD |
| Eurostat | LFS | M/Q | EU |
| IMF | LUR | A | global |
| World Bank | SL.UEM.* | A | global |

### Trade
| منبع | داده | freq | coverage | کیفیت |
|---|---|---|---|---|
| **IMF DOTS** | exports/imports دوجانبه | M | global | high |
| **UN Comtrade** | تجارت کالا | M/A | global | high |
| WTO | تجارت خدمات | Q/A | global | medium |
| World Bank | NE.EXP.*, BM.GSR.* | A | global | high |

### Monetary
| منبع | داده | freq | coverage |
|---|---|---|---|
| BIS | policy rate, credit | D/M | global |
| FRED | M1, M2, policy (US) | M | USA |
| IMF IFS | M2, rates | M | global |
| OECD | short-rate | M | OECD |

### Fiscal
| منبع | داده | freq | coverage | کیفیت |
|---|---|---|---|---|
| IMF Fiscal Monitor | debt, deficit | A/Q | global | high |
| Eurostat | gov debt/deficit | Q/A | EU | high |
| OECD | fiscal balance | Q/A | OECD | high |
| World Bank | GC.DOD.* | A | global | medium |

---

## 4) مرحله ۴ — خروجی نهایی (یک‌جا)

### 4.1 ساختار اولویت‌بندی
← بخش 1.2، 1.3، 1.4 (جداول `source_priority`, `source_country_coverage`, `macro_groups`).

### 4.2 معماری macro.db (نهایی)
```
series, data, sources            — موجود، دست‌نخورده
inflation_targets                — موجود (chart02)
source_priority        [جدید]    — اولویت شاخص×منبع
source_country_coverage[جدید]    — پوشش کشور×منبع (قابل تولید خودکار)
macro_groups           [جدید]    — نگاشت شاخص → ۶ گروه
coverage_gaps          [اختیاری] — گزارش شکاف‌ها
```

### 4.3 معماری Collector (نهایی)
← بخش 1.5. سه مرحله، هر سه idempotent:
1. `seed_*` — ساخت جداول و مقداردهی اولیه (در macro.db).
2. `resolve` — انتخاب منبع با اولویت + fallback.
3. `build_core` — ساخت core.db (بدون تغییر معماری فعلی).

### 4.4 مسیر اجرای پیشنهادی (فازبندی)
| فاز | کار | تغییر کد؟ |
|---|---|---|
| P0 | ساخت جداول `source_priority`/`macro_groups` در macro.db + seed | فقط DB |
| P1 | افزودن ۳ گروه `Trade, Monetary, Fiscal` به `http.cjs` (ساختار، بدون داده) | بک‌اند |
| P2 | افزودن شاخص‌های جدید به `INDICATOR_MAP` (فقط اگر منبع داده دارد) | بک‌اند |
| P3 | افزودن منابع جدید (DOTS/Comtrade/Fiscal Monitor) | دانلودر + loader |
| P4 | backfill OWID | دانلودر + loader |

> **این سند فقط طراحی است.** هیچ کدی/منبعی تغییر نکرده تا زمانی که تأیید کنی.
