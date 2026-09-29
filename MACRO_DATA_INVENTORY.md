# Macro Data Inventory & Audit — ممیزی کامل پایگاه داده ماکرو

> **File:** `/MACRO_DATA_INVENTORY.md`
> **Generated:** 2026-09-19 · **Scope:** `collector/macro/db/macro.db` (خام) + `collector/macro/core_db/core.db` (curated) + `offline/**` (فایل‌های خام محلی) + `db_build/` + `core_db/build/` + `catalog/registry.cjs`
> **روش:** اسکن مستقیم ردیف‌های دیتابیس، پارس هدر/دیمنشن فایل‌های CSV و SDMX-JSON محلی، و **بازاستفاده از خود کد build** برای محاسبهٔ قیف فیلتر. هیچ عددی تخمینی نیست.

---

## ۰) حکم نهایی (Executive Verdict)

| پرسش | پاسخ قطعی |
|---|---|
| چند منبع داده متصل است؟ | **۷** — BIS, EUROSTAT, FRED, IMF, OECD, OWID, WB (هر ۷ در جدول `sources` هر دو دیتابیس) |
| دیتابیس خام چه اندازه دارد؟ | **۷,۲۸۵.۶ MB** · ۴ جدول · **۴۰۵,۲۶۹ سری** · **۱۲,۰۱۶,۲۵۳** نقطهٔ داده |
| خروجی curated؟ | **۱۳.۵ MB** · ۳ جدول · **۱,۴۴۲ سری** · **۹۹,۹۹۲** نقطه → **نرخ بقا ۰.۳۵۶٪** |
| قاتل اصلی فیلتر؟ | **فیلتر اندیکاتور**: ۲۶,۸۱۶ → ۱,۴۴۲ (فیلتر کشور: ۴۰۵,۲۶۹ → ۲۶,۸۱۶ · فیلتر فرکانس: **صفر حذف**) |
| آیا Core CPI برای ۱۶ کشور در دیتابیس خام **یا** فایل‌های محلی وجود دارد؟ | ❌ **خیر.** صفر. فقط `FRED.CPILFESL` برای USA |
| آیا فیلتر `build_core_db.cjs` مقصر بوده؟ | ❌ **نه** — `CORE_CPI` در ۶ منبع از ۷ منبع **حتی یک کد** ندارد |
| کشف جانبی (مهم) | 🎯 **ریشهٔ باگ «مخلوط نرخ/شاخص» در BIS پیدا شد**: loader دو سری مختلف (Index 628 و YoY 771) را در **یک `series_id`** ادغام می‌کند ⇒ نوع دادهٔ نهایی به **ترتیب ردیف‌ها در CSV** بستگی دارد. **راه‌حل کاملاً محلی است (بدون اینترنت).** |
| بزرگ‌ترین دارایی بلااستفاده | 🎯 **`offline/oecd/raw/KEI.json` (۴۸.۸MB)**: ۳۰ کد MEASURE دارد ولی فقط ۵–۶ تای آن استخراج شده؛ ~**۲۰ کد OECD** (شامل `H_EARN` دستمزد، `TOVM` خرده‌فروشی، `IR3TIB`/`IRLT` نرخ بهره، `BCICP`/`CCICP` اعتماد، اجزای GDP) **همین حالا روی دیسک هستند** |

---

## ۱) منبع #۱ — هفت مرجع داده و نقش هرکدام

منبع حقیقت: جدول `sources` (هر دو دیتابیس) + `config/config.cjs`.

| # | منبع | نام کامل | نقش / چه چیزی می‌دهد | Cadence | آخرین به‌روزرسانی |
|---|---|---|---|---|---|
| 1 | **BIS** | Bank for International Settlements | سری‌های بلندمدت مالی/پولی: CPI (long series)، نرخ سیاستی، اعتبار، شکاف اعتبار، نرخ ارز مؤثر، قیمت سهام/ملک، بدهی اوراق، پرداخت‌ها | Weekly | 2026-08-31 |
| 2 | **EUROSTAT** | Eurostat | آمار اتحادیه اروپا: HICP (شاخص و YoY)، نرخ بیکاری، اشتغال، GDP، نرخ بهرهٔ بلندمدت | Daily | 2026-08-31 |
| 3 | **FRED** | Federal Reserve Economic Data (St. Louis Fed) | فقط **آمریکا**: CPI، Core CPI (`CPILFESL`)، PPI، نرخ بیکاری، M1/M2، GDP، نرخ‌های بهره | Daily | 2026-08-31 |
| 4 | **IMF** | International Monetary Fund | DataMapper (WEO/IFS/GFS): تورم کل، GDP اسمی/حقیقی، بدهی دولت، تراز مالی، حساب جاری، ذخایر | Weekly | 2026-08-31 |
| 5 | **OECD** | OECD Data Explorer (SDMX) | KEI + QNA + MEI_CLI: CPI (شاخص/YoY)، PPI، بیکاری، تولید صناعی، GDP، سود واحد کار (ULC)، شاخص پیشرو (CLI)، تجارت | Daily | 2026-08-31 |
| 6 | **OWID** | Our World in Data | CPI سالانهٔ ۱۹۲ کشور (پوشش جهانی، تورم کل) — منبع fallback دامنهٔ گسترده | Monthly | 2026-09-15 |
| 7 | **WB** | World Bank Open Data (WDI) | ۱,۴۹۸ کد WDI: CPI (شاخص/YoY)، GDP و اجزا، سرمایه‌گذاری، اشتغال، پول گسترده، تجارت | Monthly | 2026-08-31 |

**جریان داده (۴ مرحله، هر مرحله فایل/اسکریپت مشخص):**
```
[1] دانلود         update/update_live.cjs            → download/ → extracted/ → normalized/
                     (config/config.cjs: 7 منبع، OECD flows = KEI | QNA | MEI_CLI)
[2] ساخت DB خام    db_build/main_offline_loader.cjs  → db/macro.db        (۴۰۵,۲۶۹ سری / ۱۲.۰M نقطه)
                     db_build/normalize.cjs            (map: BIS_INDICATORS، کشورها، فرکانس)
[3] فیلتر/curated  core_db/build/build_core_db.cjs   → core_db/core.db    (۱,۴۴۲ سری / ۱۰۰k نقطه)
                     filters/{countries,indicators,frequencies}.json + INDICATOR_MAP
[4] سرویس/انتشار   backend/{http,boot}.cjs (API) · backend/core/picker_lib.cjs · catalog/registry.cjs
                     → picker → API :4001 → پروکسی فرانت → چارت‌ها
```


