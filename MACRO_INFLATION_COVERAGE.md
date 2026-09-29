# Macro Inflation Data Coverage — پوشش داده‌های تورمی

> **File:** `/MACRO_INFLATION_COVERAGE.md` · **Generated:** 2026-09-19 · **به‌روزشده:** 2026-09-20 (P1)
> **مبنا:** اسکن مستقیم `collector/macro/db/macro.db` (خام، ۴۰۶,۶۹۷ سری) + `core_db/core.db` (curated، ۱,۹۴۳ سری) + کاتالوگ رسمی `offline/worldbank/WDI_CSV/WDISeries.csv` + فایل‌های خام محلی
> **دامنهٔ کشورها:** ۱۷ کشور هدف (USA, CHN, JPN, DEU, GBR, FRA, ITA, CAN, AUS, KOR, IND, TUR, MEX, BRA, RUS, SAU, ZAF)

---

## 🆕 ۰.۵) به‌روزرسانی P1 (2026-09-20) — زیرشاخص‌ها و وزن‌ها اضافه شدند

بخش‌های ۱ تا ۵ پایین‌تر، **وضعیت پیش از P1** را توصیف می‌کنند (زیرشاخص = ۰/۱۷).
در P1 فیلترِ «مرحلهٔ دانلود» برداشته شد و اکنون وضعیت این است:

| قابلیت | پیش از P1 | **پس از P1** | منبع تأمین |
|---|---|---|---|
| Headline CPI (۱۷ کشور) | ✅ ۱۷/۱۷ | ✅ ۱۷/۱۷ | BIS · OECD · IMF · WB · FRED · EUROSTAT · OWID |
| **Core CPI رسمی** | ۷/۱۷ | **✅ ۱۲/۱۷** | OECD `_TXCP01_NRG` (۱۲ کشور) + EUROSTAT `TOT_X_NRG_FOOD` (۴ کشور) + FRED (۸ کشور) |
| **زیرشاخص‌های COICOP** | ❌ ۰/۱۷ | **✅ ۱۷/۱۷** | OECD (۱۳–۱۶ کد/کشور) + EUROSTAT (۱۴ کد ×۲ برای EU-4) + FRED (۱۰ کد آمریکا) |
| **وزن سبد مصرف‌کننده** | ❌ ۰/۱۷ | **⚠️ ۳/۱۷** | EUROSTAT `prc_hicp_iw` (‰) — فقط DEU/FRA/ITA کامل؛ GBR فقط `TOTAL` |

### کشورهای دارای Core رسمی (۱۲)
```
USA · DEU · GBR · FRA · ITA · CAN · AUS · KOR · JPN · TUR · MEX · ZAF
```
### 🆕 هستهٔ محاسباتی Hybrid برای ۵ کشور باقی‌مانده (`DERIVED_CORE_CPI`)
```
CHN · IND · BRA · RUS · SAU
```
چون نه Core رسمی دارند و نه وزن سبد، `build_core_db.cjs` یک سری **محاسباتی**
می‌سازد (`DERIVED.<ISO3>.DERIVED_CORE_CPI.M`) و روش/قطعه‌های ساخت را در ستون
`unit` سری ثبت می‌کند (در API با کلید `unit_raw` دیده می‌شود).

**موتور Hybrid (سه قطعه):**
1. **هستهٔ واقعی**: میانگین پیرایش‌شدهٔ YoY گروه‌های COICOP  → تا نقطهٔ انقطع OECD
2. **FRED** (اگر سری هستهٔ آن کشور در دیتابیس موجود و در فاصله داده داشته باشد)
3. **تمدید روند**: میانگین متحرک **۱۲ماههٔ پسرو** تورم کل (BIS ماهانه) → تا آخرین ماه موجود (۲۰۲۶)

