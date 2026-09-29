# `cpi_audit.cjs` — ممیزی دائمی CPI (Headline vs Core)

> **File:** `collector/macro/tools/cpi_audit.cjs`
> **سند یافته‌ها:** `/CPI_YOY_DATA_AUDIT.md` (ریشهٔ پروژه)
> **منبع حقیقت:** `core_db/core.db` (read-only) + `core_db/build/filters/countries.json` +
> `core_db/build/build_core_db.cjs` (`INDICATOR_MAP`) + `backend/catalog/registry.cjs` + payload زندهٔ API پورت ۴۰۰۱.

---

## ۱) چرا این ابزار وجود دارد

در ممیزی CPI مشخص شد که بک‌اند برای `BIS::CPI` **یک `series_kind` مشترک**
(`index`) به همهٔ ۱۷ کشور می‌دهد، در حالی که:

- **۸ کشور** داده را به‌صورت **نرخ (YoY %)** ذخیره کرده‌اند → `USA, DEU, CAN, IND, TUR, MEX, BRA, ZAF`
- **۹ کشور** داده را به‌صورت **سطح شاخص** ذخیره کرده‌اند → `CHN, JPN, GBR, FRA, ITA, AUS, KOR, RUS, SAU`

نتیجهٔ باگ: YoYِ محاسبه‌شده بی‌معنا می‌شد (مثلاً کانادا `75.5%` و هند `90.0%`).
این ابزار همان ممیزی را **تکرارپذیر** می‌کند تا هر زمان (پس از ingest، rebuild،
یا تغییر registry) بتوانیم مطمئن شویم چیزی نشکسته است.

## ۲) اجرا

```bash
cd /home/mohsen/TraderBOT/collector/macro

node tools/cpi_audit.cjs              # پیش‌فرض: DB inventory + kind + Core gaps
node tools/cpi_audit.cjs --db         # فقط موجودی DB خام
node tools/cpi_audit.cjs --kinds      # kind اعلامی registry در برابر داده
node tools/cpi_audit.cjs --payload    # payload زندهٔ API (هر دو mode)
node tools/cpi_audit.cjs --all        # همه
node tools/cpi_audit.cjs --json       # خروجی ماشین‌خوان (فقط بخش‌های انتخاب‌شده)
node tools/cpi_audit.cjs --sample=CAN,IND   # نمونهٔ JSON پردازششدهٔ دو کشور
node tools/cpi_audit.cjs --all --json # خروجی ماشین‌خوانِ کامل (مناسب CI)
```

- `--sample=ISO3[,ISO3]` : مسیر «ورودی خام → guard → ردیف‌های نهایی چارت» را
  برای کشورهای خواسته‌شده چاپ می‌کند (نیازمند payload؛ هر دو mode را می‌بیند).
- نمونهٔ ذخیره‌شده (تولیدشده با کد واقعی TS): `tools/cpi_sample_can_ind.json`

- `--json` فقط بخش‌های درخواست‌شده را JSON می‌کند؛ برای CI معمولاً `--all --json` بدهید.

- آدرس بک‌اند از `MACRO_API_BASE` خوانده می‌شود (پیش‌فرض `http://127.0.0.1:4001`).
- اگر بک‌اند بالا نباشد، بخش payload با پیام `SKIP` رد می‌شود (بقیه کار می‌کند).
- **کد خروج:** `0` = سازگار · `1` = نقض واقعی (**مناسب CI / pre-commit**) · `2` = خطای اجرای ابزار.

## ۳) خروجی — سه بخش

| بخش | محتوا |
|---|---|
| `DB INVENTORY` | هر سری CPI/CORE_CPI با `n` نقاط جاری، بازهٔ تاریخ، مقدار آخر، و verdict نرخ/سطح (با `med12` و `reason`) |
| `PER-COUNTRY MATRIX` | برای هر ۱۷ کشور: بهترین سری ماهانه + وجود/عدم Core |
| `REGISTRY DECLARED vs DETECTED` | برچسب `registry` در برابر واقعیت داده + علامت `MATH-RISK` برای موارد مخرب محاسبه |
| `PAYLOAD AUDIT` | همان چیزی که فرانت می‌گیرد: `kind-only` (قدیم) در برابر `guarded` (جدید) برای هر سری |

## ۴) قاعدهٔ تشخیص (آینهٔ فرانت‌اند)

این ابزار **آینهٔ** `frontend/lib/macro/cpi.ts` است و باید هم‌زمان با آن به‌روز شود:

```
RAW_RATE_KINDS        = ["rate", "percent"]
CPI_RATE_GUARD        = { maxRateMedian: 60, maxPositiveStepShare: 0.85, minPoints: 24 }

resolveYoySource(series):
  1) series_kind ∈ RAW_RATE_KINDS            ⇒ "raw"      (مقدار خام عیناً YoY)
  2) detectRateLike(history).isRate          ⇒ "raw"      (safeguard برای برچسب اشتباه)
  3) در غیر این صورت                        ⇒ "computed" (درصد تغییر روی سطح)
```

`detectRateLike` (بدون حدس، اندازه‌گیری‌شده روی همان ۱۷ کشور):

```
|median(۱۲ نقطهٔ آخر)| ≤ 60   و   سهم گام‌های صعودی در پنجرهٔ اخیر < 0.85
  ⇒ نرخ‌مانند
```

فاصلهٔ آماری: ۸ کشور نرخ با `median ∈ [2.33, 31.93]` · ۹ کشور شاخص با `median ∈ [119, 294]`.

## ۵) تفسیر نتایج (وضعیت امروز)

```
DB INVENTORY : CPI برای هر ۱۷ کشور موجود است (BIS::CPI.M)
               CORE_CPI فقط برای USA (FRED::CPILFESL.M, n=834)
REGISTRY     : MATH-RISK entries: 1 (BIS::CPI)
PAYLOAD      : mode=countries → raw: 8 · computed: 9 · regression: 0
```

## ۶) نمونهٔ داده‌های پردازش‌شده (CAN / IND)

📄 فایل: `tools/cpi_sample_can_ind.json` — تولیدشده با **کد واقعی TS**
(`frontend/lib/macro/cpi.ts` + `frontend/lib/time/TimeShift.ts` کامپایل‌شده) روی payload زنده.

خلاصهٔ تاییدشده:

| کشور | kind اعلامی | detect | source | نقاط | مقدار خام آخر | مقدار نهایی چارت | قبلاً (باگ) | بازهٔ سری |
|---|---|---|---|---|---|---|---|---|
| **CAN** | `index` ❌ | rate (med12=2.358) | **raw** | 358 | 3.032141 | **3.032141** | 75.539286 | [−0.95, 8.13] |
| **IND** | `index` ❌ | rate (med12=2.370) | **raw** | 357 | 4.38006 | **4.38006** | 89.992231 | [−0.71, 11.25] |

- `equals_raw_bitwise: true` برای هر دو ⇒ **هیچ محاسبه‌ای** روی مقدار انجام نشده.
- بازهٔ CAN شامل 8.13% است که با قلهٔ واقعی تورم کانادا (۲۰۲۲) می‌خواند؛
  نشانهٔ اینکه مقادیر **نرخ واقعی** هستند، نه سطح شاخص.
- `annualize_suppressed: true` ⇒ ۳ماههٔ annualized برای سری نرخ حذف شده است.
- IND در payload پیش‌فرض **وجود ندارد** (`available_in_this_payload: false`) —
  این ورودیِ مرحلة بعدی (منوی کشورها / `mode=countries`) است.
## ۷) وضعیت شناخته‌شده (Known issues) — نه باگ این ابزار

| # | مورد | وضعیت |
|---|---|---|
| 1 | Core CPI برای ۱۶ کشور وجود ندارد | ⛔ **ingest gap** (`INDICATOR_MAP.CORE_CPI` فقط `FRED::CPILFESL`) |
| 2 | `mode=countries` سری Core را کاملاً حذف می‌کند | ⚠️ رفتار picker (نیازمند mode جدید در بک‌اند) |
| 3 | `HISTORY_YEARS = 30` ⇒ `history.full` کل تاریخ نیست | ℹ️ طراحی فعلی picker |
| 4 | `IMF::PCPIPCH` تا **۲۰۳۱** (پیش‌بینی WEO) | ⚠️ نیازمند تفکیک ناحیهٔ forecast در چارت |
| 5 | `OWID::CPI` با `display_unit: "YoY %"` ولی دادهٔ سطحی | ⚠️ برچسب واحد |
| 6 | `OECD::CPI_YOY` عملاً خالی/صفر | ⛔ منبع rate قابل‌استفاده نیست |

**رفع ریشه‌ای:** اصلاح `BIS::CPI` در `backend/catalog/registry.cjs:192`
(از هاردکد `index` به per-country). پس از آن اصلاح، لایهٔ ۲ فرانت
(`guard:"cpi"`) خودبه‌خود بی‌اثر و بی‌خطر می‌شود و این ابزار باید
`MATH-RISK entries: 0` گزارش کند.

---

*این فایل زنده است — با هر تغییر در `INDICATOR_MAP`/`registry.cjs`/ingest به‌روز شود.*