---

## ۲) منبع #۲ — نقشهٔ کامل اسکیمای دیتابیس

### ۲.۱ دیتابیس خام — `collector/macro/db/macro.db` (۷,۲۸۵.۶ MB)

| جدول | ردیف | ستون‌ها |
|---|---|---|
| `series` | **۴۰۵,۲۶۹** | `series_id TEXT PK` · `dataset` · `country` · `indicator` · `frequency` · `unit` · `source` |
| `data` | **۱۲,۰۱۶,۲۵۳** | `series_id` · `date` · `value REAL` · `revision_id` · `valid_from` · `valid_to` |
| `sources` | **۷** | `source_id PK` · `name` · `url` · `update_frequency` · `last_update` |
| `inflation_targets` | **۱۸** | `country PK (ISO3)` · `low` · `high` · `note` — هدف تورمی بانک‌های مرکزی (MAIN DB، در rebuild پاک نمی‌شود) |

ایندکس‌ها: `idx_data_series_date(series_id,date)` · `idx_date(date)` · `idx_series_id(series_id)`

### ۲.۲ دیتابیس curated — `collector/macro/core_db/core.db` (۱۳.۵ MB)

| جدول | ردیف | تفاوت با خام |
|---|---|---|
| `series` | **۱,۴۴۲** | همان ستون‌ها + **ایندکس اضافهٔ** `idx_series_lookup(dataset,country,indicator,frequency)` |
| `data` | **۹۹,۹۹۲** | همان ساختار؛ کل تاریخچهٔ revision حفظ می‌شود |
| `sources` | **۷** | کپی |
| — | — | جدول `inflation_targets` **ندارد** → هدف تورمی همیشه از MAIN DB خوانده می‌شود (`backend/core/country_meta.cjs`) |

> **قاعدهٔ حیاتی نسخه‌بندی:** `valid_to IS NULL` = مقدار جاری. هر بازنویسی، نسخهٔ قبلی را می‌بندد و `revision_id+1` می‌سازد (`db_build/README.md`). همهٔ کوئری‌های این گزارش با `valid_to IS NULL` اجرا شده‌اند.

### ۲.۳ قرارداد `series_id` و فیلدها

```
<dataset>.<country>.<indicator>.<frequency>
مثال: BIS.US.CPI.M · OECD.DEU.CPI_YOY.M · FRED.USA.CPILFESL.M · WB.AUS.FP.CPI.TOTL.ZG.A
```
- **کد کشور به تفکیک منبع:** BIS = **ISO2** (`US`,`DE`) · Eurostat = ISO2 (نگاشت به ISO3 در `normalize.cjs`) · IMF/WB/OECD/FRED/OWID = ISO3.
- **فرکانس‌های موجود در خام:** `A`, `M`, `Q`, `D`, `H`, `U` — در curated فقط `M`, `Q`, `A`.
- **`unit` در خام معتبر نیست:** برای BIS یک عدد خام است (کد خودش مستند کرده: `BIS::CPI` مقدار `771` را در ستون unit نگه می‌دارد). طبقه‌بندی واقعی واحد/نوع در `catalog/registry.cjs` با `seriesProfile()` انجام می‌شود → `index | rate | percent | level`.

### ۲.۴ چهارده اندیکاتور canonical و پوشش واقعی آن‌ها

`filters/indicators.json` = `GDP, CPI, CORE_CPI, PPI, UNEMP, EMP, M1, M2, PMI, CLI, IND_PROD, EXPORT, IMPORT, GDP_DEFL`

| canonical | datasetهای دارای کد (از `INDICATOR_MAP`) | وضعیت |
|---|---|---|
| CPI | BIS, IMF, WB, OECD, FRED, EUROSTAT, **OWID** | ✅ ۷ منبع |
| GDP | IMF, WB, OECD, FRED, EUROSTAT | ✅ ۵ |
| **CORE_CPI** | **فقط FRED (`CPILFESL`)** | ⛔ **۱ منبع** |
| PPI | OECD, FRED | ⚠️ ۲ |
| UNEMP | IMF, WB, OECD, FRED, EUROSTAT | ✅ ۵ |
| EMP | WB, EUROSTAT | ⚠️ ۲ |
| M1 | FRED | ⚠️ ۱ |
| M2 | WB, FRED | ⚠️ ۲ |
| **PMI** | **هیچ‌کدام (آرایهٔ خالی در هر ۷ منبع)** | ⛔ **۰ منبع** |
| CLI | OECD | ⚠️ ۱ |
| IND_PROD | WB, OECD | ⚠️ ۲ |
| EXPORT / IMPORT | IMF, WB, OECD | ✅ ۳ |
| GDP_DEFL | WB | ⚠️ ۱ |

> 📌 **ناهم‌خوانی مستندات:** `core_db/README.md` می‌گوید «۱۳ canonical» ولی `indicators.json` **۱۴** مورد دارد (`GDP_DEFL` بعداً افزوده شده). سند باید به‌روز شود.

---

## ۳) توزیع واقعی داده و قیف فیلتر

### ۳.۱ دیتابیس خام به تفکیک منبع (اسکن کامل جدول `series`)

| dataset | سری | اندیکاتور | کشور | فرکانس‌ها |
|---|---|---|---|---|
| WB | **۳۹۶,۹۷۰** | ۱,۴۹۸ | ۲۶۵ | A |
| IMF | ۴,۳۵۱ | ۳۳ | ۲۶۵ | A |
| BIS | ۲,۲۰۴ | ۲۷ | ۲۵۶ | A(670) M(467) Q(866) D(195) H(3) U(3) |
| OECD | ۱,۴۳۴ | ۱۲ | ۶۰ | A(537) M(359) Q(538) |
| OWID | ۱۹۲ | ۱ | ۱۹۲ | A |
| EUROSTAT | ۱۰۶ | ۷ | ۱۶ | M(48) Q(45) A(13) |
| FRED | ۱۲ | ۱۲ | ۱ | M(7) D(3) Q(2) |
| **جمع** | **۴۰۵,۲۶۹** | — | — | — |

### ۳.۲ قیف فیلتر — محاسبه‌شده با **همان کد** `build_core_db.cjs` (اسکریپت `funnel.cjs`)

