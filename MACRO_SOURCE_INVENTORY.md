# گزارش جامع منابع داده — `macro.db`

> **تاریخ اجرا:** 2026-09-20 18:11:14 · **اسکریپت:** `collector/macro/tools/data_inventory/source_report.cjs`
> **دیتابیس:** `collector/macro/db/macro.db` (7285.6 MB)
> این گزارش کل دیتابیس خام را اسکن می‌کند و برای هر ۷ منبع نشان می‌دهد چه کدهایی ذخیره شده‌اند.

---

## ۰) خلاصهٔ اجرایی

| منبع | سری | نقاط داده | کشورها | کدهای شاخص | کدهای قیمتی | Headline | Core | زیرشاخص | وزن سبد |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **BIS** | 2,456 | 2,800,462 | 256 | 29 | 5 | 3 | — | — | — |
| **IMF** | 4,485 | 166,996 | 265 | 35 | 5 | 4 | — | — | — |
| **WB** | 396,970 | 9,015,914 | 265 | 1,498 | 9 | 2 | — | — | — |
| **OECD** | 1,686 | 144,432 | 60 | 29 | 20 | 5 | 1 | 13 | — |
| **FRED** | 36 | 52,008 | 8 | 36 | 18 | 1 | 15 | — | — |
| **EUROSTAT** | 1,006 | 268,075 | 16 | 64 | 59 | 10 | 4 | 44 | 1 |
| **OWID** | 192 | 9,262 | 192 | 1 | 1 | 1 | — | — | — |
| **جمع** | **406,831** | **12,457,149** | — | **1,692** | **117** | | | | |

**پاسخ یک‌خطی:** از 1,692 کد شاخص، 117 کد قیمتی/تورمی است: **26 Headline** · **20 Core** · **57 زیرشاخص** · **1 وزن سبد**.

---

## ۱) فهرست کامل کدهای شاخص به تفکیک منبع

### ۱.۰ همهٔ «کدهای قیمتی» در یک نگاه