| کشور | نقاط | بازه | هستهٔ COICOP تا | FRED | تمدید MA | پرش مرز |
|---|---:|---|---|---|---:|---|
| **RUS** | ۲۵۹ | 2005-01 → **2026-07** | 2022-02 | ندارد | ۵۳ ماه | +1.23pp |
| **BRA** | ۲۸۳ | 2003-01 → **2026-07** | 2019-07 | ندارد | ۸۴ ماه | +0.95pp |
| **IND** | ۱۵۰ | 2014-01 → **2026-06** | 2019-05 | ندارد | ۸۵ ماه | −0.35pp |
| **SAU** | ۱۷۵ | 2012-01 → **2026-07** | 2025-07 | ندارد | ۱۲ ماه | +1.28pp |
| **CHN** | ۳۵۶ | 1996-12 → **2026-07** | — (۱ گروه) | ندارد | ۳۵۶ ماه | — |

- **پیوستگی:** صفر گپ ماهانه در هر ۵ سری (اعتبارسنجی‌شده).
- **مقادیر جاری:** RUS 6.39٪ · BRA 4.53٪ · IND 2.32٪ · SAU 1.91٪ · CHN 0.62٪ (۲۰۲۶-۰۷).
- **FRED برای این ۵ کشور سری هسته ندارد** (۰ از ۳۰ نامزد بررسی‌شده) ⇒ قطعهٔ ۲ همیشه خالی است
  و همین در `unit` صریحاً نوشته می‌شود: `no FRED core series for this country`.
- **«پرش مرز» پنهان نمی‌شود:** اختلاف سطح بین آخرین نقطهٔ هستهٔ واقعی و اولین نقطهٔ تمدید
  در `unit` گزارش می‌شود (`junction step +1.23pp at 2022-03`). آستانهٔ اصلاح خودکار
  `HYBRID_SPLICE_MAX_GAP = 2.0` (واحد درصد) است؛ اگر از آن بگذرد، آفستِ میانگین
  هم‌پوشانی ۱۲ماهه اعمال و در `unit` با `level-spliced` علامت‌گذاری می‌شود.
- ⚠️ چند ماه آخر هر سری «هستهٔ محاسباتی» است، نه دادهٔ رسمی — این در Tooltip چارت
  (فیلد `unit_raw`) دیده می‌شود.

> ℹ️ محدودیت باقی‌مانده: بازهٔ **هستهٔ واقعی** برای هند/برزیل/روسیه همان‌جایی تمام می‌شود
> که OECD گروه‌های COICOP را قطع کرده است. برای هستهٔ رسمی جدید در این بازه‌ها باید
> منبع ملی (MoSPI هند / IBGE برزیل / Rosstat) افزوده شود؛ تمدید فعلی «روند تورم کل» است.

⇒ **پوشش Core از ۷/۱۷ (پیش از P1) به ۱۷/۱۷ رسید** (۱۲ رسمی + ۵ محاسباتی).

### ❌ IMF زیرشاخص COICOP ندارد (بررسی رسمی)
| سنجه | نتیجه |
|---|---|
| کاتالوگ `DataMapper` | **۱۳۲ اندیکاتور** — تنها ۴ کد تورمی: `PCPIPCH` · `PCPIEPCH` · `PCPI_PCH` · `PCPIE_PCH` (همه «کل») |
| ۱۵ کد نامزد COICOP (`PCPIFOOD`/`PCPICORE`/`PCPI_X_NRG_FOOD`…) | **هیچ‌کدام موجود نیست** |
| مسیر SDMX (`dataservices.imf.org`) | از این هاست **در دسترس نیست** (HTTP 000) |

دانلودر IMF اکنون این را **در زمان اجرا بررسی و گزارش** می‌کند؛ اگر IMF روزی
این کدها را منتشر کند، بدون تغییر کد خودکار برداشته می‌شوند:
```bash
node collector/macro/offline/imf/download_imf_offline.cjs --force
# ⛔ No COICOP sub-index code in the IMF DataMapper catalogue (checked 15 candidates)
```