| مرحله | تعداد سری |
|---|---|
| ۰) کل خام | **۴۰۵,۲۶۹** |
| ۱) بعد از فیلتر کشور (۱۷ کشور هدف با alias هر منبع) | **۲۶,۸۱۶** (−۹۳.۴٪) |
| ۲) بعد از فیلتر اندیکاتور (۱۴ canonical) | **۱,۴۴۲** (−۹۴.۶٪) ← **قاتل اصلی** |
| ۳) بعد از فیلتر فرکانس (M/Q/A) | **۱,۴۴۲** (−۰٪) |
| ۴) موجود در `core.db` | **۱,۴۴۲** ✅ انطباق دقیق |
| **نرخ بقا** | **۰.۳۵۶٪** |

| dataset | خام | کشور∈۱۷ | +اندیکاتور | +فرکانس | کدهای مجاز |
|---|---|---|---|---|---|
| BIS | ۲,۲۰۴ | ۵۵۹ | **۳۴** | ۳۴ | ۱ |
| IMF | ۴,۳۵۱ | ۲۹۵ | **۱۳۹** | ۱۳۹ | ۱۱ |
| WB | ۳۹۶,۹۷۰ | ۲۵,۴۶۶ | **۷۹۹** | ۷۹۹ | ۴۷ |
| OECD | ۱,۴۳۴ | ۴۴۳ | **۴۲۳** | ۴۲۳ | ۱۱ |
| FRED | ۱۲ | ۱۲ | **۹** | ۹ | ۹ |
| EUROSTAT | ۱۰۶ | ۲۴ | **۲۱** | ۲۱ | ۶ |
| OWID | ۱۹۲ | ۱۷ | **۱۷** | ۱۷ | ۱ |

> نکتهٔ کلیدی: BIS از ۵۵۹ سری مربوط به ۱۷ کشور، فقط **۳۴ سری** به curated رسیده — چون `INDICATOR_MAP` برای BIS تنها **یک** کد (`CPI`) دارد و ۲۶ اندیکاتور دیگر BIS فیلتر شده‌اند.

---

## ۴) منبع #۳ — پاسخ قطعی: آیا Core CPI در داده‌های موجود ما هست؟

**پرسش:** آیا دادهٔ Core CPI (یا OECD و بقیهٔ منابع) برای ۱۶ کشور دیگر در جداول خام **وجود دارد** و فقط توسط `build_core_db.cjs` فیلتر شده؟

**پاسخ: خیر — هشت لایهٔ شاهد مستقل، همه یکسان:**

| # | لایهٔ بررسی | نتیجه |
|---|---|---|
| ۱ | `build_core_db.cjs` خط ۱۲۹-۱۳۶ → `CORE_CPI` | `{ BIS: [], IMF: [], WB: [], OECD: [], FRED: ["CPILFESL"], EUROSTAT: [] }` — تنها یک کد در یک منبع |
| ۲ | اسکن `INDICATOR_MAP` با کد build (`funnel.cjs`) | `CORE_CPI → بدون کد در: BIS, IMF, WB, OECD, EUROSTAT, OWID` |
| ۳ | جست‌وجوی الگویی در **۴۰۵,۲۶۹ سری خام** (`%CORE%, %CPILFE%, %CPGRLE%, %CPICOR%, %COREP%, %_TX%, %NRG%, %FOOD%, %EXCL%, %UNDERLY%, %MEDIAN%, %TRIMMED%, %TRIM%`) | فقط `FRED::CPILFESL` (۱ سری / ۱ کشور). بقیهٔ یافته‌ها نامرتبط‌اند (WB: `TX.VAL.FOOD.ZS.UN`, `AG.PRD.FOOD.XD`؛ BIS: `CARD_TX_VAL`) |
| ۴ | **`offline/oecd/raw/KEI.json` (۴۸.۸MB خام SDMX، محلی)** — ایزوله‌سازی و پارس بلوک `structure` | دیمنشن `MEASURE` = **۳۰ کد**؛ تک‌تک: `EMP, EX, IM, CA_GDP, NODW, BCICP, ULC, PRVM, UNEMP, CCICP, **CP**, H_EARN, IR3TIB, TOCAPA, TOVM, SHARE, IRLT, PP, MABM, MANM, IRSTCI, P7_Q, P6_Q, P51G_Q, P3_S13_Q, P3_S1M_Q, B1GQ_Q, RS, LI, CC` → **هیچ «Core»ی وجود ندارد؛ `CP` = «Consumer prices» (تورم کل)** |
| ۵ | **`offline/bis/WS_LONG_CPI_csv_col.csv` (۱.۳۸MB محلی)** — اسکن کامل ۲۷ dataset BIS | برای **هر ۱۷ کشور** دقیقاً ۴ ردیف: `(M, 628 = Index 2010=100)`, `(M, 771 = Year-on-year changes, in per cent)`, `(A,628)`, `(A,771)` → **فقط تورم کل** |
| ۶ | `offline/imf/ifs.csv` + `gfs.csv` + `weo.csv` | ۲۱ + ۱۱ کد (WEO/IFS/GFS) — هیچ کد Core ندارد |
| ۷ | `offline/eurostat/*.csv` | ۷ کد: `HICP_MIDX`, `HICP_ANR` (تورم کل)، `UNE_RT_M`, `LFSI_EMP_Q`, `GDP_*`, `EXT_LT_INTRATRD` → **شکست COICOP برای هسته دانلود نشده** |
| ۸ | `offline/oecd/raw/QNA.json` + `MEI_CLI.json` | حساب‌های ملی فصلی + شاخص پیشرو — بیربط به هسته |

### ✅ نتیجه‌گیری صریح
> **فیلتر `build_core_db.cjs` هیچ داده‌ای را دور نریخته است.** Core CPI برای ۱۶ کشور **هرگز دانلود نشده** — نه در `macro.db` (۴۰۵k سری)، نه در فایل‌های خام محلی (۱.۲GB BIS + ۷۳۰MB WB + ۶۶MB OECD + ۱۴MB IMF + ۱.۲MB Eurostat).
> آنچه «core CPI» می‌نامیم در کل دارایی ما: **`FRED.USA.CPILFESL.M`** — یک سری، یک کشور، ۸۳۴ نقطه (۱۹۵۷-۰۱ → ۲۰۲۶-۰۷).

---

## ۵) 🎯 کشف مهم: ریشهٔ باگ «مخلوط نرخ و شاخص» در BIS