| # | منبع::کد | خانواده | نوع | سری (۱۷ کشور) | در core.db؟ | واحد | فرکانس |
|---:|---|---|---|---:|:--:|---|---|
| 1 | `BIS::CPI` | Headline (تورم کل) | Headline | 34 | — | 771,628 | A,M |
| 2 | `BIS::CPI_IDX` | Headline (تورم کل) | Headline | 34 | ✅ | 628 | M,A |
| 3 | `BIS::CPI_YOY` | Headline (تورم کل) | Headline | 34 | ✅ | 771 | A,M |
| 4 | `BIS::PROPERTY_PRICES` | سایر شاخص‌های قیمت | Price(other) | 10 | — | — | A,Q,U,M,H |
| 5 | `BIS::SHARE_PRICES` | سایر شاخص‌های قیمت | Price(other) | 16 | — | 771,628 | Q |
| 6 | `EUROSTAT::HICP_ANR` | Headline (تورم کل) | Headline | 4 | ✅ | % | M |
| 7 | `EUROSTAT::HICP_ANR_CP00` | Headline (تورم کل) | Headline | 4 | — | % | M |
| 8 | `EUROSTAT::HICP_ANR_CP01` | زیرشاخص: خوراک | Sub | 4 | ✅ | % | M |
| 9 | `EUROSTAT::HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 10 | `EUROSTAT::HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 11 | `EUROSTAT::HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | Sub | 4 | ✅ | % | M |
| 12 | `EUROSTAT::HICP_ANR_CP045` | زیرشاخص: انرژی | Sub | 4 | ✅ | % | M |
| 13 | `EUROSTAT::HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 14 | `EUROSTAT::HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 15 | `EUROSTAT::HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 16 | `EUROSTAT::HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 17 | `EUROSTAT::HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 18 | `EUROSTAT::HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 19 | `EUROSTAT::HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 20 | `EUROSTAT::HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 21 | `EUROSTAT::HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 22 | `EUROSTAT::HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | % | M |
| 23 | `EUROSTAT::HICP_ANR_FOOD` | زیرشاخص: خوراک | Sub | 4 | ✅ | % | M |
| 24 | `EUROSTAT::HICP_ANR_IGD` | Headline (تورم کل) | Headline | 4 | ✅ | % | M |
| 25 | `EUROSTAT::HICP_ANR_NRG` | Headline (تورم کل) | Headline | 4 | ✅ | % | M |
| 26 | `EUROSTAT::HICP_ANR_SERV` | Headline (تورم کل) | Headline | 4 | ✅ | % | M |
| 27 | `EUROSTAT::HICP_ANR_TOT_X_NRG` | Core (هسته) | Core | 4 | ✅ | % | M |
| 28 | `EUROSTAT::HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | Core | 4 | ✅ | % | M |
| 29 | `EUROSTAT::HICP_IW_CP01` | زیرشاخص: خوراک | Sub | 3 | ✅ | per_mille | A |
| 30 | `EUROSTAT::HICP_IW_CP02` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 31 | `EUROSTAT::HICP_IW_CP03` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 32 | `EUROSTAT::HICP_IW_CP04` | زیرشاخص: مسکن/آب/برق | Sub | 3 | ✅ | per_mille | A |
| 33 | `EUROSTAT::HICP_IW_CP05` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 34 | `EUROSTAT::HICP_IW_CP06` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 35 | `EUROSTAT::HICP_IW_CP07` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 36 | `EUROSTAT::HICP_IW_CP08` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 37 | `EUROSTAT::HICP_IW_CP09` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 38 | `EUROSTAT::HICP_IW_CP10` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 39 | `EUROSTAT::HICP_IW_CP11` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 40 | `EUROSTAT::HICP_IW_CP12` | زیرشاخص: سایر گروه‌ها | Sub | 3 | ✅ | per_mille | A |
| 41 | `EUROSTAT::HICP_IW_TOTAL` | وزن سبد (CPI weights) | Weights | 4 | ✅ | per_mille | A |
| 42 | `EUROSTAT::HICP_MIDX` | Headline (تورم کل) | Headline | 4 | ✅ | index | M |
| 43 | `EUROSTAT::HICP_MIDX_CP00` | Headline (تورم کل) | Headline | 4 | — | index | M |
| 44 | `EUROSTAT::HICP_MIDX_CP01` | زیرشاخص: خوراک | Sub | 4 | ✅ | index | M |
| 45 | `EUROSTAT::HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 46 | `EUROSTAT::HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 47 | `EUROSTAT::HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | Sub | 4 | ✅ | index | M |
| 48 | `EUROSTAT::HICP_MIDX_CP045` | زیرشاخص: انرژی | Sub | 4 | ✅ | index | M |
| 49 | `EUROSTAT::HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 50 | `EUROSTAT::HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 51 | `EUROSTAT::HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 52 | `EUROSTAT::HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 53 | `EUROSTAT::HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 54 | `EUROSTAT::HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 55 | `EUROSTAT::HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 56 | `EUROSTAT::HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 57 | `EUROSTAT::HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 58 | `EUROSTAT::HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | Sub | 4 | ✅ | index | M |
| 59 | `EUROSTAT::HICP_MIDX_FOOD` | زیرشاخص: خوراک | Sub | 4 | ✅ | index | M |
| 60 | `EUROSTAT::HICP_MIDX_IGD` | Headline (تورم کل) | Headline | 4 | ✅ | index | M |
| 61 | `EUROSTAT::HICP_MIDX_NRG` | Headline (تورم کل) | Headline | 4 | ✅ | index | M |
| 62 | `EUROSTAT::HICP_MIDX_SERV` | Headline (تورم کل) | Headline | 4 | ✅ | index | M |
| 63 | `EUROSTAT::HICP_MIDX_TOT_X_NRG` | Core (هسته) | Core | 4 | ✅ | index | M |
| 64 | `EUROSTAT::HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | Core | 4 | ✅ | index | M |
| 65 | `FRED::CPGRLE01CAM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 66 | `FRED::CPGRLE01DEM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 67 | `FRED::CPGRLE01FRM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 68 | `FRED::CPGRLE01GBM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 69 | `FRED::CPGRLE01ITM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 70 | `FRED::CPGRLE01KRM659N` | Core (هسته) | Core | 1 | ✅ | index | M |
| 71 | `FRED::CPIAUCSL` | Headline (تورم کل) | Headline | 1 | ✅ | index | M |
| 72 | `FRED::CPILFESL` | Core (هسته) | Core | 1 | ✅ | index | M |
| 73 | `FRED::DEUCPHPLA01GYM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 74 | `FRED::DEUCPHPLA01IXOBM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 75 | `FRED::FRACPHPLA01GYM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 76 | `FRED::FRACPHPLA01IXOBM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 77 | `FRED::GBRCPHPLA01IXOBM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 78 | `FRED::ITACPHPLA01GYM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 79 | `FRED::ITACPHPLA01IXOBM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 80 | `FRED::PPIACO` | PPI (قیمت تولیدکننده) | PPI | 1 | ✅ | index | M |
| 81 | `FRED::PPIFIS` | PPI (قیمت تولیدکننده) | PPI | 1 | ✅ | index | M |
| 82 | `FRED::TURCPHPLA01IXOBM` | Core (هسته) | Core | 1 | ✅ | index | M |
| 83 | `IMF::EREER` | سایر شاخص‌های قیمت | Price(other) | 1 | — | — | A |
| 84 | `IMF::PCPI_PCH` | Headline (تورم کل) | Headline | 1 | — | — | A |
| 85 | `IMF::PCPIE_PCH` | Headline (تورم کل) | Headline | 1 | — | — | A |
| 86 | `IMF::PCPIEPCH` | Headline (تورم کل) | Headline | 17 | ✅ | — | A |
| 87 | `IMF::PCPIPCH` | Headline (تورم کل) | Headline | 17 | ✅ | — | A |
| 88 | `OECD::CPI_IDX` | Headline (تورم کل) | Headline | 51 | ✅ | index | M,Q,A |
| 89 | `OECD::CPI_IDX_CP01` | زیرشاخص: خوراک | Sub | 17 | ✅ | index | Q,M |
| 90 | `OECD::CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 91 | `OECD::CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 92 | `OECD::CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | Sub | 16 | ✅ | index | Q,M |
| 93 | `OECD::CPI_IDX_CP045_0722` | زیرشاخص: انرژی | Sub | 12 | ✅ | index | Q,M |
| 94 | `OECD::CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 95 | `OECD::CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 96 | `OECD::CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 97 | `OECD::CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 98 | `OECD::CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 99 | `OECD::CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 100 | `OECD::CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 101 | `OECD::CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | Sub | 16 | ✅ | index | Q,M |
| 102 | `OECD::CPI_IDX_GD` | Headline (تورم کل) | Headline | 9 | ✅ | index | Q,M |
| 103 | `OECD::CPI_IDX_SERV` | Headline (تورم کل) | Headline | 9 | ✅ | index | Q,M |
| 104 | `OECD::CPI_IDX_TOTAL` | Headline (تورم کل) | Headline | 17 | — | index | Q,M |
| 105 | `OECD::CPI_IDX_TXCP01_NRG` | Core (هسته) | Core | 12 | ✅ | index | Q,M |
| 106 | `OECD::CPI_YOY` | Headline (تورم کل) | Headline | 51 | ✅ | % | M,Q,A |
| 107 | `OECD::PPI` | PPI (قیمت تولیدکننده) | PPI | 24 | ✅ | index | M,Q,A |
| 108 | `OWID::CPI` | Headline (تورم کل) | Headline | 17 | ✅ | index_2010_100 | A |
| 109 | `WB::FP.CPI.TOTL` | Headline (تورم کل) | Headline | 17 | ✅ | — | A |
| 110 | `WB::FP.CPI.TOTL.ZG` | Headline (تورم کل) | Headline | 17 | ✅ | — | A |
| 111 | `WB::NE.DAB.DEFL.ZS` | دِفلاتور | Deflator | 17 | — | — | A |
| 112 | `WB::NY.GDP.DEFL.KD.ZG` | دِفلاتور | Deflator | 17 | ✅ | — | A |
| 113 | `WB::NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | Deflator | 17 | — | — | A |
| 114 | `WB::NY.GDP.DEFL.ZS` | دِفلاتور | Deflator | 17 | — | — | A |
| 115 | `WB::NY.GDP.DEFL.ZS.AD` | دِفلاتور | Deflator | 17 | — | — | A |
| 116 | `WB::PX.REX.REER` | سایر شاخص‌های قیمت | Price(other) | 17 | — | — | A |
| 117 | `WB::TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | Price(other) | 17 | — | — | A |

> **یادداشت `BIS::CPI`:** این کد **قدیمی** و حاوی باگ «قاطی شدن شاخص و نرخ» است (واحدهای `771,628` در یک سری). از P0 به بعد با دو کد جداگانه جایگزین شده: `BIS::CPI_IDX` (۶۲۸) و `BIS::CPI_YOY` (۷۷۱). ردیف‌های قدیمی دست‌نخورده در `macro.db` مانده‌اند ولی به `core.db` نمی‌روند (`MACRO_DATA_INVENTORY.md` §۵).

### ۱.۱ توزیع کدها بر اساس خانواده

| خانواده | تعداد کد | مجموع سری | منابع دارای این خانواده |
|---|---:|---:|---|
| Headline (تورم کل) | 26 | 2,198 | BIS, EUROSTAT, FRED, IMF, OECD, OWID, WB |
| Core (هسته) | 20 | 91 | EUROSTAT, FRED, OECD |
| زیرشاخص: خوراک | 6 | 96 | EUROSTAT, OECD |
| زیرشاخص: انرژی | 3 | 44 | EUROSTAT, OECD |
| زیرشاخص: مسکن/آب/برق | 4 | 63 | EUROSTAT, OECD |
| زیرشاخص: سایر گروه‌ها | 44 | 694 | EUROSTAT, OECD |
| وزن سبد (CPI weights) | 1 | 16 | EUROSTAT |
| PPI (قیمت تولیدکننده) | 3 | 112 | FRED, OECD |
| دِفلاتور | 5 | 1,325 | WB |
| سایر شاخص‌های قیمت | 5 | 685 | BIS, IMF, WB |
| ⚠️ نام گمراه‌کننده (قیمت نیست) | 12 | 3,180 | WB |
| غیرقیمتی | 1563 | 398,327 | BIS, EUROSTAT, FRED, IMF, OECD, WB |

### ۱.۲ فهرست کدهای هر منبع (کامل برای منابع کوچک، قیمتی برای WB)

**BIS** — 2,456 سری · 256 کشور · 29 کد · 2,800,462 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `USD_EXCHANGE_RATE` | — | 658 | 192 | D,M,Q,A | — |
| `DEBT_SECURITIES` | — | 170 | 170 | Q | — |
| `BANK_ACCOUNTS` | — | 159 | 53 | Q,A,M | XDC,USD,XDF_R_B1GQ |
| `EFFECTIVE_EXCHANGE_RATE` | — | 128 | 64 | M,D | — |
| `CPI` | Headline (تورم کل) | 126 | 63 | A,M | 771,628 |
| `CPI_IDX` | Headline (تورم کل) | 126 | 63 | M,A | 628 |
| `CPI_YOY` | Headline (تورم کل) | 126 | 63 | A,M | 771 |
| `FINANCIAL_ACCOUNTS` | — | 115 | 60 | Q,A | USD,EUR,JPY,HUF,SEK,RON,CAD,HKD,DKK,RUB,SGD,CHF,ILS,PEN,SAR,PKR,MYR,CLP,ISK,YR |
| `POLICY_RATE` | — | 98 | 49 | M,D | — |
| `DEBT_PROVISIONING` | — | 77 | 61 | Q,A,M,U,H | — |
| `EXTERNAL_DERIVATIVES` | — | 75 | 25 | Q,A,M | — |
| `SHARE_PRICES` | سایر شاخص‌های قیمت | 61 | 61 | Q | 771,628 |
| `OTC_DERIVATIVES_TOV` | — | 57 | 57 | A | — |
| `LOANS` | — | 52 | 52 | Q | — |
| `TRADE_CREDIT` | — | 48 | 48 | Q | 367,USD,EUR,IDR,ILS,MYR,CLP,SAR,ARS,RUB,MXN,CNY,HKD |
| `CREDIT_GAP` | — | 44 | 44 | Q | — |
| `CREDIT` | — | 33 | 33 | Q | — |
| `DEBT_SERVICE_RATIO` | — | 32 | 32 | Q | — |
| `PROPERTY_PRICES` | سایر شاخص‌های قیمت | 29 | 26 | A,Q,U,M,H | — |
| `CARD_TX_VAL` | — | 28 | 28 | A | S,A,N,H,G,F |
| `PAYMENT_SYSTEMS` | — | 28 | 28 | A | EUR,INR,TRY,SGD,373,USD,HKD,GBP,ARS,BRL,RUB,SAR,AUD,KRW,CAD,MXN,SEK,JPY,IDR,CNY,ZAR |
| `CARD_TX_VOL` | — | 27 | 27 | A | I,A,N,Q,S,T,M,L,B,R |
| `PAYMENT_PARTICIPATION` | — | 27 | 27 | A | 373 |
| `PAYMENT_STATISTICS` | — | 27 | 27 | A | — |
| `CASHLESS` | — | 26 | 26 | A | BRL,KRW,MXN,EUR,RUB,JPY,SGD,AUD,SEK,CAD,INR,GBP,TRY,ARS,SAR,IDR,373,USD,ZAR,CNY,HKD |
| `PAYMENT_DEVICES` | — | 26 | 26 | A | 373 |
| `PAYMENT_INSTITUTIONS` | — | 26 | 26 | A | EUR,CAD,373,BRL,ARS,SEK,GBP |
| `GLOBAL_LIQUIDITY` | — | 25 | 25 | Q | 770,EUR,USD,JPY,771 |
| `OTC_DERIVATIVES_OUT` | — | 2 | 1 | U,H | — |

**IMF** — 4,485 سری · 265 کشور · 35 کد · 166,996 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `GGXCNL_NGDP` | — | 229 | 229 | A | — |
| `NGDPD` | — | 229 | 229 | A | — |
| `NGDPDPC` | — | 229 | 229 | A | — |
| `NGDP_RPCH` | — | 229 | 229 | A | — |
| `BCA_NGDPD` | — | 228 | 228 | A | — |
| `PCPIPCH` | Headline (تورم کل) | 228 | 228 | A | — |
| `PPPGDP` | — | 228 | 228 | A | — |
| `PPPPC` | — | 228 | 228 | A | — |
| `PCPIEPCH` | Headline (تورم کل) | 227 | 227 | A | — |
| `GGXWDG_NGDP` | — | 226 | 226 | A | — |
| `GGR_G01_GDP_PT` | — | 213 | 213 | A | — |
| `GGXONLB_G01_GDP_PT` | — | 205 | 205 | A | — |
| `PPPEX` | — | 197 | 197 | A | — |
| `LUR` | — | 122 | 122 | A | — |
| `GGXWDN_G01_GDP_PT` | — | 97 | 97 | A | — |
| `GG_DEBT_GDP` | — | 88 | 88 | A | — |
| `RESERVES_M` | — | 74 | 74 | A | — |
| `RESERVES_M2` | — | 73 | 73 | A | — |
| `BM_GDP` | — | 67 | 67 | A | — |
| `BT_GDP` | — | 67 | 67 | A | — |
| `BX_GDP` | — | 67 | 67 | A | — |
| `FDSAOP_GDP` | — | 67 | 67 | A | — |
| `FDSAOP_PCH` | — | 67 | 67 | A | — |
| `FMB_GDP` | — | 67 | 67 | A | — |
| `FMB_PCH` | — | 67 | 67 | A | — |
| `GGRXG_GDP` | — | 67 | 67 | A | — |
| `GGXCNLXG_GDP` | — | 67 | 67 | A | — |
| `GGXCNL_GDP` | — | 67 | 67 | A | — |
| `GGXWDG_GDP` | — | 67 | 67 | A | — |
| `GGX_GDP` | — | 67 | 67 | A | — |
| `NGDP_R_PCH` | — | 67 | 67 | A | — |
| `PCPIE_PCH` | Headline (تورم کل) | 67 | 67 | A | — |
| `PCPI_PCH` | Headline (تورم کل) | 67 | 67 | A | — |
| `ENEER` | — | 65 | 65 | A | — |
| `EREER` | سایر شاخص‌های قیمت | 65 | 65 | A | — |

**WB** — 396,970 سری · 265 کشور · 1498 کد · 9,015,914 نقطه

| کد | خانواده | نام رسمی (WDI) | سری | کشور | فرکانس | واحد |
|---|---|---|---:|---:|---|---|
| `AG.PRD.FOOD.XD` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Food production index (2014-2016 = 100) | 265 | 265 | A | — |
| `FP.CPI.TOTL` | Headline (تورم کل) | Consumer price index (2010 = 100) | 265 | 265 | A | — |
| `FP.CPI.TOTL.ZG` | Headline (تورم کل) | Inflation, consumer prices (annual % growth) | 265 | 265 | A | — |
| `HD_HCIP_EDUC_FE` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Human capital index plus (HCI+): education pillar score, female (scale 0–188) | 265 | 265 | A | — |
| `HD_HCIP_EDUC_MA` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Human capital index plus (HCI+): education pillar score, male (scale 0–188) | 265 | 265 | A | — |
| `HD_HCIP_EDUC_TO` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Human capital index plus (HCI+): education pillar score, total (scale 0–188) | 265 | 265 | A | — |
| `IE.PPI.ENGY.CD` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Investment in energy with private participation (current US$) | 265 | 265 | A | — |
| `IE.PPI.ICTI.CD` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Investment in ICT with private participation (current US$) | 265 | 265 | A | — |
| `IE.PPI.TRAN.CD` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Investment in transport with private participation (current US$) | 265 | 265 | A | — |
| `IE.PPI.WATR.CD` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Investment in water and sanitation with private participation (current US$) | 265 | 265 | A | — |
| `NE.DAB.DEFL.ZS` | دِفلاتور | Gross national expenditure deflator (base year varies by country) | 265 | 265 | A | — |
| `NY.GDP.DEFL.KD.ZG` | دِفلاتور | Inflation, GDP deflator (annual % growth) | 265 | 265 | A | — |
| `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | Inflation, GDP deflator, linked series (annual % growth) | 265 | 265 | A | — |
| `NY.GDP.DEFL.ZS` | دِفلاتور | GDP deflator (base year varies by country) | 265 | 265 | A | — |
| `NY.GDP.DEFL.ZS.AD` | دِفلاتور | GDP deflator, linked series (base year varies by country) | 265 | 265 | A | — |
| `PX.REX.REER` | سایر شاخص‌های قیمت | Real effective exchange rate index (2010 = 100) | 265 | 265 | A | — |
| `TM.VAL.FOOD.ZS.UN` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Food imports (% of merchandise imports) | 265 | 265 | A | — |
| `TM.VAL.FUEL.ZS.UN` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Fuel imports (% of merchandise imports) | 265 | 265 | A | — |
| `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | Net barter terms of trade index (2015 = 100) | 265 | 265 | A | — |
| `TX.VAL.FOOD.ZS.UN` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Food exports (% of merchandise exports) | 265 | 265 | A | — |
| `TX.VAL.FUEL.ZS.UN` | ⚠️ نام گمراه‌کننده (قیمت نیست) | Fuel exports (% of merchandise exports) | 265 | 265 | A | — |

> WB در کل **1,498 کد** دارد؛ بالا فقط کدهای قیمتی + نام‌های گمراه‌کننده آمده. بقیهٔ 1,477 کد غیرقیمتی‌اند → فهرست کامل در `MACRO_SOURCE_INVENTORY.json`.

**OECD** — 1,686 سری · 60 کشور · 29 کد · 144,432 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `EXPORT` | — | 159 | 53 | A,Q,M | USD |
| `IMPORT` | — | 159 | 53 | Q,M,A | USD |
| `CPI_YOY` | Headline (تورم کل) | 158 | 53 | M,Q,A | % |
| `CPI_IDX` | Headline (تورم کل) | 155 | 52 | M,Q,A | index |
| `INDPRO` | — | 153 | 52 | M,Q,A | index |
| `UNEMP_RATE` | — | 132 | 45 | M,Q,A | % |
| `PPI` | PPI (قیمت تولیدکننده) | 110 | 38 | M,Q,A | index |
| `GDP_VPV_QOQ` | — | 106 | 53 | Q,A | % |
| `GDP_VPV_YOY` | — | 106 | 53 | Q,A | % |
| `GDP_YOY` | — | 100 | 50 | Q,A | % |
| `ULC` | — | 74 | 37 | Q,A | index |
| `CLI` | — | 22 | 22 | M | index |
| `CPI_IDX_CP01` | زیرشاخص: خوراک | 17 | 17 | Q,M | index |
| `CPI_IDX_TOTAL` | Headline (تورم کل) | 17 | 17 | Q,M | index |
| `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | 16 | 16 | Q,M | index |
| `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | 16 | 16 | Q,M | index |
| `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | 12 | 12 | Q,M | index |
| `CPI_IDX_TXCP01_NRG` | Core (هسته) | 12 | 12 | Q,M | index |
| `CPI_IDX_GD` | Headline (تورم کل) | 9 | 9 | Q,M | index |
| `CPI_IDX_SERV` | Headline (تورم کل) | 9 | 9 | Q,M | index |