### زیرشاخص‌های موجود به تفکیک منبع
| منبع | کشورها | کدها |
|---|---|---|
| **OECD** `cpi_sub.csv` | ۱۷/۱۷ | `_T` · **`_TXCP01_NRG`** · `_TXNRG_01_02` · CP01..CP12 · `CP045_0722` · `SERV` · `GD` |
| **EUROSTAT** `cpi_index_sub.csv` + `cpi_yoy_sub.csv` | DEU · FRA · ITA · GBR | CP00..CP12 · `CP045` · `CP071` · `CP0722` · `NRG` · `FOOD` · `IGD` · `SERV` · `TOT_X_NRG` · **`TOT_X_NRG_FOOD`** (× دو حالت: شاخص و نرخ) |
| **FRED** `cpi_sub.csv` | USA | `CPIFABSL` (خوراک) · `CPIENGSL` (انرژی) · `CPIHOSSL` (مسکن) · `CUUR0000SAF11`/`SAF112` · `CUUR0000SAH1`/`SEHA` (مسکن/اجاره) · `CUUR0000SETB01` (بنزین) · `CUUR0000SEHF01` (برق) · `CUUR0000SETA01` (خودرو) |

### نکات کیفی مهم (باید در چارت رعایت شود)
- `JPN` هستهٔ OECD **تا 2021-06** متوقف است · `MEX` تا 2024-07 · `ZAF` تا 2024-12 ⇒ در چارت باید «کهنگی» برچسب بخورد.
- `AUS` فقط **فصلی** (Q) منتشر می‌شود (نه ماهانه).
- `CHN` در OECD فقط `CP01` (خوراک) را دارد ⇒ ۱ کد از ۱۷.
- OECD و Eurostat **نرخ YoY رسمی** برای این گروه‌ها منتشر نمی‌کنند (کلید `TRANSFORMATION=GY` → NoRecordsFound؛ OECD وزن هم 404) ⇒ نرخ از خود شاخص محاسبه می‌شود.

### فایل‌های خام جدید و اندازه‌ها
| فایل | ردیف | کشور | توضیح |
|---|---:|---:|---|
| `offline/oecd/cpi_sub.csv` | ۷۵,۴۸۷ | ۱۷ | شاخص COICOP (OECD)` |
| `offline/eurostat/cpi_index_sub.csv` | ۱۲۱,۰۹۷ | ۱۶ | شاخص COICOP (Eurostat) |
| `offline/eurostat/cpi_yoy_sub.csv` | ۱۱۶,۸۷۳ | ۱۶ | نرخ سالانهٔ COICOP (Eurostat) |
| `offline/eurostat/cpi_weights.csv` | ۵,۹۰۱ | ۱۶ | وزن سبد (‰، جمع = ۱۰۰۰) |
| `offline/fred/cpi_sub.csv` | ۸,۸۱۷ | ۱ | ۱۰ زیرشاخص CPI آمریکا |

> 📄 ریز جزئیات پیاده‌سازی: `MACRO_SOURCE_INVENTORY.md` §۲.۳ (لایهٔ ۳) — و اسکریپت‌های دانلود:
> `offline/{eurostat,oecd,fred}/download_*_offline.cjs` + `core_db/build/build_core_db.cjs` (canonicalهای `CPI_SUB` و `CPI_WEIGHTS`).

---

## ۰) در کدام دیتابیس جست‌وجو شد؟ (خواندن این بخش الزامی است)

در این پروژه **دو دیتابیس** داریم و **هر دو** اسکن شدند:

```
۷ منبع (BIS/IMF/WB/OECD/FRED/EUROSTAT/OWID)
        │
        │  دانلود + loader  (db_build/main_offline_loader.cjs)
        ▼
   macro.db  ← «خام/اصلی»  →  ۴۰۵,۵۳۴ سری  ·  ۱۲,۱۲۷,۹۷۱ نقطه   (اتحاد همهٔ دانلودها)
        │                          ↑ این‌جا «آیا داده را داریم؟» بررسی می‌شود (وسیع‌ترین تور)
        │  فیلتر: ۱۴ کانونیکال × ۱۷ کشور × M/Q/A  (core_db/build/build_core_db.cjs)
        ▼
   core.db   ← «curated»   →  ۱,۴۸۹ سری  ·  ۱۲۳,۰۹۶ نقطه        (دقیقاً همان چیزی که API/چارت می‌بیند)