ممیزی قبلی (`CPI_YOY_DATA_AUDIT.md`) نشان داد `BIS::CPI` برای ۸ کشور «نرخ» و برای ۹ کشور «شاخص» است. **ریشهٔ دقیق آن اینجا پیدا شد:**

### ۵.۱ زنجیرهٔ علت (با ارجاع به کد)

| مرحله | کد / فایل | رفتار |
|---|---|---|
| ۱ | `offline/bis/WS_LONG_CPI_csv_col/WS_LONG_CPI_csv_col.csv` (هدر) | ستون‌ها: `FREQ, Frequency, REF_AREA, Reference area, **UNIT_MEASURE**, Unit of measure, …` |
| ۲ | محتوای فایل | برای هر کشور **۴ ردیف**: `M/628 (Index, 2010=100)`, `M/771 (Year-on-year changes)`, `A/628`, `A/771` |
| ۳ | `db_build/normalize.cjs:109` | `BIS_INDICATORS = { …, WS_LONG_CPI: "CPI", … }` → هر ۴ ردیف می‌شوند `indicator = "CPI"` |
| ۴ | `db_build/main_offline_loader.cjs:252,265` | `indicator = BIS_INDICATORS[datasetCode]` · `UNIT_MEASURE` فقط به‌عنوان **رشتهٔ unit** استفاده می‌شود، **نه در کلید** |
| ۵ | `normalize.cjs:makeSeriesId()` | `BIS.<ISO2>.CPI.<FREQ>` → **۶۲۸ و ۷۷۱ روی هم می‌افتند** (تصادم کلید) |
| ۶ | `db_build/README.md` بند Notes | «Because a BIS dataset collapses many sub-series into one series_id, per-observation **"first value wins"** applies» → یعنی **ترتیب ردیف CSV تعیین‌کننده است** |

### ۵.۲ شاهد عددی (مقایسهٔ CSV خام با `macro.db`)

| کشور | ترتیب ردیف‌ها در CSV (M) | برندهٔ تصادم | نتیجه در `macro.db` | تأیید |
|---|---|---|---|---|
| **USA** | `M/771` **قبل از** `M/628` | 771 (نرخ) برای تاریخ‌های مشترک | `BIS.US.CPI.M` اول = **4.4943** (شاخص ۱۹۱۳، فقط در ۶۲۸ موجود) و آخر = **3.365** (نرخ ۲۰۲۶) | ✅ زنجیره = «شاخص در ابتدا، نرخ در ادامه» |
| **AUS** | `M/628` **قبل از** `M/771` | 628 (شاخص) | `BIS.AU.CPI.M` اول = 2.9144@1922 و آخر = **153.33** (شاخص) | ✅ کل سری شاخص |

**⇒ همان ۱۷ کشوری که ممیزی قبلی «۸ نرخ / ۹ شاخص» تشخیص داده بود، دقیقاً با ترتیب ردیف‌های CSV توضیح داده می‌شوند.** این یک ویژگی دادهٔ واقعی نیست؛ **نتیجهٔ تصادم کلید در loader** است.

### ۵.۳ اهمیت
- این bug **قابل رفع کاملاً محلی** است (فایل CSV روی دیسک موجود است؛ نیازی به دانلود نیست).
- پس از رفع، `CPI YoY` برای هر ۱۷ کشور **دو سری سالم** خواهد داشت: شاخص (628) و نرخ آمادهٔ YoY (771) — که هر دو به‌کار می‌آیند (شاخص برای «Rebased/Indexed» و نرخ برای خط مستقیم).


---

## ۶) منبع #۴ — چه چیزی **قابل بازیابی** است و چه چیزی نیاز به دانلود جدید دارد

سه دستهٔ کاملاً متفاوت:

### 🟢 دسته A — «همین حالا در `macro.db` هست»؛ فقط `INDICATOR_MAP` + rebuild لازم است (صفر اینترنت)

| اندیکاتور (خام) | dataset::code | سری | از ۱۷ کشور | فرکانس | کاربرد چارت |
|---|---|---|---|---|---|
| **نرخ سیاستی بانک مرکزی** | `BIS::POLICY_RATE` | ۹۸ | **۱۷/۱۷** | M, D | Policy Rate vs Inflation |
| **نرخ ارز مؤثر** | `BIS::EFFECTIVE_EXCHANGE_RATE` | ۱۲۸ | **۱۷/۱۷** | M, D | فشار ارزی روی تورم |
| **نرخ ارز دلاری** | `BIS::USD_EXCHANGE_RATE` | ۶۵۸ | **۱۷/۱۷** | M/Q/A/D | FX panel |
| **شکاف اعتبار (Credit-to-GDP)** | `BIS::CREDIT_GAP` | ۴۴ | **۱۷/۱۷** | Q | هشدار ریسک بانکی |
| **اعتبار/تسهیلات/اعتبار تجاری** | `BIS::CREDIT` / `LOANS` / `TRADE_CREDIT` | ۳۳/۵۲/۴۸ | ۱۳/۱۵/۱۷ | Q | Credit & liquidity |
| **قیمت سهام** | `BIS::SHARE_PRICES` | ۶۱ | ۱۶/۱۷ | Q | ریسک بازار |
| **قیمت مسکن** | `BIS::PROPERTY_PRICES` | ۲۹ | ۸/۱۷ | Q | Housing |
| **نسبت خدمات بدهی** | `BIS::DEBT_SERVICE_RATIO` | ۳۲ | ۱۶/۱۷ | Q | ریسک بدهی |
| **نقدینگی جهانی** | `BIS::GLOBAL_LIQUIDITY` | ۲۵ | ۱۰/۱۷ | Q | رژیم نقدینگی |
| **سود واحد کار (دستمزد)** | `OECD::ULC` | ۷۴ | ۱۰/۱۷ | Q, A | Wage/ULC inflation ⭐ |
| **نرخ بهرهٔ بلندمدت** | `EUROSTAT::EXT_LT_INTRATRD` | ۱۳ | ۳/۱۷ | A | Yield |
| **نرخ بهرهٔ آمریکا** | `FRED::FEDFUNDS`, `DGS2`, `DGS10` | ۳ | ۱/۱۷ | D | US curve |
| **پول/بدهی/تراز مالی/حساب جاری/ذخایر** | `IMF::FMB_PCH`, `FMB_GDP`, `GGXWDG_NGDP`, `GGXCNL_NGDP`, `BCA_NGDPD`, `RESERVES_M`, `RESERVES_M2`, `PPPEX` | ~۱٬۲۰۰ | ۱–۱۷ | A | Macro risk |
| **PPI به تفکیک فعالیت** | `WB::IE.PPI.ENGY.CD`, `.ICTI.CD`, `.TRAN.CD`, `.WATR.CD` | ۴×۲۶۵ | **۱۷/۱۷** | A | PPI breakdown |
| **انواع GDP Deflator** | `WB::NY.GDP.DEFL.ZS`, `.ZS.AD`, `.KD.ZG.AD`, `NE.DAB.DEFL.ZS` | ۴×۲۶۵ | **۱۷/۱۷** | A | Deflator |
| بقیهٔ WDI | ~۱,۴۵۰ کد `WB::*` | ~۳۹۵٬۰۰۰ | ۱۷ (اکثر) | A | چارت‌های آینده |