**FRED** — 36 سری · 8 کشور · 36 کد · 52,008 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `CPGRLE01CAM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPGRLE01DEM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPGRLE01FRM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPGRLE01GBM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPGRLE01ITM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPGRLE01KRM659N` | Core (هسته) | 1 | 1 | M | index |
| `CPIAUCSL` | Headline (تورم کل) | 1 | 1 | M | index |
| `CPIENGSL` | — | 1 | 1 | M | index |
| `CPIFABSL` | — | 1 | 1 | M | index |
| `CPIHOSSL` | — | 1 | 1 | M | index |
| `CPILFESL` | Core (هسته) | 1 | 1 | M | index |
| `CUUR0000SAF11` | — | 1 | 1 | M | index |
| `CUUR0000SAF112` | — | 1 | 1 | M | index |
| `CUUR0000SAH1` | — | 1 | 1 | M | index |
| `CUUR0000SEHA` | — | 1 | 1 | M | index |
| `CUUR0000SEHF01` | — | 1 | 1 | M | index |
| `CUUR0000SETA01` | — | 1 | 1 | M | index |
| `CUUR0000SETB01` | — | 1 | 1 | M | index |
| `DEUCPHPLA01GYM` | Core (هسته) | 1 | 1 | M | index |
| `DEUCPHPLA01IXOBM` | Core (هسته) | 1 | 1 | M | index |
| `DGS10` | — | 1 | 1 | D | % |
| `DGS2` | — | 1 | 1 | D | % |
| `FEDFUNDS` | — | 1 | 1 | D | % |
| `FRACPHPLA01GYM` | Core (هسته) | 1 | 1 | M | index |
| `FRACPHPLA01IXOBM` | Core (هسته) | 1 | 1 | M | index |
| `GBRCPHPLA01IXOBM` | Core (هسته) | 1 | 1 | M | index |
| `GDP` | — | 1 | 1 | Q | billions USD |
| `GDPC1` | — | 1 | 1 | Q | billions USD |
| `ITACPHPLA01GYM` | Core (هسته) | 1 | 1 | M | index |
| `ITACPHPLA01IXOBM` | Core (هسته) | 1 | 1 | M | index |
| `M1SL` | — | 1 | 1 | M | billions USD |
| `M2SL` | — | 1 | 1 | M | billions USD |
| `PPIACO` | PPI (قیمت تولیدکننده) | 1 | 1 | M | index |
| `PPIFIS` | PPI (قیمت تولیدکننده) | 1 | 1 | M | index |
| `TURCPHPLA01IXOBM` | Core (هسته) | 1 | 1 | M | index |
| `UNRATE` | — | 1 | 1 | M | % |

**EUROSTAT** — 1,006 سری · 16 کشور · 64 کد · 268,075 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `HICP_ANR` | Headline (تورم کل) | 16 | 16 | M | % |
| `HICP_ANR_CP00` | Headline (تورم کل) | 16 | 16 | M | % |
| `HICP_ANR_CP01` | زیرشاخص: خوراک | 16 | 16 | M | % |
| `HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | 16 | 16 | M | % |
| `HICP_ANR_CP045` | زیرشاخص: انرژی | 16 | 16 | M | % |
| `HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | % |
| `HICP_ANR_FOOD` | زیرشاخص: خوراک | 16 | 16 | M | % |
| `HICP_ANR_IGD` | Headline (تورم کل) | 16 | 16 | M | % |
| `HICP_ANR_NRG` | Headline (تورم کل) | 16 | 16 | M | % |
| `HICP_ANR_SERV` | Headline (تورم کل) | 16 | 16 | M | % |
| `HICP_ANR_TOT_X_NRG` | Core (هسته) | 16 | 16 | M | % |
| `HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | 16 | 16 | M | % |
| `HICP_IW_TOTAL` | وزن سبد (CPI weights) | 16 | 16 | A | per_mille |
| `HICP_MIDX` | Headline (تورم کل) | 16 | 16 | M | index |
| `HICP_MIDX_CP00` | Headline (تورم کل) | 16 | 16 | M | index |
| `HICP_MIDX_CP01` | زیرشاخص: خوراک | 16 | 16 | M | index |
| `HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | 16 | 16 | M | index |
| `HICP_MIDX_CP045` | زیرشاخص: انرژی | 16 | 16 | M | index |
| `HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | 16 | 16 | M | index |
| `HICP_MIDX_FOOD` | زیرشاخص: خوراک | 16 | 16 | M | index |
| `HICP_MIDX_IGD` | Headline (تورم کل) | 16 | 16 | M | index |
| `HICP_MIDX_NRG` | Headline (تورم کل) | 16 | 16 | M | index |
| `HICP_MIDX_SERV` | Headline (تورم کل) | 16 | 16 | M | index |
| `HICP_MIDX_TOT_X_NRG` | Core (هسته) | 16 | 16 | M | index |
| `HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | 16 | 16 | M | index |
| `UNE_RT_M` | — | 16 | 16 | M | % |
| `GDP_CLV10_MEUR` | — | 15 | 15 | Q | million EUR |
| `GDP_CLV_PCH_SM` | — | 15 | 15 | Q | % |
| `HICP_IW_CP01` | زیرشاخص: خوراک | 15 | 15 | A | per_mille |
| `HICP_IW_CP02` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP03` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP04` | زیرشاخص: مسکن/آب/برق | 15 | 15 | A | per_mille |
| `HICP_IW_CP05` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP06` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP07` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP08` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP09` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP10` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP11` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `HICP_IW_CP12` | زیرشاخص: سایر گروه‌ها | 15 | 15 | A | per_mille |
| `LFSI_EMP_Q` | — | 15 | 15 | Q | thousand persons |
| `EXT_LT_INTRATRD` | — | 13 | 13 | A | EUR |