```

### نتیجهٔ مقایسه‌ای (اجرای واقعی)

| پرسش | `macro.db` (خام) | `core.db` (curated) |
|---|---:|---:|
| تعداد سری | **۴۰۵,۵۳۴** | **۱,۴۸۹** |
| تعداد نقاط داده | **۱۲,۱۲۷,۹۷۱** | **۱۲۳,۰۹۶** |
| تعداد کد متمایز (`dataset::indicator`) | **۱,۶۰۵** | **۱۰۰** |
| کدهای خانوادهٔ قیمت/تورم (CPI/HICP/PPI/DEFL) | **۲۸** | **۱۷** |
| **کدهای زیرشاخص** (COICOP / FOOD / ENERGY / UTIL / HOUSING) | **۰** | **۰** |
| **کدهای وزن سبد** (WEIGHT / BASKET / IW) | **۰** | **۰** |
| جدول‌ها | `series`, `data`, `sources`, `inflation_targets` | `series`, `data`, `sources` |

### تفسیر (نکتهٔ کلیدی)
- `core.db` **زیرمجموعهٔ فیلترشدهٔ** `macro.db` است ⇒ اگر چیزی در `core.db` نباشد، ممکن است در `macro.db` باشد.
- پس برای پاسخ «آیا زیرشاخص/وزن **داریم**؟» باید **`macro.db`** را نگاه کرد (۱,۶۰۵ کد = تمام دانلودها).
- و برای پاسخ «چه چیزی **به چارت می‌رسد**؟» باید **`core.db`** را نگاه کرد (۱۰۰ کد).
- **یافتهٔ «صفر زیرشاخص / صفر وزن» روی `macro.db` تأیید شد** ⇒ یعنی این داده‌ها **هرگز دانلود نشده‌اند**، نه این‌که فیلتر آن‌ها را حذف کرده باشد.
- کل سند زیر (بخش‌های ۱ تا ۵) همین دو نگاه را با هم گزارش می‌کند؛ لطفاً هر یافته را با همین دو ستون بخوانید.

---

## ۱) اسکیمای جداول (Schema)

### `macro.db` (خام، ۷,۲۸۵.۶ MB) — ۴ جدول
| جدول | ردیف | ستون‌ها |
|---|---|---|
| `series` | **۴۰۵,۵۳۴** | `series_id` (PK) · `dataset` · `country` · `indicator` · `frequency` · `unit` · `source` |
| `data` | **۱۲,۱۲۷,۹۷۱** | `series_id` · `date` · `value` · `revision_id` · `valid_from` · `valid_to` |
| `sources` | ۷ | `source_id` (PK) · `name` · `url` · `update_frequency` · `last_update` |
| `inflation_targets` | ۱۸ | `country` (PK) · `low` · `high` · `note` |

### `core.db` (curated، ۱۶.۹ MB) — ۳ جدول
`series` ۱,۴۸۹ · `data` ۱۲۳,۰۹۶ · `sources` ۷ — همان ستون‌ها + ایندکس `idx_series_lookup(dataset,country,indicator,frequency)`

### ⚠️ نتیجهٔ مهم برای زیرشاخص‌ها و وزن‌ها
> **هیچ جدول یا ستونی برای «زیرشاخص‌های CPI» (Food/Energy/Utilities/…) و «وزن‌های سبد مصرف‌کننده» وجود ندارد.**
> مدل داده **کاملاً عمومی** است: هر چیز یک ردیف در `series` با یک `indicator` متنی است. زیرشاخص‌ها فقط در صورت وجود، کد جدا (مثل `CP01` / `CPI_FOOD`) می‌گرفتند که **هیچ‌کدام در دیتابیس نیست**.
> تنها جدول «متادیتای دامنه‌ای» = `inflation_targets` که **هدف تورمی** است، نه وزن سبد.

---

## ۲) موجودیت داده به تفکیک نوع و کشور

### ۲.۱ Headline CPI — ✅ ۱۷ از ۱۷ کشور (۵ منبع مستقل)
| منبع | کد | فرکانس | پوشش |
|---|---|---|---|
| BIS | `CPI_IDX` / `CPI_YOY` (WS_LONG_CPI: 628/771) | M, A | **۱۷/۱۷** |
| OECD | `CPI_IDX` / `CPI_YOY` (KEI) | M, Q, A | **۱۷/۱۷** |
| World Bank | `FP.CPI.TOTL` (شاخص) / `FP.CPI.TOTL.ZG` (٪ YoY) | A | **۱۷/۱۷** |
| IMF | `PCPIPCH` / `PCPIEPCH` (شامل پیش‌بینی تا ۲۰۳۱) | A | **۱۷/۱۷** |
| OWID | `CPI` | A | **۱۷/۱۷** |
| FRED | `CPIAUCSL` | M | ۱/۱۷ (USA) |
| EUROSTAT | `HICP_ANR` / `HICP_MIDX` (COICOP=`CP00` = همهٔ اقلام) | M | ۴/۱۷ (DEU, FRA, ITA, GBR) |

### ۲.۲ Core CPI — ✅ ۷ از ۱۷ کشور
| کشور | سری FRED | نوع | بازهٔ داده |
|---|---|---|---|
| USA | `CPILFESL` | index | 1957-01 … **2026-08** |
| DEU | `DEUCPHPLA01GYM` + `DEUCPHPLA01IXOBM` | rate + index | … 2025-04 |
| FRA | `FRACPHPLA01GYM` + `FRACPHPLA01IXOBM` | rate + index | … 2025-04 |
| ITA | `ITACPHPLA01GYM` + `ITACPHPLA01IXOBM` | rate + index | … 2025-04 |
| GBR | `GBRCPHPLA01IXOBM` + `CPGRLE01GBM659N` | index + rate | … 2025-03 |
| CAN | `CPGRLE01CAM659N` | rate | … 2025-03 |
| KOR | `CPGRLE01KRM659N` | rate | … 2025-04 |
### ۲.۳ زیرشاخص‌های CPI (Food / Energy / Utilities / Housing / Transport) — ❌ **۰ از ۱۷**
هیچ کد COICOP تفکیکی در دیتابیس نیست. **علت ریشه‌ای (از فایل‌های خام محلی):**
| منبع خام | چه چیزی دانلود شده | زیرشاخص؟ |
|---|---|---|
| `offline/eurostat/cpi_index.csv` + `cpi_yoy.csv` | فقط `COICOP = CP00` (همهٔ اقلام) | ❌ |
| `offline/bis/WS_LONG_CPI_csv_col.csv` | فقط `UNIT_MEASURE ∈ {628 = Index, 771 = YoY}` | ❌ |
| `offline/oecd/cpi.csv` | فقط `INDICATOR = CPI_IDX` (MEASURE = `CP`) | ❌ |
| `offline/fred/core_cpi.csv` | فقط تورم کل/هسته (بدون زیرشاخص‌های CUUR*) | ❌ |
| `offline/imf/*.csv` | WEO/IFS/GFS — بدون COICOP | ❌ |
| `offline/worldbank/WDI_CSV/WDISeries.csv` | ۱,۴۹۸ کد؛ جست‌وجوی «قیمت خوراک/انرژی» = **۰ نتیجهٔ قیمتی** | ❌ |

### ۲.۴ وزن‌های سبد مصرف‌کننده — ❌ **۰ از ۱۷**
جست‌وجوی `weight|wgt|basket|iw` در کل **۴۰۵,۵۳۴ سری** ⇒ **هیچ نتیجه**.
تنها ۲۲ نتیجهٔ «weight» در کاتالوگ WDI مربوط به وزن نوزاد/کودک است (بی‌ربط).
WDI، OECD-MEI و IMF-IFS **وزن سبد CPI منتشر نمی‌کنند**.

### ۲.۵ ⚠️ تصحیح یک برداشت قبلی (مهم برای تحلیل شما)
کدهای `WB::IE.PPI.ENGY.CD` / `IE.PPI.WATR.CD` / `IE.PPI.TRAN.CD` / `IE.PPI.ICTI.CD` (و twins با `IE.PPN`) **شاخص قیمت نیستند**. نام رسمی آن‌ها از کاتالوگ WDI:
```
IE.PPI.ENGY.CD → Investment in energy with private participation (current US$)        ← «سرمایه‌گذاری»، نه قیمت
IE.PPI.WATR.CD → Investment in water and sanitation with private participation (US$)
IE.PPI.TRAN.CD → Investment in transport with private participation (US$)
IE.PPI.ICTI.CD → Investment in ICT with private participation (US$)
IE.PPN.*       → Public private partnerships investment in … (current US$)
```
پس **جانشین زیرشاخص قیمتی نمی‌شوند**؛ این عبارت «PPI» در کد به معنای «Private Participation in Infrastructure» است، نه Producer Price Index.

### ۲.۶ آنچه واقعاً «قیمتی و زیرسطحی» داریم (فهرست کامل)
| کد | معنا | سطح | پوشش | فرکانس |
|---|---|---|---|---|
| `OECD::PPI` | شاخص قیمت **تولیدکننده** (کل) | کل بخش تولید | ۹/۱۷ (USA,CHN,DEU,GBR,FRA,ITA,CAN,AUS,TUR) | M, Q, A |
| `FRED::PPIACO` · `FRED::PPIFIS` | PPI آمریکا (کل کالا / تقاضای نهایی) | کل | ۱/۱۷ | M |
| `WB::NY.GDP.DEFL.KD.ZG` · `NY.GDP.DEFL.ZS(.AD)` | دیفلاتور GDP | اقتصاد کل | ۱۷/۱۷ | A |
| `WB::NE.DAB.DEFL.ZS` | دیفلاتور مخارج ملی | اقتصاد کل | ۱۷/۱۷ | A |
| `BIS::PROPERTY_PRICES` · `BIS::SHARE_PRICES` | قیمت مسکن / سهام (دارایی، نه مصرف) | دارایی | ۸/۱۷ · ۱۶/۱۷ | Q |
| `WB::AG.PRD.FOOD.XD` | **شاخص تولید** خوراک (مقداری، نه قیمتی) | بخش کشاورزی | ۱۷/۱۷ | A |
| `WB::TX/TM.VAL.FOOD.ZS.UN` | سهم خوراک در تجارت (٪) | تجارت | ۱۷/۱۷ | A |

> **جمع‌بندی:** تنها «شاخص قیمت زیرسطحی» موجود `OECD::PPI` است (کل، نه تفکیک انرژی/خوراک) و برای ۹ کشور.


---

## ۳) ماتریس نهایی ۱۷ کشور

| ISO3 | Headline | **Core** | CPI-Food | CPI-Energy | CPI-Utilities | PPI (کل) | Weights |
|---|---|---|---|---|---|---|---|
| **USA** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (FRED) | ❌ |
| **DEU** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **FRA** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **ITA** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **GBR** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **CAN** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **KOR** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **JPN** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CHN** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **AUS** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **IND** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **TUR** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **MEX** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **BRA** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RUS** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SAU** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ZAF** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### ۳.۱ غایبین: کشورهای «بدون Core CPI» (۱۰ کشور)
```
JPN · CHN · AUS · IND · TUR · MEX · BRA · RUS · SAU · ZAF
```
**هیچ‌کدام زیرشاخص (Food / Energy / Utilities) هم ندارند** ⇒ برای این ۱۰ کشور **نه Core آماده داریم و نه اجزای لازم برای محاسبهٔ Core با فرمول حذفی**.

### ۳.۲ امکان‌سنجی روش‌های «محاسبهٔ Core با فرمول»
| روش | نیاز | وضعیت ما |
|---|---|---|
| (الف) هستهٔ آمادهٔ منتشرشده | سری Core از ناشر | ✅ فقط **۷** کشور |
| (ب) حذف (CPI − Food − Energy) با وزن سبد | اجزای COICOP + وزن | ❌ هیچ‌کدام (۰ جزء، ۰ وزن) |
| (ج) حذف با وزن ضمنی از سهم هزینه | سهم هزینهٔ هر گروه | ❌ نداریم |
| (د) Trimmed-mean / Median | ریزدادهٔ اقلام یا سری‌های ویژه | ❌ نداریم |
| (هـ) پروکسی با PPI بخشی | PPI انرژی/خوراک تفکیکی | ❌ نداریم (`IE.PPI.*` سرمایه‌گذاری است؛ `OECD::PPI` کل است) |
| (و) Core آماری/مدلی (روند، فیلتر کالمن، میانگین متحرک) | فقط سری Headline | ✅ عملی — ولی «رسمی» نیست |

**نتیجه:** برای ۱۰ کشور باقی‌مانده، هر Core امروزی یا **پروکسی آماری** است (و) یا نیازمند **ingest جدید** (ب/د):
- **COICOP تفکیکی**: OECD `DSD_PRICES@DF_PRICES_ALL` (خارج از flowهای فعلی `KEI/QNA/MEI_CLI`) و Eurostat `prc_hicp_midx` با `COICOP = TOT_X_NRG_FOOD`
- **وزن سبد**: Eurostat `prc_hicp_iw` / OECD COICOP weights

---

## ۴) جدول مرجع: `inflation_targets` (۱۸ ردیف — هدف تورمی، نه وزن)
```
AUS 2–3 (RBA) · BRA 3 (BCB) · CAN 2 (BoC) · CHE 0–2 (SNB) · CHN NULL (PBoC؛ بدون هدف نقطه‌ای)
DEU/ESP/EUR/FRA/ITA 2 (ECB) · GBR 2 (BoE) · IND 2–6 (RBI) · JPN 2 (BoJ) · KOR 2 (BoK)
NOR 2 (Norges) · NZL 1–3 (RBNZ) · SWE 2 (Riksbank) · USA 2 (Fed)
```

---

## ۵) خلاصهٔ یک‌پاراگرافی
دیتابیس ما برای تورم **۲ لایه** دارد: `Headline CPI` برای هر ۱۷ کشور از ۵ منبع (با ۴ فرکانس)، و `Core CPI` برای ۷ کشور (۶ تای آن‌ها امروز اضافه شد).
اما **لایهٔ سوم — زیرشاخص‌ها و وزن‌های سبد — کاملاً غایب است**؛ نه در جداول، نه در فایل‌های خام محلی. به همین دلیل:
هر محاسبهٔ فرمولی Core برای ۱۰ کشور باقی‌مانده امروز **ممکن نیست** و نیاز به ingest جدید (COICOP OECD/Eurostat) دارد؛
در عوض، برای ۷ کشور موجود می‌توان Core را با Headline مقایسه و «شکاف هسته» را بدون هیچ داده‌ای محاسبه کرد.