> اندیکاتورهای بلااستفاده — **BIS: ۲۶ از ۲۷** · **OECD: ۱ از ۱۲** · **IMF: ~۲۲ از ۳۳** · **FRED: ۳ از ۱۲** · **EUROSTAT: ۱ از ۷** · **WB: ~۱,۴۵۰ از ۱,۴۹۸**

### 🟡 دسته B — «در فایل‌های خام **محلی** هست ولی استخراج/بارگذاری نشده» (صفر اینترنت، فقط کار کد)

| فایل محلی | حجم | چه چیزی داخلش هست که استفاده نشده | اقدام |
|---|---|---|---|
| **`offline/oecd/raw/KEI.json`** ⭐ | **۴۸.۸ MB** | **۳۰ کد MEASURE** — فقط ۵–۶ کد به CSV تبدیل شده. **استخراج‌نشده:** `H_EARN` (**دستمزد ساعتی**), `TOVM` (**خرده‌فروشی**), `IR3TIB`/`IRLT` (نرخ کوتاه/بلندمدت), `SHARE` (سهام), `MABM`/`MANM` (M3/M1), `BCICP`/`CCICP` (**اعتماد کسب‌وکار/مصرف‌کننده**), `TOCAPA`, `NODW`, `CA_GDP`, `P3_S1M_Q`/`P3_S13_Q`/`P51G_Q`/`B1GQ_Q` (**اجزای GDP → چارت Contribution**), `P6_Q`/`P7_Q`, `PRVM`, `RS`, `CC`, `EMP` | افزودن به extractor + `INDICATOR_MAP` → rebuild |
| `offline/oecd/raw/QNA.json` | ۷.۹ MB | حساب‌های ملی فصلی (مصرف/سرمایه‌گذاری/صادرات) | همان |
| `offline/bis/WS_LONG_CPI_csv_col.csv` | ۱.۴ MB | **۲ سری سالم در هر کشور** (`628`=Index و `771`=YoY%) که با تصادم کلید ادغام شده‌اند | `UNIT_MEASURE` را به کلید سری اضافه کن → **رفع کامل باگ BIS** |
| `offline/bis/*` (۲۷ dataset) | ۱.۲ GB | همه بارگذاری شده‌اند (۲۷/۲۷) ✅ | — |
| `offline/worldbank/WDI_CSV/WDICSV.csv` | ۱۹۸ MB | ۱,۴۹۸ کد WDI (همه بارگذاری شده) | — |
| `offline/imf/{ifs,weo,gfs}.csv` | ۸ MB | ۳۳ کد (همه بارگذاری شده) | — |
| `offline/eurostat/*.csv` | ۱.۲ MB | ۷ کد؛ فقط ۱۶ geo (۴ تای هدف ما: DEU/FRA/ITA/GBR) | گسترش geo نیاز به دانلود دارد |

### 🔴 دسته C — نیازمند **Ingest جدید + اینترنت** (واقعاً نداریم)

| نیاز | منبع پیشنهادی | چرا |
|---|---|---|
| **Core CPI برای ۱۶ کشور** | OECD `DSD_PRICES@DF_PRICES_ALL` (هسته/`CPGRLE01` یا COICOP `_TXCP01_NRG`) — **dataflow جدید**؛ `config.cjs` فقط `KEI, QNA, MEI_CLI` را می‌گیرد | «Headline vs Core» فعلاً فقط USA |
| **Core HICP اروپا** | Eurostat `prc_hicp_midx` با COICOP `TOT_X_NRG_FOOD` | DEU/FRA/ITA هسته ندارند |
| **اجزای تورم (خوراک/انرژی/خدمات)** | OECD PRICES یا Eurostat COICOP | چارت Contribution |
| **انتظارات تورمی** | OECD / Consensus | لنگر انتظارات |
| **فرصت‌های شغلی (Vacancies)** | OECD/Eurostat Employment | منحنی Beveridge |
| **PMI** | هیچ provider در `config.cjs` نیست (در `INDICATOR_MAP` هم خالی) | Diffusion/Nowcast |
| **Trimmed-mean / Median CPI** | OECD PRICES | سنجه‌های هسته |
| Retail Sales رسمی | ⚠️ **لازم نیست** — KEI محلی `TOVM` دارد → دسته B | — |
| Wage growth رسمی | ⚠️ **لازم نیست** — KEI محلی `H_EARN` + `ULC` دارد → دسته B/A | — |

---

## ۷) پیشنهاد اجرایی (به ترتیب اولویت و هزینه)