**OWID** — 192 سری · 192 کشور · 1 کد · 9,262 نقطه

| کد | خانواده | سری | کشور | فرکانس | واحد |
|---|---|---:|---:|---|---|
| `CPI` | Headline (تورم کل) | 192 | 192 | A | index_2010_100 |


---

## ۲) آیا زیرشاخص / هسته / وزن سبد در داده‌های خام وجود دارد؟

پاسخ در **سه لایه** بررسی شد (دیتابیس → فایل خام → اسکریپت دانلود):

### ۲.۱ لایهٔ ۱ — خود `macro.db`

| جست‌وجو | الگو | نتیجه در کل 1,692 کد |
|---|---|---|
| زیرشاخص COICOP (CP01..CP12) | `COICOP|CP0[1-9]|CP1[0-2]|_FOOD|FOOD_|_ENRG|_ENERGY|ENERGY_|_…` | **63 کد** → `EUROSTAT::HICP_ANR_CP01`, `EUROSTAT::HICP_ANR_CP02`, `EUROSTAT::HICP_ANR_CP03`, `EUROSTAT::HICP_ANR_CP04`, `EUROSTAT::HICP_ANR_CP045`, `EUROSTAT::HICP_ANR_CP05`, `EUROSTAT::HICP_ANR_CP06`, `EUROSTAT::HICP_ANR_CP07`, `EUROSTAT::HICP_ANR_CP071`, `EUROSTAT::HICP_ANR_CP0722`, `EUROSTAT::HICP_ANR_CP08`, `EUROSTAT::HICP_ANR_CP09`, `EUROSTAT::HICP_ANR_CP10`, `EUROSTAT::HICP_ANR_CP11`, `EUROSTAT::HICP_ANR_CP12`, `EUROSTAT::HICP_ANR_FOOD`, `EUROSTAT::HICP_ANR_TOT_X_NRG_FOOD`, `EUROSTAT::HICP_IW_CP01`, `EUROSTAT::HICP_IW_CP02`, `EUROSTAT::HICP_IW_CP03`, `EUROSTAT::HICP_IW_CP04`, `EUROSTAT::HICP_IW_CP05`, `EUROSTAT::HICP_IW_CP06`, `EUROSTAT::HICP_IW_CP07`, `EUROSTAT::HICP_IW_CP08`, `EUROSTAT::HICP_IW_CP09`, `EUROSTAT::HICP_IW_CP10`, `EUROSTAT::HICP_IW_CP11`, `EUROSTAT::HICP_IW_CP12`, `EUROSTAT::HICP_MIDX_CP01`, `EUROSTAT::HICP_MIDX_CP02`, `EUROSTAT::HICP_MIDX_CP03`, `EUROSTAT::HICP_MIDX_CP04`, `EUROSTAT::HICP_MIDX_CP045`, `EUROSTAT::HICP_MIDX_CP05`, `EUROSTAT::HICP_MIDX_CP06`, `EUROSTAT::HICP_MIDX_CP07`, `EUROSTAT::HICP_MIDX_CP071`, `EUROSTAT::HICP_MIDX_CP0722`, `EUROSTAT::HICP_MIDX_CP08`, `EUROSTAT::HICP_MIDX_CP09`, `EUROSTAT::HICP_MIDX_CP10`, `EUROSTAT::HICP_MIDX_CP11`, `EUROSTAT::HICP_MIDX_CP12`, `EUROSTAT::HICP_MIDX_FOOD`, `EUROSTAT::HICP_MIDX_TOT_X_NRG_FOOD`, `OECD::CPI_IDX_CP01`, `OECD::CPI_IDX_CP02`, `OECD::CPI_IDX_CP03`, `OECD::CPI_IDX_CP04`, `OECD::CPI_IDX_CP045_0722`, `OECD::CPI_IDX_CP05`, `OECD::CPI_IDX_CP06`, `OECD::CPI_IDX_CP07`, `OECD::CPI_IDX_CP08`, `OECD::CPI_IDX_CP09`, `OECD::CPI_IDX_CP10`, `OECD::CPI_IDX_CP11`, `OECD::CPI_IDX_CP12`, `OECD::CPI_IDX_TXCP01_NRG`, `WB::HD_HCIP_EDUC_FE`, `WB::HD_HCIP_EDUC_MA`, `WB::HD_HCIP_EDUC_TO` |
| وزن سبد | `WEIGHT|WGT|BASKET|_IW$|_IW\b|_IW_|IWEIGHT|^HICP_IW|CPI_W_` | **13 کد** → `EUROSTAT::HICP_IW_CP01`, `EUROSTAT::HICP_IW_CP02`, `EUROSTAT::HICP_IW_CP03`, `EUROSTAT::HICP_IW_CP04`, `EUROSTAT::HICP_IW_CP05`, `EUROSTAT::HICP_IW_CP06`, `EUROSTAT::HICP_IW_CP07`, `EUROSTAT::HICP_IW_CP08`, `EUROSTAT::HICP_IW_CP09`, `EUROSTAT::HICP_IW_CP10`, `EUROSTAT::HICP_IW_CP11`, `EUROSTAT::HICP_IW_CP12`, `EUROSTAT::HICP_IW_TOTAL` |

- از 117 کد قیمتی، **57 کد** در خانوادهٔ زیرشاخص (خوراک/انرژی/مسکن/سایر) قرار می‌گیرد.
- از این تعداد، **3 کد «کاذب»** است (نامش قیمتی به‌نظر می‌رسد ولی مفهوم دیگری دارد) — جزئیات در §۲.۴.

### ۲.۲ لایهٔ ۲ — فایل‌های خام محلی

ساختار CSVهای tidy (Eurostat / OECD / FRED):

| فایل | ستون‌ها | INDICATOR داخل فایل | UNIT | کشورها |
|---|---:|---|---|---:|
| `eurostat/cpi_index.csv` | 6 | `"HICP_MIDX"` | `"index"` | 16 |
| `eurostat/cpi_yoy.csv` | 6 | `"HICP_ANR"` | `"%"` | 16 |
| `oecd/cpi.csv` | 6 | `"CPI_IDX"` | `"index"` | 52 |
| `oecd/cpi_yoy.csv` | 6 | `"CPI_YOY"` | `"%"` | 53 |
| `oecd/ppi.csv` | 6 | `"PPI"` | `"index"` | 38 |
| `fred/cpi.csv` | 6 | `"CPIAUCSL"` | `"index"` | 1 |
| `fred/core_cpi.csv` | 6 | `"CPILFESL"`, `"DEUCPHPLA01GYM"`, `"FRACPHPLA01GYM"`, `"FRACPHPLA01IXOBM"`, `"ITACPHPLA01GYM"`, `"DEUCPHPLA01IXOBM"`, `"ITACPHPLA01IXOBM"`, `"GBRCPHPLA01IXOBM"`, `"CPGRLE01DEM659N"`, `"CPGRLE01ITM659N"`, `"CPGRLE01FRM659N"`, `"TURCPHPLA01IXOBM"`, `"CPGRLE01GBM659N"`, `"CPGRLE01CAM659N"`, `"CPGRLE01KRM659N"` | `"index"` | 8 |

> **نکتهٔ کلیدی:** همهٔ این فایل‌ها فقط **6 ستون** دارند (`REF_AREA, INDICATOR, TIME_PERIOD, OBS_VALUE, UNIT, FREQUENCY`). هیچ ستونی مثل `COICOP` / `EXPENDITURE` / `MEASURE` در فایل‌ها **وجود ندارد** ⇒ اطلاعات زیرشاخص **پیش از ذخیره‌سازی حذف شده**، نه در زمان لود در SQLite.

BIS `WS_LONG_CPI` (فایل خام، فقط ۱۷ کشور هدف):

| سنجه | مقدار | تفسیر |
|---|---:|---|
| ردیف سری × کشور | 68 | — |
| مقادیر `UNIT_MEASURE` | 628=34 · 771=34 | 628=شاخص · 771=نرخ YoY |
| کلیدهای (کشور×فرکانس×measure) | 68 | هر کلید یک سری |
| کلیدهایی با بیش از یک ردیف | **0** | ۰ = هیچ سری پنهانی (زیرشاخص) ادغام نشده |
| تعداد عنوان سری یکتا (`TITLE_TS`) | 17 | کمتر از تعداد کلیدها ⇒ عنوان، معیار تفکیک نیست (تفکیک واقعی روی `UNIT_MEASURE` است) |
IMF (`offline/imf/*.csv`): ۲۱ کد IFS + ۹ کد WEO + ۱۱ کد GFS که از این میان فقط دو کد قیمتی‌اند:
`PCPIPCH` (تورم کل، میانگین سالانه) و `PCPIEPCH` (تورم کل، پایان دوره). **هیچ کد خوراک/انرژی/هسته‌ای وجود ندارد.**

### ۲.۳ لایهٔ ۳ — اسکریپت‌های دانلود (کجا فیلتر شد؟)

