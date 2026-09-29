# Macro Backend (collector/macro/backend)

بک‌اندِ مستقلِ بخش Macro — دادهٔ اقتصاد کلان را به شکلِ
**dashboard-ready / Bloomberg-style** به‌صورت **JSON API** ارائه می‌دهد.
این بک‌اند **UI ندارد** (API-only)؛ تمام نمایش توسط فرانت‌اند مستقل
(`frontend/`, Next.js، پورت ۳۰۰۰) انجام می‌شود. پورت API: **۴۰۰۱**.

---

## دستور اجرا

```bash
cd collector/macro
node backend/boot.cjs                 # → http://127.0.0.1:4001
# یا با پورت سفارشی:
MACRO_BACKEND_PORT=4001 node backend/boot.cjs
```

## بررسی فعال بودن سرویس

```bash
ss -ltnp | grep 4001                  # پورت باز است؟
pgrep -af "boot.cjs"                  # پروسه زنده است؟
curl -s http://127.0.0.1:4001/health  # health probe (JSON)
```

## مسیرها (API-only)

| مسیر | کاربرد |
|---|---|
| `GET /health` یا `/api/health` | liveness/readiness probe |
| `GET /api/groups` | فهرست گروه‌ها |
| `GET /api/inflation` | گروه 1A (CPI/CORE_CPI/PPI/GDP_DEFL) |
| `GET /api/inflation-sub` | گروه **1A2** (CPI_SUB + CPI_WEIGHTS) — زیرشاخص‌های COICOP و وزن سبد *(P1)* |

> **P1 (2026-09-20) — گروه‌های جدید و پوشش Core:**
> زیرشاخص‌ها و وزن‌ها در گروه **جدا** عرضه می‌شوند تا ترکیب و سقف ۶۰-سری گروه
> `1A_inflation` تغییر نکند:
> ```bash
> curl "http://127.0.0.1:4001/api/group/1A2_inflation_sub?mode=countries&limit=60"
> ```
> | canonical | منبع | نمونه کد | پوشش |
> |---|---|---|---|
> | `CPI_SUB` | OECD · EUROSTAT · FRED | `CPI_IDX_CP01` · `HICP_MIDX_CP04` · `CPIFABSL` | **۱۷/۱۷** کشور |
> | `CPI_WEIGHTS` | EUROSTAT (`prc_hicp_iw`) | `HICP_IW_TOTAL` · `HICP_IW_CP01` | DEU/FRA/ITA (+GBR فقط `TOTAL`) |
> | `CORE_CPI` (گروه 1A) | OECD `_TXCP01_NRG` · EUROSTAT `TOT_X_NRG_FOOD` · FRED | `CPI_IDX_TXCP01_NRG` | **۱۲/۱۷** کشور (بود ۷) |
| `GET /api/growth` | گروه 1B (GDP/IND_PRO/RETAIL_SALES) |
| `GET /api/labor` | گروه 1C (UNEMP/EMP) |
| `GET /api/group/<key>` | هر گروه با کلید کوتاه |
| `GET /api/countries` | اهداف تورمی (main DB) |
| `GET /api/country/<ISO3>` | هدف تورمی یک کشور |
| `GET /debug/macro` | **تشخیصی توسعه‌دهنده** (منابع/سری/گروه/متادیتا) |
| `GET /api/docs` | **API Explorer** (فقط توسعه‌دهنده) |

> **قاعدهٔ معماری:** هیچ مسیر HTML/استاتیک/داشبورد داخلی وجود ندارد؛ هر مسیر
> ناشناس یک `404 JSON` می‌گیرد. (سند: `docs/ARCHITECTURE-sources.md` اصل ۴)

---

## درخت پوشه

```
backend/
├─ boot.cjs                  نقطهٔ اجرا → http.cjs.start(PORT)
├─ http.cjs                  لایهٔ HTTP (API-only) + /health + /debug/macro + /api/docs
├─ picker.cjs                facade سازگار (require به core/picker_lib)
├─ core/picker_lib.cjs       پیاده‌سازی اصلی پیکر (خروجی حرفه‌ای)
├─ core/country_meta.cjs     reader هدف تورمی از MAIN DB (macro.db)
├─ catalog/registry.cjs      متادیتای ثابت: کشورها (ISO3) + اندیکاتورها + datasetها
├─ processors/
│   ├─ trend.cjs             trend stats + direction/strength classification
│   ├─ risk.cjs              risk_flags  (high_volatility / sharp_reversal / …)
│   └─ summary.cjs           summary گروه (global_trend / avg_yoy / avg_mom / …)
├─ modules/
│   ├─ inflation.cjs         → buildGroup("1A_inflation", CPI/CORE_CPI/PPI)
│   ├─ growth.cjs            → buildGroup("1B_growth", GDP/IND_PROD/RETAIL_SALES)
│   └─ labor.cjs             → buildGroup("1C_labor", UNEMP/EMP)
└─ sql/                      کوئری‌های نمونهٔ اولیه (توسط کد استفاده نمی‌شود)
```

`picker_lib` از روی `../core_db/core.db` (فقط‌خواندنی) می‌خواند و `INDICATOR_MAP` /
`DATASETS` را از `build_core_db.cjs` قرض می‌گیرد (تک‌منبعِ حقیقت → هیچ کوئریِ
pattern ای از آنچه واقعاً در core هست جدا نمی‌شود).