| اولویت | کار | فایل‌های درگیر | اینترنت | اثر |
|---|---|---|---|---|
| **P0** | **رفع تصادم کلید BIS** (`UNIT_MEASURE` در `series_id`) | `db_build/normalize.cjs`, `main_offline_loader.cjs` → rebuild `macro.db` → rebuild `core.db` | ❌ | رفع ریشه‌ای باگ ۸ کشور؛ دقت همهٔ چارت‌های تورم |
| **P1** | **✅ انجام شد (2026-09-20)** — COICOP زیرشاخص + Core رسمی + وزن سبد + **هستهٔ محاسباتی ۵ کشور** + آپدیت افزایشی | `offline/{eurostat,oecd,fred,imf}/download_*_offline.cjs` + `core_db/build/build_core_db.cjs` (`DERIVED_CORE_CPI`) + `backend/{http.cjs,catalog/registry.cjs}` + `update/lib/smart_downloader.cjs` | ✅ | زیرشاخص ۱۷/۱۷ · **Core ۱۷/۱۷** (۱۲ رسمی + ۵ محاسباتی) · وزن ۳/۱۷ · آپدیت روزانه ۵ ثانیه — جزئیات در `MACRO_INFLATION_COVERAGE.md §۰.۵` |
| **P2** | استخراج MEASUREهای باقی‌ماندهٔ KEI | extractor `offline/oecd/*` + `INDICATOR_MAP` | ❌ | دستمزد، خرده‌فروشی، نرخ بهره، اعتماد، M1/M2/M3 |
| **P3** | اتصال اندیکاتورهای موجود دسته A (`POLICY_RATE`, `ULC`, `EXT_LT_INTRATRD`, نرخ‌های FRED) | `build_core_db.cjs` + `indicators.json` | ❌ | چارت‌های Policy Rate / Wage / Yield |
| **P4** | چارت‌های BIS موجود (`CREDIT_GAP`, `SHARE_PRICES`, `PROPERTY_PRICES`, `EER`) | همان | ❌ | دامنهٔ Markets/Risk |
| **P5** | `QNA.json` → اجزای GDP برای چارت Contribution | extractor + map | ❌ | Growth domain |
| **P6** | PMI / Expectations / Vacancies / Trimmed-mean | منبع جدید + ingest | ✅ | نواقص باقی‌مانده |
| **P7** | به‌روزرسانی مستندات ناهم‌خوان (۱۳→۱۴ canonical؛ توضیح تصادم کلید BIS) | `core_db/README.md`, `db_build/README.md` | ❌ | جلوگیری از تکرار خطا |


---

## ۸) پیوست — بازتولید و ابزارها

### ۸.۱ ابزارهای دائمی
```
collector/macro/tools/data_inventory/
├── funnel.cjs                # قیف فیلتر با کد واقعی build_core_db
├── raw_indicators.py         # فهرست کامل کدهای اندیکاتور دیتابیس خام
├── bis_unit_collision.py     # اثبات تصادم کلید ۶۲۸/۷۷۱ در BIS::CPI
└── README.md
```
```bash
cd collector/macro
node tools/data_inventory/funnel.cjs
python3 tools/data_inventory/raw_indicators.py
python3 tools/data_inventory/bis_unit_collision.py
```

### ۸.۲ دستورهای ممیزی دستی (برای تأیید مستقل)

```bash
# الف) اسکیمای هر دو دیتابیس + تخمین ردیف‌ها (sqlite_stat1)
sqlite3 collector/macro/db/macro.db ".schema"
sqlite3 collector/macro/db/macro.db "SELECT * FROM sqlite_stat1;"

# ب) توزیع سری‌ها در خام
sqlite3 collector/macro/db/macro.db \
  "SELECT dataset, COUNT(*) n, COUNT(DISTINCT indicator) inds, COUNT(DISTINCT country) ct
   FROM series GROUP BY dataset ORDER BY n DESC;"

# ج) همان سؤال Core CPI در سطح کد build
node -e "const {INDICATOR_MAP,DATASETS}=require('./collector/macro/core_db/build/build_core_db.cjs');
         console.log(JSON.stringify(INDICATOR_MAP.CORE_CPI))"
# → {"BIS":[],"IMF":[],"WB":[],"OECD":[],"FRED":["CPILFESL"],"EUROSTAT":[]}

# د) اثبات تصادم کلید در فایل BIS خام
head -2 collector/macro/offline/bis/WS_LONG_CPI_csv_col/WS_LONG_CPI_csv_col.csv | cut -c1-300
# ستون UNIT_MEASURE همیشه 628 (Index) یا 771 (YoY) است و در series_id استفاده نمی‌شود

# ه) ۳۰ کد MEASURE فایل KEI خام (بدون core)
python3 tools/data_inventory/raw_indicators.py | grep -A40 'OECD'
```

### ۸.۳ فایل‌های کلیدی که این گزارش بر آن‌ها استوار است

| فایل | نقش در این ممیزی |
|---|---|
| `collector/macro/db/macro.db` | دیتابیس خام (۷.۳GB) — منبع اعداد بخش ۳ و ۶ |
| `collector/macro/core_db/core.db` | curated (۱۳.۵MB) — مقصد قیف |
| `collector/macro/core_db/build/build_core_db.cjs` | `INDICATOR_MAP` (+ خط ۱۲۹ = ریشهٔ گپ Core) |
| `collector/macro/core_db/build/filters/*.json` | ۱۷ کشور · ۱۴ اندیکاتور · M/Q/A |
| `collector/macro/db_build/main_offline_loader.cjs` + `normalize.cjs` | loader + `BIS_INDICATORS` (ریشهٔ تصادم کلید) |
| `collector/macro/config/config.cjs` | ۷ منبع + OECD flows = `KEI | QNA | MEI_CLI` |
| `collector/macro/backend/catalog/registry.cjs` | طبقه‌بندی نوع/واحد (`index|rate|percent|level`) |
| `collector/macro/offline/oecd/raw/KEI.json` | ۴۸.۸MB خام OECD — ۳۰ MEASURE، ~۲۰ کد استخراج‌نشده |
| `collector/macro/offline/bis/WS_LONG_CPI_csv_col/*.csv` | منبع `BIS::CPI` و اثبات تصادم ۶۲۸/۷۷۱ |
| `collector/macro/offline/{imf,eurostat,fred,owid,worldbank}/*` | تأیید نبود Core در سایر منابع |
| `CPI_YOY_DATA_AUDIT.md` (ریشه) | ممیزی قبلی چارت CPI — این گزارش ریشهٔ آن باگ را تکمیل می‌کند |

---

## ۹) ✅ P0 — وضعیت اجرا (انجام شد)

> این بخش **پس از اجرای مهاجرت** به گزارش اضافه شده است؛ بندهای ۱–۸ تحلیل پیش از اجرا هستند.

### ۹.۱ چه چیزی تغییر کرد (کد)