| منبع | خط فیلتر در اسکریپت دانلود | معنا |
|---|---|---|
| **EUROSTAT** | `download_eurostat_offline.cjs:121` `dimensions: { unit: "RCH_A", coicop: "CP00", freq: "M" },`<br>`download_eurostat_offline.cjs:129` `dimensions: { unit: "I15", coicop: "CP00", freq: "M" },` | بُعد `coicop` روی **CP00** (همهٔ اقلام) قفل شده؛ CP01..CP12 (خوراک، انرژی، مسکن…) هرگز دانلود نشده |
| **OECD** | `download_oecd_offline.cjs:50` `match: (s) => s.MEASURE === "CP" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",`<br>`download_oecd_offline.cjs:54` `match: (s) => s.MEASURE === "CP" && s.UNIT_MEASURE === "GR" && s.TRANSFORMATION === "GY",`<br>`download_oecd_offline.cjs:58` `match: (s) => s.MEASURE === "PP" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",` | فقط سری‌هایی با `MEASURE='CP'` و `UNIT_MEASURE='IX'/'GR'` برداشته می‌شود |
| **IMF** | `download_imf_offline.cjs:71` `"NGDP_RPCH", "NGDP_RPATPCH", "PCPIPCH", "LUR", "GGXWDG_NGDP", "GGXCNL_NGDP",`<br>`download_imf_offline.cjs:77` `"NGDPD", "NGDPDPC", "NGDP_RPCH", "NGDP_R_PCH", "PCPIPCH", "PCPIEPCH",`<br>`download_imf_offline.cjs:81` `// ℹ️ این‌ها **معادل نسل جدید** همان PCPIPCH/PCPIEPCH هستند؛ عمداً به`<br>`download_imf_offline.cjs:95` `//       PCPIPCH · PCPIEPCH · PCPI_PCH · PCPIE_PCH   (همه تورم «کل»)` | فهرست ثابت کدها (DataMapper API) — فقط `PCPIPCH`/`PCPIEPCH` |
| **FRED** | `download_fred_offline.cjs:12` `*     - core_cpi.csv       : US core (CPILFESL) **+ verified foreign core CPI**`<br>`download_fred_offline.cjs:114` `{ id: "CPILFESL", label: "CPILFESL" },`<br>`download_fred_offline.cjs:126` `{ id: "CPGRLE01DEM659N",  label: "CPGRLE01DEM659N",  area: "DEU" }, // 1963-01..2025-03` | فهرست ثابت series_id — هستهٔ CPI اضافه شده، ولی زیرشاخص‌ها (CUUR0000SAF…) نه |
| **BIS** | `loadBisFile()` در `db_build/main_offline_loader.cjs:269-285` | فقط `REF_AREA`+`FREQ`+`UNIT_MEASURE` خوانده می‌شود؛ سایر بُعدها (BREAKS/COVERAGE/TITLE_TS) دور ریخته می‌شوند |
| **WB** | `WDI` (فقط شاخص‌های استاندارد WDI) | WDI اساساً زیرشاخص COICOP منتشر نمی‌کند |
| **OWID** | `download_owid_offline.cjs` → ستون واحد `CPI` | فقط تورم کل سالانه |

**نتیجه‌گیری لایهٔ ۳ (به‌روزشده — P1):** داده‌های زیرشاخص در نسخهٔ اول **در مرحلهٔ دانلود** حذف شده بودند، نه در مرحلهٔ لود (منابع بالادستی داده را داشتند: Eurostat بُعد `coicop`، OECD بُعد `EXPENDITURE`، FRED سری‌های `CUUR*`). این فیلتر در **P1 (2026-09-20)** برداشته شد و اسکریپت‌های دانلود گسترش یافتند:

| منبع | فایل‌های جدید خروجی | چه چیزی اضافه شد |
|---|---|---|
| **EUROSTAT** | `cpi_index_sub.csv` · `cpi_yoy_sub.csv` · `cpi_weights.csv` | ۲۲ کد COICOP (CP00..CP12 + `CP045`/`CP071`/`CP0722` + تجمیع‌های `NRG`/`FOOD`/`IGD`/`SERV`/`TOT_X_NRG`/`TOT_X_NRG_FOOD`) + وزن‌های سبد (‰) |
| **OECD** | `cpi_sub.csv` | فلوی جدید `DSD_PRICES@DF_PRICES_ALL` با ۱۷ کد EXPENDITURE برای ۱۷ کشور — شامل `_TXCP01_NRG` = **هستهٔ رسمی (All items non-food non-energy)** |
| **FRED** | `cpi_sub.csv` (+ `core_cpi.csv`) | ۱۰ زیرشاخص CPI آمریکا (خوراک/انرژی/مسکن/برق/بنزین/اجاره) + هستهٔ HICP تُرکیه (`TURCPHPLA01IXOBM`) |

> ⚠️ قاعدهٔ کلیدی معماری: لودر **فقط ستون `INDICATOR`** را می‌خواند، پس کد COICOP در همان ستون «پخته» می‌شود (`HICP_MIDX_CP01` · `HICP_IW_TOTAL` · `CPI_IDX_CP01`) تا هر گروه یک سری مستقل شود و تصادم «اولین مقدار برنده» رخ ندهد.

> ⚠️ نکتهٔ فنی OECD (کشف‌شده در همین کار): سرور SDMX سازمان OECD به درخواستی که از `fetch` (undici نود ۲۰) بیاید پاسخ **500 Internal server error** می‌دهد؛ همان درخواست با ماژول `https` نود ۲۰۰/CSV می‌گیرد ⇒ دانلودر OECD از `https.get` استفاده می‌کند. همچنین جداکنندهٔ OR در کلید SDMX باید `%2B` باشد (`+` در URL به فاصله تفسیر می‌شود و 404 می‌دهد).


### ۲.۴ ⚠️ کدهای «مثبت کاذب» — نامشان قیمتی است، مفهومشان نیست

روش داوری: برای کدهای `WB`، **نام رسمی از کاتالوگ `WDISeries.csv`** خوانده می‌شود؛ اگر خانوادهٔ regex قیمتی باشد ولی نام رسمی واژهٔ `price|inflation|deflator|CPI` نداشته باشد، کد به‌عنوان مثبت کاذب علامت می‌خورد.

| منبع::کد | سری در DB | نام رسمی (مرجع) |
|---|---:|---|
| `WB::AG.PRD.FOOD.XD` | 265 | Food production index (2014-2016 = 100) |
| `WB::HD_HCIP_EDUC_FE` | 265 | Human capital index plus (HCI+): education pillar score, female (scale 0–188) |
| `WB::HD_HCIP_EDUC_MA` | 265 | Human capital index plus (HCI+): education pillar score, male (scale 0–188) |
| `WB::HD_HCIP_EDUC_TO` | 265 | Human capital index plus (HCI+): education pillar score, total (scale 0–188) |
| `WB::IE.PPI.ENGY.CD` | 265 | Investment in energy with private participation (current US$) |
| `WB::IE.PPI.ICTI.CD` | 265 | Investment in ICT with private participation (current US$) |
| `WB::IE.PPI.TRAN.CD` | 265 | Investment in transport with private participation (current US$) |
| `WB::IE.PPI.WATR.CD` | 265 | Investment in water and sanitation with private participation (current US$) |
| `WB::TM.VAL.FOOD.ZS.UN` | 265 | Food imports (% of merchandise imports) |
| `WB::TM.VAL.FUEL.ZS.UN` | 265 | Fuel imports (% of merchandise imports) |
| `WB::TX.VAL.FOOD.ZS.UN` | 265 | Food exports (% of merchandise exports) |
| `WB::TX.VAL.FUEL.ZS.UN` | 265 | Fuel exports (% of merchandise exports) |

### ۲.۵ کدهای گمراه‌کنندهٔ دیگر (در هیچ خانوادهٔ قیمتی نیفتادند)

| منبع::کد | سری | نام رسمی |
|---|---:|---|
| `WB::HD_HCIP_HLTH_FE` | 265 | Human capital index plus (HCI+): health pillar score, female (scale 0–50) |
| `WB::HD_HCIP_HLTH_MA` | 265 | Human capital index plus (HCI+): health pillar score, male (scale 0–50) |
| `WB::HD_HCIP_HLTH_TO` | 265 | Human capital index plus (HCI+): health pillar score, total (scale 0–50) |
| `WB::HD_HCIP_OTJL_FE` | 265 | Human capital index plus (HCI+): on-the-job learning pillar score, female (scale -30–87) |
| `WB::HD_HCIP_OTJL_MA` | 265 | Human capital index plus (HCI+): on-the-job learning pillar score, male (scale -30–87) |
| `WB::HD_HCIP_OTJL_TO` | 265 | Human capital index plus (HCI+): on-the-job learning pillar score, total (scale -30–87) |
| `WB::HD_HCIP_OVRL_FE` | 265 | Human capital index plus (HCI+): overall score, female (scale 0–325) |
| `WB::HD_HCIP_OVRL_MA` | 265 | Human capital index plus (HCI+): overall score, male (scale 0–325) |
| `WB::HD_HCIP_OVRL_TO` | 265 | Human capital index plus (HCI+): overall score, total (scale 0–325) |
| `WB::IE.PPN.ENGY.CD` | 265 | Public private partnerships investment in energy (current US$) |
| `WB::IE.PPN.ICTI.CD` | 265 | Public private partnerships investment in ICT (current US$) |
| `WB::IE.PPN.TRAN.CD` | 265 | Public private partnerships investment in transport (current US$) |
| `WB::IE.PPN.WATR.CD` | 265 | Public private partnerships investment in water and sanitation (current US$) |

> این‌ها «PPI» در نامشان به معنای **P**rivate **P**articipation in Infrastructure (سرمایه‌گذاری) است، و `HD_HCIP_*` شاخص سرمایهٔ انسانی (HCI+) است. هیچ‌کدام شاخص قیمت نیستند.

### ۲.۶ 🧮 سری‌های محاسباتی `DERIVED` (فقط در `core.db`)

این سری‌ها **دادهٔ منتشرشدهٔ ناشر نیستند**؛ در `core_db/build/build_core_db.cjs` با `insertDerivedCore()` ساخته می‌شوند و روش ساخت در ستون `unit` حمل می‌شود (در API با کلید `unit_raw` دیده می‌شود).