### رفتار و قواعد کیفی (به‌روز شده)
- **واحد (unit) از رجیستری، نه از دیتابیس** *(A)*: ستونِ `series.unit` در
  core.db قابل اعتماد نیست (مثلاً BIS CPI عدد نامفهومِ `"771"` دارد؛ IMF/WB رشد =
  NULL). واحدِ معنادار الآن از `catalog/registry.cjs → seriesProfile()` برای هر
  کد پرایدر به دست می‌آید. به هر سری یک `series_kind` هم داده می‌شود
  (`index | rate | percent | level`) تا بعداً (فاز C) سری‌های هم‌خانواده سازگار
  مقایسه/جمع شوند.
- **حداقل طول تاریخچه برای انتخاب** *(B)*: سری‌های کم‌نقطه (= بلااستفاده برای
  ترند/ریسک/چارت) دیگر انتخاب نمی‌شوند. آستانه به فرکانس بستگی دارد:
  `W≥24 ، M≥12 ، Q≥6 ، A≥3`. کد تک‌نقطه‌ای مانند `OECD CPI_Q` با ۱ داده از
  مجموعه حذف می‌شود. سری انتخابی خانهٔ `series_kind` و `unit_origin` دارد.
- **کشور → ISO3**: سری BIS (دونویسه مثل `US`) به `USA` ترجمه می‌شود تا همه یک کشور
  زیر یک کد بیایند و خلاصهٔ بین-dataset صحیح باشد.
- **تاریخچه**: `history.full` = پنجرهٔ بلند (HISTORY_YEARS=30 سال؛ for trend/vol/ML)
  و `history.display` = پنجرهٔ سه ساله داشبورد (M→36, Q→12, A→3).
- **پاک‌سازی**: سری بدون آخرین مشاهدهٔ متناهی یا با چندانیِ تاریخ، drop می‌شود.
- **سهم منصفانهٔ منابع (اصل ۳)**: در هر pass هر منبع دقیقاً یک سری می‌دهد؛
  `MAX_SERIES` داینامیک = `max(configured, eligibleSources)` تا همهٔ منابع
  (از جمله OWID) سهم اول خود را بگیرند.

---

## خروجی (shape هر گروه)

```jsonc
{
  "group": "1A_inflation",
  "meta": { "title": "Inflation", "canonical_indicators": ["CPI","CORE_CPI","PPI"],
            "max_series": 10, "generated_at": "..." },
  "summary": { "global_trend": "heating|cooling|stable|mixed",
               "avg_yoy": 3.1, "avg_mom": 0.05,
               "rising": 4, "falling": 2, "flat": 1,
               "coverage": { "series": 7, "countries": [...], "datasets": [...], "as_of": "..." } },
  "available": 42,
  "series_count": 7,
  "series": [{
    "id": "OECD_USA_CPI_M", "series_id": "OECD.USA.CPI_YOY.M",
    "dataset": "OECD", "dataset_meta": { "code":"OECD", "name_en":"...", "name_fa":"..." },
    "country": { "code": "USA", "name_en": "United States", "name_fa": "ایالات متحده آمریکا" },
    "indicator": { "code": "CPI", "label": "Consumer Price Index", "category": "Inflation" },
    "unit": "Index (CPI)",          // derived from catalog (series.unit NOT trusted)
    "series_kind": "index",         // index | rate | percent | level
    "unit_origin": "catalog-explicit",
    "frequency": "M", "source": "...",
    "latest": { "date": "2024-06", "value": 3.2, "mom": 0.1, "yoy": -0.3 },
    "trend": { "direction":"up", "strength":"medium", "momentum":0.66, "volatility":0.3,
               "slope_3m":..., "slope_6m":..., "slope_12m":... },
    "risk_flags": { "high_volatility":false, "sharp_reversal":true, "near_peak":false,
                    "near_trough":false, "vol_spike":false, "has_risk":true, "notes":[...] },
    "history": { "full": [...5y...], "display": [...3y...] }
  }]
}
```

زبانِ خروجی این مرحله **انگلیسی**؛ فیلدهای `*_fa` (نام کشورها / datasetها) از حالا
نگه داشته شده‌اند تا بعداً بدون تغییر schema چندزبانه شود.

---

## اجرا و تست

```bash
cd collector/macro

# سریع تستِ منطقیِ هر ماژول (بدون HTTP)
node -e "const {buildGroup}=require('./backend/picker.cjs'); \
console.log(JSON.stringify(buildGroup('1A_inflation',['CPI','CORE_CPI','PPI'],{title:'Inflation'}),null,2))"

# بالا آوردن بک‌اند (API-only)
node backend/boot.cjs              # → http://127.0.0.1:4001
# endpoint ها
curl "http://127.0.0.1:4001/health"
curl "http://127.0.0.1:4001/api/inflation"
curl "http://127.0.0.1:4001/api/growth"
curl "http://127.0.0.1:4001/api/labor"
curl "http://127.0.0.1:4001/debug/macro"
```

> پیش‌نیاز: `core_db/core.db` ساخته شده باشد (core_db/build). پورت از env
> `MACRO_BACKEND_PORT` (=4001) برداشته می‌شود.

## برای ادامه / ماژول‌های آینده
- تعریفِ یک ماژول جدید = فقط یک فایل زیر `modules/` که `buildGroup("X_group", [...canonical...], opts)` صدا بزند.
- اگر اندیکاتور canonical نیاز افتاد، برچسب/کانونی `INDICATOR_MAP` باید اضافه شود و
  `core.db` دوباره build شود (اندیکاتورهای موجود را `INDICATOR_META` در registry دارد).
- `RETAIL_SALES` فعلاً در canonical فهرست رشد هست ولی providerی در core ندارد →
  تا وقتی به `INDICATOR_MAP` + فیلترِ core اضافه و build شود، سری نمی‌سازد (بی‌ضرر).