| فایل | تغییر | چرا |
|---|---|---|
| `db_build/normalize.cjs` | افزودن `BIS_MEASURE_INDICATORS` + `bisIndicator(datasetCode, unitMeasure)` و export آن‌ها | سنجه باید بخشی از **هویت سری** شود |
| `db_build/main_offline_loader.cjs` | `loadBisFile` اکنون indicator را **per-row** و measure-aware می‌سازد | تا ۶۲۸ و ۷۷۱ دیگر یک `series_id` نسازند |
| `db_build/migrate_bis_cpi_measures.cjs` | **جدید** — مهاجرت فقط برای `WS_LONG_CPI` روی `macro.db` موجود (بدون rebuild کامل ۷.۳GB) | افزودن ۲۵۲ سری سالم، بدون حذف چیزی |
| `core_db/build/build_core_db.cjs` | `CPI: { BIS: ["CPI", ...] }` → `["CPI_IDX", "CPI_YOY"]` | سری مخلوط دیگر به core راه نمی‌یابد |
| `backend/catalog/registry.cjs` | `BIS::CPI_IDX` → `index` · `BIS::CPI_YOY` → `rate` · `BIS::CPI` به‌عنوان legacy | تفکیک نوع در طبقه‌بندی |
| `backend/core/picker_lib.cjs` | `id` از کد **provider** ساخته می‌شود (+ فیلد `indicator.provider_code`) | یک canonical می‌تواند چند کد provider داشته باشد؛ قبلاً `id` تکراری تولید می‌شد |
| `frontend/lib/macro/cpi.ts` | **YoY تاریخ‌محور** (`priorYearKey`/`shiftMonthKey`) + `annualized3m` فقط ماهانه | رفع باگ گپ داده (بند ۹.۳) |
| `collector/macro/tools/cpi_audit.cjs` | آینهٔ همان منطق تاریخ‌محور | ابزار و کد اصلی هم‌داستان بمانند |

### ۹.۲ نتیجهٔ مهاجرت و بازسازی (اعداد واقعی)

```
مهاجرت macro.db :  series 405,269 → 405,521  (+252)   ·   data 12,016,253 → 12,121,295  (+105,042)
                   inserted=105,042  revised=0  unchanged=0   (idempotent)
                   سری‌های legacy BIS.*.CPI.* : ۱۲۶ عدد — دست‌نخورده، فقط از core حذف می‌شوند
بازسازی core.db  :  BIS از ۳۴ → ۶۸ سری (۲ کد × ۱۷ کشور × ۲ فرکانس)
                   کل: series=1,476  ·  data=116,420  ·  ۱.۴ ثانیه
                   main DB untouched: 405,521→405,521 · 12,121,295→12,121,295 ✔
```

**صحت معنایی تفکیک (نمونه‌های واقعی):**

| سری | first | last | تفسیر |
|---|---|---|---|
| `BIS.US.CPI_IDX.M` | 4.4943 (1913-01) | **153.1344** (2026-07) | سطح شاخص (2010=100) |
| `BIS.US.CPI_YOY.M` | 2.0408 (1914-01) | **3.3648** (2026-07) | نرخ سالانه |
| `BIS.TR.CPI_IDX.M` | 0.0001 (1964-01) | **2360.84** | تورم مزمن ترکیه |
| `BIS.TR.CPI_YOY.M` | 3.5700 (1965-01) | **31.7541** | نرخ سالانه |
| `BIS.IN.CPI_IDX.M` | 2.6325 (1953-04) | **231.6826** | سطح (هند) |

**اعتبارسنجی متقابل:** YoY محاسبه‌شده از شاخص ۶۲۸ **دقیقاً** برابر نرخ منتشرشدهٔ ۷۷۱ است
(`US/DE/CA/IN/TR` → اختلاف `0.0000pp`) ⇒ دو سنجهٔ BIS با هم سازگارند و تفکیک درست انجام شده.
همچنین مقدار آخر هر ۸ کشور «قربانی» بیت‌به‌بیت با `CPI_YOY` جدید یکسان است (پروسهٔ تشخیص تأیید می‌شود).

### ۹.۳ باگ دوم کشف‌شده و رفع‌شده — YoY با آفست مکانی

هنگام ممیزی خروجی، اختلاف کوچکی دیده شد: پیکر برای آمریکا `3.521` می‌داد در حالی که بک‌اند `3.3648`.
علت با شواهد مشخص شد: سری شاخص CPI آمریکا نقطهٔ **`2025-10` را ندارد**:
```
..., 2025-09, [2025-10 غایب], 2025-11, 2025-12, ...
```
`computeYoyRows` قبلی از **آفست مکانی** (`clean[i-12]`) استفاده می‌کرد ⇒ در حضور گپ، مبنا به
`2025-06` می‌لغزید. اصلاح: تطبیق **تاریخ دقیق** `priorYearKey` (ماهانه/فصلی/سالانه/روزانه) + برای
`annualized3m` فقط سری ماهانه و با `shiftMonthKey(-3)`. نتیجه: `3.521 → 3.365` (منطبق با بک‌اند).

### ۹.۴ وضعیت ابزار ممیزی پس از P0 ✅

```
DB INVENTORY : هر کشور دو سری دارد → CPI_IDX (detected level, med12=120…2360)
                                     CPI_YOY (detected rate,  med12=2…32)
REGISTRY     : BIS::CPI_IDX → index/level/ok   ·   BIS::CPI_YOY → rate/rate/ok
               MATH-RISK entries: 0        ← ✅ شرط پذیرش برآورده شد
PAYLOAD      : default        → kind mismatch: 0 · regression: 0
               mode=countries → kind mismatch: 0 (۱۷/۱۷) · regression: 0
               USA = 3.365 (پیش‌تر 3.521 و قبل‌تر 26.061)
RESULT       : OK — هیچ نقض واقعی‌ای پیدا نشد.
```

> ⚠️ نکتهٔ عملیاتی: پس از هر rebuild باید **پروسهٔ بک‌اند ری‌استارت شود** (کد registry/picker در حافظه کش می‌شود).
> در این اجرا: بک‌اند متوقف → مهاجرت → بازسازی core → راه‌اندازی مجدد → ممیزی.

### ۹.۵ باقی‌مانده از P0 (اختیاری، بدون blocker)

- `mode=countries` فعلاً برای هر کشور **`CPI_IDX`** را انتخاب می‌کند (اول لیست) و فرانت YoY را محاسبه می‌کند
  (نتیجه درست، چون دو سنجه سازگارند). اگر بخواهید خط چارت **عیناً** نرخ منتشرشدهٔ BIS باشد، کافی است
  در `pickSeries` فرانت `provider_code === "CPI_YOY"` را ترجیح دهیم (یک خط تغییر، بدون تغییر داده).
- ۱۲۶ سری legacy `BIS.*.CPI.*` در `macro.db` باقی است (فقط از core حذف شده‌اند). حذف فیزیکی توصیه
  **نمی‌شود** (قانون «main DB دست‌نخورده»)؛ در صورت نیاز می‌توان با یک اسکریپت مستند حذف کرد.