| سری | روش | نقاط | از | تا | روش در `unit` |
|---|---|---:|---|---|---|
| `DERIVED.BRA.DERIVED_CORE_CPI.M` | trimmed-mean + تمدید روند (Hybrid) | 283 | 2003-01 | 2026-07 | `% (hybrid: trimmed-mean + trend-extension to 2026) — trimmed-mean YoY of 12 COICOP divisions (tau=2) · COICOP coverage → 2019-07 · no FRED core series for this country · 12m trailing MA of headline for 84 months · junction step +0.95pp at 2019-08 · → 2003-01 … 2026-07` |
| `DERIVED.CHN.DERIVED_CORE_CPI.M` | تمدید روند ۱۲ماهه (بدون هستهٔ COICOP) | 356 | 1996-12 | 2026-07 | `% (hybrid: trend-extension to 2026) — no usable COICOP divisions · no FRED core series for this country · 12m trailing MA of headline for 356 months · → 1996-12 … 2026-07` |
| `DERIVED.IND.DERIVED_CORE_CPI.M` | trimmed-mean + تمدید روند (Hybrid) | 150 | 2014-01 | 2026-06 | `% (hybrid: trimmed-mean + trend-extension to 2026) — trimmed-mean YoY of 12 COICOP divisions (tau=2) · COICOP coverage → 2019-05 · no FRED core series for this country · 12m trailing MA of headline for 85 months · junction step -0.35pp at 2019-06 · → 2014-01 … 2026-06` |
| `DERIVED.RUS.DERIVED_CORE_CPI.M` | trimmed-mean + تمدید روند (Hybrid) | 259 | 2005-01 | 2026-07 | `% (hybrid: trimmed-mean + trend-extension to 2026) — trimmed-mean YoY of 12 COICOP divisions (tau=2) · COICOP coverage → 2022-02 · no FRED core series for this country · 12m trailing MA of headline for 53 months · junction step +1.23pp at 2022-03 · → 2005-01 … 2026-07` |
| `DERIVED.SAU.DERIVED_CORE_CPI.M` | trimmed-mean + تمدید روند (Hybrid) | 175 | 2012-01 | 2026-07 | `% (hybrid: trimmed-mean + trend-extension to 2026) — trimmed-mean YoY of 12 COICOP divisions (tau=2) · COICOP coverage → 2025-07 · no FRED core series for this country · 12m trailing MA of headline for 12 months · junction step +1.28pp at 2025-08 · → 2012-01 … 2026-07` |

⇒ با احتساب این 5 سری، پوشش Core در `core.db` به **17/۱۷ کشور** می‌رسد (۱۲ رسمی + 5 محاسباتی).

---

## ۳) پوشش کشوری به تفکیک منبع (۱۷ کشور هدف)

### ۳.۱ ماتریس نوع سری

| کشور | Headline | **Core** | زیرشاخص | وزن سبد | منابع دارای Headline | منبع Core |
|---|:--:|:--:|:--:|:--:|---|---|
| **USA** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, FRED, OWID | OECD (20 کد), FRED (4 کد) |
| **CHN** | ✅ | ❌ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | — |
| **JPN** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (19 کد) |
| **DEU** | ✅ | ✅ | ✅ | ✅ | BIS, IMF, WB, OECD, EUROSTAT, OWID | OECD (18 کد), EUROSTAT (59 کد), FRED (3 کد) |
| **GBR** | ✅ | ✅ | ✅ | ✅ | BIS, IMF, WB, OECD, EUROSTAT, OWID | OECD (20 کد), EUROSTAT (47 کد), FRED (2 کد) |
| **FRA** | ✅ | ✅ | ✅ | ✅ | BIS, IMF, WB, OECD, EUROSTAT, OWID | OECD (20 کد), EUROSTAT (59 کد), FRED (3 کد) |
| **ITA** | ✅ | ✅ | ✅ | ✅ | BIS, IMF, WB, OECD, EUROSTAT, OWID | OECD (20 کد), EUROSTAT (59 کد), FRED (3 کد) |
| **CAN** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (20 کد), FRED (1 کد) |
| **AUS** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (20 کد) |
| **KOR** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (19 کد), FRED (1 کد) |
| **IND** | ✅ | ❌ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | — |
| **TUR** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (18 کد), FRED (1 کد) |
| **MEX** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (19 کد) |
| **BRA** | ✅ | ❌ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | — |
| **RUS** | ✅ | ❌ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | — |
| **SAU** | ✅ | ❌ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | — |
| **ZAF** | ✅ | ✅ | ✅ | ❌ | BIS, IMF, WB, OECD, OWID | OECD (17 کد) |

**خلاصه:** Headline برای **17/۱۷** کشور · Core برای **12/۱۷** (USA, JPN, DEU, GBR, FRA, ITA, CAN, AUS, KOR, TUR, MEX, ZAF) · زیرشاخص برای **17/۱۷** · وزن سبد برای **۰/۱۷**.

### ۳.۲ جزئیات سری‌های قیمتی هر کشور

**USA** — 50 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 304 | 1945-Q4 | 2026-Q1 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 1362 | 1913-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 113 | 1913 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 225 | 1970-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 1350 | 1914-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 112 | 1914 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 1362 | 1913-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 113 | 1913 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 65 | 1960 | 2024 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 55 | 1970 | 2024 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 65 | 1960 | 2024 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 1 | 2026-Q1 | 2026-Q1 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 1 | 2016-07 | 2016-07 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 1 | 2015 | 2015 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 6 | 1962-07 | 1985-02 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 2026-Q1 | 2026-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1959 | 1959 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 82 | 1992-Q1 | 2022-Q4 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 169 | 2002-05 | 2022-12 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 50 | 1947 | 2020 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 439 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 439 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 181 | 2009-12 | 2024-12 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-08 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 439 | 1990-01 | 2026-08 | ✅ |
| FRED | `CPILFESL` | Core (هسته) | M | 835 | 1957-01 | 2026-08 | ✅ |
| FRED | `CPIAUCSL` | Headline (تورم کل) | M | 955 | 1947-01 | 2026-08 | ✅ |
| FRED | `PPIACO` | PPI (قیمت تولیدکننده) | M | 1368 | 1913-01 | 2026-08 | ✅ |
| FRED | `PPIFIS` | PPI (قیمت تولیدکننده) | M | 206 | 2009-11 | 2026-08 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 65 | 1960 | 2024 | ✅ |

**CHN** — 28 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 379 | 1995-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 48 | 1978 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 84 | 2005-Q2 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 379 | 1995-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 48 | 1978 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 367 | 1996-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 47 | 1979 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 51 | 1981 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 47 | 1985 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 40 | 1986 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 30 | 1995 | 2024 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 39 | 1987 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 70 | 2011-08 | 2026-02 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 40 | 2004-Q4 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 19 | 1994 | 2025 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 3 | 1994-Q2 | 1995-Q3 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 2025-07 | 2025-07 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 2025 | 2025 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 1 | 2015 | 2015 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 404 | 1993-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 404 | 1993-01 | 2026-08 | — |
| OWID | `CPI` | Headline (تورم کل) | A | 40 | 1986 | 2025 | ✅ |