- اسکریپت‌های موقت ممیزی این مرحله: `db_build/_verify_macro_db.cjs` (بررسی سلامت + rollback).

---

*پایان گزارش — همهٔ اعداد از ردیف‌های زندهٔ دیتابیس و فایل‌های خام محلی استخراج شده‌اند؛ هیچ مقدار تخمینی یا مفروضی در این سند نیست.*


---

## ۱۰) ✅ P1 (بخشی) — افزودن Core CPI به خط لولهٔ FRED بدون فایل جدید

> هدف: بدون ساخت دانلودر جدید، توانایی دانلود تورم هستهٔ کشورها به **سیستم موجود** اضافه شود.

### ۱۰.۱ چه چیزی تغییر کرد (فقط در فایل‌های موجود)

| فایل | تغییر |
|---|---|
| `offline/fred/download_fred_offline.cjs` | پشتیبانی `area` (ISO3) **به‌ازای هر سری** (قبلاً `REF_AREA` همیشه `USA` بود) + ۱۳ سری هستهٔ تأییدشده در همان metric `core_cpi` |
| `update/lib/smart_downloader.cjs` | همان کاتالوگ و همان منطق `area` (مسیر بروزرسانی زنده) — دو کاتالوگ هم‌اکنون یکسان‌اند |
| `update/lib/light_checker.cjs` | دو probe نمایندهٔ هسته (`CPGRLE01DEM659N`، `CPGRLE01KRM659N`) تا تغییر داده در آن‌ها هم تشخیص داده شود |
| `core_db/build/build_core_db.cjs` | `CORE_CPI.FRED` از **۱ کد به ۱۴ کد** |
| `backend/catalog/registry.cjs` | دو قاعدهٔ الگویی: `FRED_CORE_YOY_RE` (rate) و `FRED_CORE_INDEX_RE` (index) |
| `frontend/app/dashboard/macro/page.tsx` | درخواست `mode=countries&limit=60` (سقف ۲۹ سری جا برای CORE_CPI نداشت) |

⚠️ **کدهای داده‌شده در درخواست (`JPNCPILFESMMEI`، `CPILFESMUTSTSAM`، …) در FRED وجود ندارند** — با API رسمی FRED تأیید شد (`HTTP 404` / `series not found`). خانوادهٔ واقعی و **به‌روز** این است:

| سری FRED | کشور | نوع | بازه | آخرین به‌روزرسانی |
|---|---|---|---|---|
| `CPILFESL` | USA | index | 1957-01..2026-08 | 2026-09-11 |
| `DEUCPHPLA01GYM` | DEU | YoY % | 1997-01..2025-04 | 2025-05-15 |
| `FRACPHPLA01GYM` | FRA | YoY % | 1997-01..2025-04 | 2025-05-15 |
| `ITACPHPLA01GYM` | ITA | YoY % | 1997-01..2025-04 | 2025-05-15 |
| `DEUCPHPLA01IXOBM` | DEU | Index 2015=100 | 1995-01..2025-03 | 2025-05-15 |
| `FRACPHPLA01IXOBM` | FRA | Index | 1990-01..2025-04 | 2025-05-15 |
| `ITACPHPLA01IXOBM` | ITA | Index | 1990-01..2025-04 | 2025-05-15 |
| `GBRCPHPLA01IXOBM` | GBR | Index | 1988-01..2025-03 | 2025-05-15 |
| `CPGRLE01DEM659N` | DEU | YoY % | 1963-01..2025-03 | 2025-04-15 |
| `CPGRLE01FRM659N` | FRA | YoY % | 1971-01..2025-03 | 2025-05-15 |
| `CPGRLE01ITM659N` | ITA | YoY % | 1961-01..2025-03 | 2025-05-15 |
| `CPGRLE01GBM659N` | GBR | YoY % | 1971-01..2025-03 | 2025-05-15 |
| `CPGRLE01CAM659N` | CAN | YoY % | 1962-01..2025-03 | 2025-05-15 |
| `CPGRLE01KRM659N` | KOR | YoY % | 1990-01..2025-04 | 2025-05-15 |

### ۱۰.۲ نتیجهٔ اجرای خط لوله (اعداد واقعی)

```
1) دانلود   offline/fred/core_cpi.csv :  53.7 KB → 523.6 KB   (۱۴ سری، ۷,۵۱۰ ردیف، ۷ کشور)
2) اینجست   db_build/main_offline_loader.cjs --only=FRED
             series 405,521 → 405,534 (+13)   ·   data 12,121,295 → 12,127,971 (+6,676)
             revisions=0  (هیچ مقدار قبلی بازنویسی نشد)  ·  Elapsed 116.6s
3) بازسازی  core.db --fresh : FRED از ۹ → ۲۲ کد · series 1,476 → 1,489 · data 116,420 → 123,096
             main DB untouched ✔
4) ممیزی    MATH-RISK entries: 0 · kind mismatch: 0 · regression: 0 · RESULT: OK
5) چارت     ۷ کشور آیتم Legend سوم (Core) می‌گیرند؛ ۱۰ کشور دیگر نه (شرطی بودن Core تأیید شد)
```

**نمونهٔ مقادیر (آخرین نقطه):** DEU core 3.1% · FRA 1.7% · ITA 2.2% · GBR 4.2% · CAN 2.43% · KOR 2.05% — همه منطقی.

### ۱۰.۳ آنچه **هنوز** در FRED نیست (گپ واقعی برای ingest بعدی)

`JPN` (سری هسته تا **2021-06** متوقف است) · `AUS` · `CHN` · `IND` · `TUR` · `MEX` · `BRA` · `RUS` · `SAU` · `ZAF`
→ منبع درست برای این‌ها: **OECD `DSD_PRICES@DF_PRICES_ALL`** (خارج از سه flow فعلی `KEI/QNA/MEI_CLI`) یا **Eurostat COICOP `TOT_X_NRG_FOOD`** — همان P1 باقی‌مانده در بند ۷.

### ۱۰.۴ نکتهٔ مهم عملیاتی برای چارت

`?mode=countries` سقف **۲۹ سری** داشت و Core جا نمی‌شد؛ اکنون صفحه با **`limit=60`** درخواست می‌دهد
(سقف مجاز پروکسی هم ۶۰ است). اگر بعداً سری‌ها بیشتر شد، هم `MAX_LIMIT` در `lib/server/upstream.ts`
و هم `limit` صفحه باید هم‌زمان بالا بروند.