**JPN** — 44 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | A | 42 | 1984 | 2025 | — |
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 179 | 1955-Q1 | 2026-Q1 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 960 | 1946-08 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 80 | 1946 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 284 | 1955-Q1 | 2025-Q4 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 960 | 1946-08 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 80 | 1946 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 948 | 1947-08 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 79 | 1947 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 55 | 1970 | 2024 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 37 | 1955 | 2020 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 31 | 2009-Q3 | 2021-Q1 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 202 | 1995-02 | 2021-06 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 2004 | 2004 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 1994-Q3 | 1994-Q3 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 22 | 1956-05 | 2020-09 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 378 | 1990-01 | 2021-06 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 378 | 1990-01 | 2021-06 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 378 | 1990-01 | 2021-06 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**DEU** — 107 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | A | 31 | 1995 | 2025 | — |
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 74 | 2008-Q1 | 2026-Q2 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 931 | 1949-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 102 | 1924 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 225 | 1970-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 919 | 1950-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 101 | 1925 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 931 | 1949-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 102 | 1924 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 40 | 1992 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 56 | 1970 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 47 | 1979 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 180 | 2003-04 | 2026-02 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 178 | 1955-Q3 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 47 | 1959 | 2023 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 31 | 1957 | 2024 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 1986-Q2 | 1986-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 11 | 1959-02 | 2009-10 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 145 | 1995-02 | 2014-12 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 65 | 1995-Q1 | 2021-Q4 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 13 | 1995 | 2021 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 428 | 1991-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 440 | 1990-01 | 2026-08 | ✅ |
| FRED | `DEUCPHPLA01GYM` | Core (هسته) | M | 340 | 1997-01 | 2025-04 | ✅ |
| FRED | `DEUCPHPLA01IXOBM` | Core (هسته) | M | 363 | 1995-01 | 2025-03 | ✅ |
| FRED | `CPGRLE01DEM659N` | Core (هسته) | M | 747 | 1963-01 | 2025-03 | ✅ |
| EUROSTAT | `HICP_MIDX` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP00` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | — |
| EUROSTAT | `HICP_MIDX_CP01` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP045` | زیرشاخص: انرژی | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_FOOD` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_IGD` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_NRG` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_SERV` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG` | Core (هسته) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_IW_TOTAL` | وزن سبد (CPI weights) | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP01` | زیرشاخص: خوراک | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP02` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP03` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP04` | زیرشاخص: مسکن/آب/برق | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP05` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP06` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP07` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP08` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP09` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP10` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP11` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP12` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_ANR_CP00` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | — |
| EUROSTAT | `HICP_ANR_CP01` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP045` | زیرشاخص: انرژی | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_FOOD` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_IGD` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_NRG` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_SERV` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG` | Core (هسته) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | M | 348 | 1997-01 | 2025-12 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**GBR** — 94 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 1339 | 1915-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 365 | 1661 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 232 | 1968-Q2 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 1339 | 1915-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 365 | 1661 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 1327 | 1916-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 364 | 1662 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 56 | 1970 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 47 | 1979 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 1 | 1988 | 1988 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 1 | 1988-Q1 | 1988-Q1 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 1 | 1988-01 | 1988-01 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 1988-Q1 | 1988-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1988 | 1988 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 1988-01 | 1988-01 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 3 | 2009-Q1 | 2009-Q3 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 1 | 2010 | 2010 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 78 | 2015-07 | 2022-07 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 439 | 1990-01 | 2026-07 | ✅ |
| FRED | `GBRCPHPLA01IXOBM` | Core (هسته) | M | 447 | 1988-01 | 2025-03 | ✅ |
| FRED | `CPGRLE01GBM659N` | Core (هسته) | M | 651 | 1971-01 | 2025-03 | ✅ |
| EUROSTAT | `HICP_MIDX` | Headline (تورم کل) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR` | Headline (تورم کل) | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP00` | Headline (تورم کل) | M | 299 | 1996-01 | 2020-11 | — |
| EUROSTAT | `HICP_MIDX_CP01` | زیرشاخص: خوراک | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP045` | زیرشاخص: انرژی | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_FOOD` | زیرشاخص: خوراک | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_IGD` | Headline (تورم کل) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_NRG` | Headline (تورم کل) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_SERV` | Headline (تورم کل) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG` | Core (هسته) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | M | 299 | 1996-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_IW_TOTAL` | وزن سبد (CPI weights) | A | 25 | 1996 | 2020 | ✅ |
| EUROSTAT | `HICP_ANR_CP00` | Headline (تورم کل) | M | 287 | 1997-01 | 2020-11 | — |
| EUROSTAT | `HICP_ANR_CP01` | زیرشاخص: خوراک | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP045` | زیرشاخص: انرژی | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_FOOD` | زیرشاخص: خوراک | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_IGD` | Headline (تورم کل) | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_NRG` | Headline (تورم کل) | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_SERV` | Headline (تورم کل) | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG` | Core (هسته) | M | 287 | 1997-01 | 2020-11 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | M | 287 | 1997-01 | 2020-11 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**FRA** — 108 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 46 | 2010-Q1 | 2021-Q2 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 907 | 1951-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 75 | 1951 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 225 | 1970-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 907 | 1951-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 75 | 1951 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 895 | 1952-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 74 | 1952 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 6 | 1956-Q1 | 1976-Q2 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 1 | 1955 | 1955 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 14 | 1955-06 | 1978-12 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1958 | 1958 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 96 | 1957-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 113 | 1997-08 | 2025-07 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 2 | 2022-09 | 2022-10 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 1 | 1999 | 1999 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 4 | 1995-Q4 | 1998-Q1 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 432 | 1990-01 | 2025-12 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 432 | 1990-01 | 2025-12 | ✅ |
| FRED | `FRACPHPLA01GYM` | Core (هسته) | M | 336 | 1997-01 | 2025-04 | ✅ |
| FRED | `FRACPHPLA01IXOBM` | Core (هسته) | M | 424 | 1990-01 | 2025-04 | ✅ |
| FRED | `CPGRLE01FRM659N` | Core (هسته) | M | 651 | 1971-01 | 2025-03 | ✅ |
| EUROSTAT | `HICP_MIDX` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP00` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | — |
| EUROSTAT | `HICP_MIDX_CP01` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP045` | زیرشاخص: انرژی | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_FOOD` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_IGD` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_NRG` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_SERV` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG` | Core (هسته) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_IW_TOTAL` | وزن سبد (CPI weights) | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP01` | زیرشاخص: خوراک | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP02` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP03` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP04` | زیرشاخص: مسکن/آب/برق | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP05` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP06` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP07` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP08` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP09` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP10` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP11` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP12` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_ANR_CP00` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | — |
| EUROSTAT | `HICP_ANR_CP01` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP045` | زیرشاخص: انرژی | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_FOOD` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_IGD` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_NRG` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_SERV` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG` | Core (هسته) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | M | 348 | 1997-01 | 2025-12 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**ITA** — 107 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 952 | 1947-01 | 2026-04 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 79 | 1947 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 397 | 1927-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 952 | 1947-01 | 2026-04 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 79 | 1947 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 940 | 1948-01 | 2026-04 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 78 | 1948 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 56 | 1970 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 1 | 2010-12 | 2010-12 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 167 | 1955-Q3 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 42 | 1957 | 2025 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 28 | 1956 | 2025 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 95 | 1956-Q3 | 2025-Q4 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 4 | 1959-01 | 2020-04 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 112 | 2005-12 | 2022-11 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 16 | 2000 | 2021 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 38 | 2000-Q1 | 2022-Q4 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 432 | 1990-01 | 2025-12 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 432 | 1990-01 | 2025-12 | ✅ |
| FRED | `ITACPHPLA01GYM` | Core (هسته) | M | 338 | 1997-01 | 2025-04 | ✅ |
| FRED | `ITACPHPLA01IXOBM` | Core (هسته) | M | 424 | 1990-01 | 2025-04 | ✅ |
| FRED | `CPGRLE01ITM659N` | Core (هسته) | M | 771 | 1961-01 | 2025-03 | ✅ |
| EUROSTAT | `HICP_MIDX` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP00` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | — |
| EUROSTAT | `HICP_MIDX_CP01` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP045` | زیرشاخص: انرژی | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP071` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP0722` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_FOOD` | زیرشاخص: خوراک | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_IGD` | Headline (تورم کل) | M | 313 | 1999-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_NRG` | Headline (تورم کل) | M | 360 | 1996-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_SERV` | Headline (تورم کل) | M | 313 | 1999-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG` | Core (هسته) | M | 313 | 1999-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_MIDX_TOT_X_NRG_FOOD` | Core (هسته) | M | 313 | 1999-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_IW_TOTAL` | وزن سبد (CPI weights) | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP01` | زیرشاخص: خوراک | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP02` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP03` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP04` | زیرشاخص: مسکن/آب/برق | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP05` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP06` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP07` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP08` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP09` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP10` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP11` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_IW_CP12` | زیرشاخص: سایر گروه‌ها | A | 31 | 1996 | 2026 | ✅ |
| EUROSTAT | `HICP_ANR_CP00` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | — |
| EUROSTAT | `HICP_ANR_CP01` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP02` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP03` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP04` | زیرشاخص: مسکن/آب/برق | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP045` | زیرشاخص: انرژی | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP05` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP06` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP07` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP071` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP0722` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP08` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP09` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP10` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP11` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_CP12` | زیرشاخص: سایر گروه‌ها | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_FOOD` | زیرشاخص: خوراک | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_IGD` | Headline (تورم کل) | M | 301 | 2000-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_NRG` | Headline (تورم کل) | M | 348 | 1997-01 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_SERV` | Headline (تورم کل) | M | 301 | 2000-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG` | Core (هسته) | M | 301 | 2000-12 | 2025-12 | ✅ |
| EUROSTAT | `HICP_ANR_TOT_X_NRG_FOOD` | Core (هسته) | M | 301 | 2000-12 | 2025-12 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**CAN** — 46 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 1351 | 1914-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 112 | 1914 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 225 | 1970-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 1339 | 1915-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 111 | 1915 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 1351 | 1914-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 112 | 1914 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 56 | 1970 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 47 | 1979 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 191 | 2001-04 | 2025-11 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 207 | 1947-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 76 | 1914 | 2025 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 2026-Q1 | 2026-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 2026-03 | 2026-03 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1923 | 1923 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 40 | 1959 | 2022 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 114 | 2009-02 | 2022-12 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 66 | 2002-Q4 | 2022-Q4 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 425 | 1990-01 | 2025-05 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 425 | 1990-01 | 2025-05 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 125 | 2014-12 | 2025-04 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 425 | 1990-01 | 2025-05 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 425 | 1990-01 | 2025-05 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 424 | 1990-01 | 2025-04 | ✅ |
| FRED | `CPGRLE01CAM659N` | Core (هسته) | M | 759 | 1962-01 | 2025-03 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**AUS** — 44 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 1251 | 1922-04 | 2026-06 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 104 | 1922 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 225 | 1970-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 1251 | 1922-04 | 2026-06 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 104 | 1922 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 1239 | 1923-04 | 2026-06 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 103 | 1923 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 43 | 1989 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 2 | 2024 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 11 | 2002 | 2022 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 64 | 2003-Q3 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 19 | 2024-04 | 2026-04 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 2026-Q1 | 2026-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 12 | 2003 | 2024 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 2026-03 | 2026-03 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 59 | 2001-Q1 | 2023-Q1 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 16 | 2001 | 2022 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | Q | 146 | 1990-Q1 | 2026-Q2 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | Q | 143 | 1990-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | Q | 143 | 1990-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | Q | 142 | 1990-Q1 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | Q | 143 | 1990-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | Q | 143 | 1990-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | Q | 143 | 1990-Q1 | 2025-Q3 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | Q | 56 | 2011-Q3 | 2025-Q2 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | Q | 146 | 1990-Q1 | 2026-Q2 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | Q | 146 | 1990-Q1 | 2026-Q2 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | Q | 146 | 1990-Q1 | 2026-Q2 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | Q | 146 | 1990-Q1 | 2026-Q2 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**KOR** — 44 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | M | 258 | 2005-01 | 2026-06 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 739 | 1965-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 61 | 1965 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 205 | 1975-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 739 | 1965-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 61 | 1965 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 727 | 1966-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 60 | 1966 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 32 | 1990 | 2021 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 220 | 1999-08 | 2025-12 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 106 | 1984-Q3 | 2026-Q1 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 41 | 1966 | 2024 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 2026-Q2 | 2026-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 2019-10 | 2019-10 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 2 | 1965 | 1966 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 440 | 1990-01 | 2026-08 | ✅ |
| FRED | `CPGRLE01KRM659N` | Core (هسته) | M | 424 | 1990-01 | 2025-04 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**IND** — 38 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | A | 73 | 1953 | 2025 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 879 | 1953-04 | 2026-06 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 69 | 2009-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 73 | 1953 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 867 | 1954-04 | 2026-06 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 72 | 1954 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 879 | 1953-04 | 2026-06 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 0 | — | — | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 138 | 2008-01 | 2025-11 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 167 | 1958-Q1 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 43 | 1957 | 2024 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 2 | 1961-Q3 | 1961-Q4 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 6 | 1960-12 | 1999-11 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1959 | 1959 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 77 | 2013-01 | 2019-05 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | — |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**TUR** — 45 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 45 | 2015-Q2 | 2026-Q2 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 751 | 1964-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 88 | 1938 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 65 | 2010-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 739 | 1965-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 87 | 1939 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 751 | 1964-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 88 | 1938 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 46 | 1986 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 0 | — | — | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 0 | — | — | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 114 | 1956-Q1 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 28 | 1955 | 2024 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 60 | 2013-04 | 2025-12 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 2 | 1964-03 | 1964-04 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 98 | 1956-Q1 | 2025-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 3 | 1956 | 1960 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | Q | 103 | 1982-Q3 | 2022-Q4 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | A | 24 | 1984 | 2022 | ✅ |
| OECD | `PPI` | PPI (قیمت تولیدکننده) | M | 47 | 2016-10 | 2022-12 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 432 | 1990-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 384 | 1994-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 252 | 2005-01 | 2025-12 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 432 | 1990-01 | 2025-12 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 384 | 1994-01 | 2025-12 | ✅ |
| FRED | `TURCPHPLA01IXOBM` | Core (هسته) | M | 351 | 1996-01 | 2025-03 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**MEX** — 42 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 691 | 1969-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 87 | 1939 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 85 | 2005-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 679 | 1970-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 86 | 1940 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 691 | 1969-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 87 | 1939 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 51 | 1981 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 26 | 1969 | 2023 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 67 | 1999-Q3 | 2023-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 165 | 2003-06 | 2024-06 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 3 | 2015 | 2020 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 82 | 1972-Q1 | 2024-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 69 | 2010-01 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 415 | 1990-01 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 415 | 1990-01 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 265 | 2002-07 | 2024-07 | ✅ |
| OECD | `CPI_IDX_GD` | Headline (تورم کل) | M | 163 | 2011-01 | 2024-07 | ✅ |
| OECD | `CPI_IDX_SERV` | Headline (تورم کل) | M | 415 | 1990-01 | 2024-07 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 415 | 1990-01 | 2024-07 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 415 | 1990-01 | 2024-07 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

**BRA** — 39 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | M | 174 | 2012-01 | 2026-06 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 559 | 1980-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 46 | 1980 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 101 | 2001-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 547 | 1981-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 45 | 1981 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 559 | 1980-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 46 | 1980 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 51 | 1981 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 46 | 1980 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 56 | 1970 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 45 | 1981 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 101 | 2014-05 | 2026-01 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 79 | 1998-Q1 | 2025-Q4 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 27 | 1980 | 2025 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 1980-12 | 1980-12 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1981 | 1981 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 1981-Q1 | 1981-Q1 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 355 | 1990-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 211 | 2002-01 | 2019-07 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 440 | 1990-01 | 2026-08 | — |
| OWID | `CPI` | Headline (تورم کل) | A | 46 | 1980 | 2025 | ✅ |

**RUS** — 38 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 307 | 2001-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 25 | 2001 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 101 | 2001-Q1 | 2026-Q1 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 307 | 2001-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 25 | 2001 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 295 | 2002-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 24 | 2002 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 42 | 1990 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 41 | 1991 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 34 | 1992 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 37 | 1989 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 33 | 1993 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 36 | 1990 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 32 | 1994 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 15 | 1992 | 2017 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 12 | 2020-10 | 2022-03 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 41 | 2005-Q4 | 2022-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 1993-Q4 | 1993-Q4 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 1993 | 1993 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 1993-09 | 1993-09 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 218 | 2004-01 | 2022-02 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 363 | 1992-01 | 2022-03 | — |
| OWID | `CPI` | Headline (تورم کل) | A | 34 | 1992 | 2025 | ✅ |

**SAU** — 38 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `PROPERTY_PRICES` | سایر شاخص‌های قیمت | Q | 46 | 2015-Q1 | 2026-Q2 | — |
| BIS | `CPI` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 36 | 1990 | 2025 | — |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 439 | 1990-01 | 2026-07 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 36 | 1990 | 2025 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 427 | 1991-01 | 2026-07 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 35 | 1991 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 63 | 1963 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 26 | 2000 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 62 | 1964 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 46 | 1980 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 1 | 2011 | 2011 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 1 | 2011-01 | 2011-01 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 1 | 2011-Q1 | 2011-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 1 | 2011-01 | 2011-01 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 1 | 2011-Q1 | 2011-Q1 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 1 | 2011 | 2011 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 175 | 2011-01 | 2025-07 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 367 | 1995-01 | 2025-07 | — |
| OWID | `CPI` | Headline (تورم کل) | A | 63 | 1963 | 2025 | ✅ |

**ZAF** — 43 سری قیمتی

| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |
|---|---|---|---|---:|---|---|:--:|
| BIS | `CPI` | Headline (تورم کل) | M | 1254 | 1922-01 | 2026-06 | — |
| BIS | `CPI` | Headline (تورم کل) | A | 104 | 1922 | 2025 | — |
| BIS | `SHARE_PRICES` | سایر شاخص‌های قیمت | Q | 241 | 1966-Q1 | 2026-Q1 | — |
| BIS | `CPI_YOY` | Headline (تورم کل) | M | 1242 | 1923-01 | 2026-06 | ✅ |
| BIS | `CPI_YOY` | Headline (تورم کل) | A | 103 | 1923 | 2025 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | M | 1254 | 1922-01 | 2026-06 | ✅ |
| BIS | `CPI_IDX` | Headline (تورم کل) | A | 104 | 1922 | 2025 | ✅ |
| IMF | `PCPIPCH` | Headline (تورم کل) | A | 52 | 1980 | 2031 | ✅ |
| IMF | `PCPIEPCH` | Headline (تورم کل) | A | 51 | 1981 | 2031 | ✅ |
| IMF | `EREER` | سایر شاخص‌های قیمت | A | 22 | 2004 | 2025 | — |
| IMF | `PCPI_PCH` | Headline (تورم کل) | A | 0 | — | — | — |
| IMF | `PCPIE_PCH` | Headline (تورم کل) | A | 0 | — | — | — |
| WB | `FP.CPI.TOTL` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `NY.GDP.DEFL.ZS.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `NE.DAB.DEFL.ZS` | دِفلاتور | A | 66 | 1960 | 2025 | — |
| WB | `FP.CPI.TOTL.ZG` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG` | دِفلاتور | A | 65 | 1961 | 2025 | ✅ |
| WB | `NY.GDP.DEFL.KD.ZG.AD` | دِفلاتور | A | 36 | 1990 | 2025 | — |
| WB | `TT.PRI.MRCH.XD.WD` | سایر شاخص‌های قیمت | A | 20 | 2005 | 2024 | — |
| WB | `PX.REX.REER` | سایر شاخص‌های قیمت | A | 47 | 1979 | 2025 | — |
| OECD | `CPI_IDX` | Headline (تورم کل) | A | 41 | 1957 | 2023 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | Q | 25 | 2015-Q3 | 2024-Q3 | ✅ |
| OECD | `CPI_IDX` | Headline (تورم کل) | M | 190 | 1999-12 | 2024-12 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | A | 2 | 1958 | 1959 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | Q | 92 | 1959-Q2 | 2024-Q2 | ✅ |
| OECD | `CPI_YOY` | Headline (تورم کل) | M | 153 | 1993-06 | 2025-01 | ✅ |
| OECD | `CPI_IDX_CP01` | زیرشاخص: خوراک | M | 420 | 1990-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP02` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP03` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP04` | زیرشاخص: مسکن/آب/برق | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP045_0722` | زیرشاخص: انرژی | M | 276 | 2002-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP05` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP06` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP07` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP08` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP09` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP10` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP11` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_CP12` | زیرشاخص: سایر گروه‌ها | M | 204 | 2008-01 | 2024-12 | ✅ |
| OECD | `CPI_IDX_TOTAL` | Headline (تورم کل) | M | 421 | 1990-01 | 2025-01 | — |
| OECD | `CPI_IDX_TXCP01_NRG` | Core (هسته) | M | 276 | 2002-01 | 2024-12 | ✅ |
| OWID | `CPI` | Headline (تورم کل) | A | 66 | 1960 | 2025 | ✅ |

### ۳.۳ فهرست سری‌های قیمتی که در `core.db` نیستند (به چارت نمی‌رسند)

**15 کد** از کدهای قیمتی در ۱۷ کشور وجود دارند ولی در `core.db` فیلتر شده‌اند:

| منبع::کد | تعداد سری در ۱۷ کشور |
|---|---:|
| `BIS::CPI` | 34 |
| `BIS::PROPERTY_PRICES` | 10 |
| `BIS::SHARE_PRICES` | 16 |
| `EUROSTAT::HICP_ANR_CP00` | 4 |
| `EUROSTAT::HICP_MIDX_CP00` | 4 |
| `IMF::EREER` | 1 |
| `IMF::PCPIE_PCH` | 1 |
| `IMF::PCPI_PCH` | 1 |
| `OECD::CPI_IDX_TOTAL` | 17 |
| `WB::NE.DAB.DEFL.ZS` | 17 |
| `WB::NY.GDP.DEFL.KD.ZG.AD` | 17 |
| `WB::NY.GDP.DEFL.ZS` | 17 |
| `WB::NY.GDP.DEFL.ZS.AD` | 17 |
| `WB::PX.REX.REER` | 17 |
| `WB::TT.PRI.MRCH.XD.WD` | 17 |

---

## ۴) از دادهٔ موجود چه چیزی قابل استخراج است؟

| قابلیت | امکان | مبنای داده |
|---|:--:|---|
| تورم کل (Headline) ماهانه/فصلی/سالانه برای ۱۷ کشور | ✅ | 26 کد از ۶ منبع |
| هستهٔ تورم (Core) برای 12 کشور | ✅ | FRED (`CPILFESL`, `*CPHPLA01*`, `CPGRLE01*`) |
| شکاف Headline − Core | ✅ | همان دو سری بالا (۷ کشور) |
| PPI (قیمت تولیدکننده، کل) | ✅ | OECD `PPI` (۹ کشور) + FRED `PPIACO`/`PPIFIS` (USA) |
| دِفلاتور GDP (کل اقتصاد) | ✅ | WB `NY.GDP.DEFL.*` (۱۷ کشور، سالانه) |
| زیرشاخص‌های CPI (خوراک/انرژی/مسکن/سایر) | ❌ | در هیچ لایه‌ای موجود نیست (§۲) |
| وزن سبد مصرف‌کننده | ❌ | هیچ کدی در ۴۰۵k سری (§۲.۱) |
| محاسبهٔ Core با فرمول حذفی برای ۱۰ کشور باقی‌مانده | ❌ | نیاز به زیرشاخص + وزن (هر دو غایب) |
| جایگزین: Core آماری (روند/میانگین متحرک از Headline) | ⚠️ | ممکن، ولی «رسمی» نیست — باید «proxy» برچسب بخورد |

---

## ۵) بازتولید

```bash
cd collector/macro
node tools/data_inventory/source_report.cjs      # همین گزارش را بازتولید می‌کند
node tools/data_inventory/funnel.cjs             # قیف ۴۰۵k → ۱.۴۴k سری
python3 tools/data_inventory/bis_unit_collision.py
```

_تولیدشده توسط `source_report.cjs` — 2026-09-20 18:11:14_
