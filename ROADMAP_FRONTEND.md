# TRADERBOT — Frontend Architecture & Roadmap

> **Status:** STANDARD / قطعی — مبنای تمام خروجی‌های آیندهٔ فرانت‌اند.
> **Scope:** ظاهر کلان کل پروژه (ماکرو، بازارها، انرژی، کریپتو، معاملات، ریسک،
> ادمین، کاربران، لاگین، تنظیمات، داشبوردهای سفارشی).
> **Stack:** Next.js App Router · TypeScript (strict) · TailwindCSS · Headless UI (ShadCN-style) ·
> Visx · TradingView Lightweight Charts · next-intl.
> هر خروجی آینده باید **دقیقاً** بر اساس این سند تولید شود.

---

## 0) اصل حاکم
فرانت‌اند یک محیط **یکپارچه، تمیز و توسعه‌پذیر** است که همهٔ دامنه‌ها در قالب
ماژول‌های مستقل به آن متصل می‌شوند — **بدون تغییر دامنه‌های قبلی**.
توسعه **مرحله‌ای (Incremental)** و **از پایین به بالا** است.

---

## 1) محل پروژه
- مسیر: **`frontend/`** در ریشهٔ پروژه.
- این فرانت‌اند ظاهر کلان کل سیستم است؛ همهٔ دامنه‌ها مرحله‌به‌مرحله وصل می‌شوند.

---

## 2) سیستم چارت‌سازی (Charting System)

### 2A) چارت‌های اقتصادی / ماکرو / ریسک → **Visx**
- سطح پایین و کاملاً قابل‌سفارشی‌سازی.
- ریسپانسیو با والد (parent-based sizing).
- مناسب چارت‌های اقتصادی/تحلیلی/ریسک.
- محل: **لایهٔ Base Components**.
- گالری رسمی: https://airbnb.io/visx/gallery

### 2B) چارت‌های مالی سطح TradingView → **TradingView Lightweight Charts**
- کندل‌استیک حرفه‌ای، زوم/پَن، کراس‌هیر، اندیکاتورها، حجم، چند سری روی یک چارت.
- تم Dark/Light داخلی، رایگان، سازگار با Next.js.
- محل: **لایهٔ Domain** (فقط Markets/Trading؛ کندل کریپتو هم در Domain).
- در نیاز به ابزارهای Drawing → نسخهٔ کامل **Charting Library** (تصمیم بعدی).
- مرجع: https://www.tradingview.com/lightweight-charts/

### 2C) مرزبندی معماری چارت
- Visx → **Base**.
- TradingView LWC → **Domain (Markets/Trading/Crypto-candles)**.
- **Panels** فقط ترکیب‌کنندهٔ چارت‌ها.
- **Pages** فقط نمایش Panel.

---

## 3) سیستم ریسپانسیو (Responsive System)
ریسپانسیو در **DNA** کامپوننت‌ها است، نه یک ویژگی اضافه. با **TailwindCSS**.

### 3A) سایزهای استاندارد (کامل)
| گروه | بازه | توضیح |
|---|---|---|
| موبایل | 320–480 | موبایل کوچک |
| موبایل | 480–640 | موبایل بزرگ |
| تبلت | 640–1024 | تبلت |
| لپ‌تاپ | 1024–1440 | لپ‌تاپ (تا ۲۰ اینچ) |
| لپ‌تاپ/دسکتاپ | 1440–1680 | دسکتاپ بزرگ‌تر |
| TV بزرگ | 1680–2560 | نمایشگر بزرگ |
| TV بزرگ | 2560–3840 | 4K |
| UltraWide | 21:9 → 2560×1080 | مانیتور فوق‌عریض |
| UltraWide | 32:9 → 3840×1080 | مانیتور فوق‌عریض |

Breakpoints Tailwind: `sm md lg xl 2xl`.
همهٔ کامپوننت‌ها باید در این سایزها **تست و تنظیم** شوند.

### 3B) الگوی گرید اجباری
```
grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8
```

---

## 4) Dark / Light Mode سراسری
- Tailwind: `darkMode: 'class'`.
- Layout: `<html className={isDark ? "dark" : ""}>`.
- کامپوننت‌ها: `bg-white dark:bg-gray-900` و `text-black dark:text-white`.
- **Visx:** تم‌های جدا برای Dark/Light (در Base).
- **TradingView LWC:** تم داخلی Dark/Light.

---

## 5) چندزبانه بودن (i18n) — **next-intl**
- هیچ متن ثابتی در کامپوننت‌ها نباشد؛ همه از فایل ترجمه.
- هر دامنه فولدر ترجمهٔ مخصوص خودش.
- مسیر فایل‌ها: `messages/{domain}.{fa,en}.json`.
- زبان در **Context سراسری** مدیریت شود.

---

## 6) معماری ۴ لایه (Modular + Extensible)
ریسپانسیو، i18n، Dark/Light و Charting باید در **هر چهار لایه** رعایت شوند.

1. **Base Components** — کوچک، مستقل، reusable (Visx + primitives).
   مثال: `LineChart`, `BarChart`, `Heatmap`, `ScatterChart`, `Sparkline`,
   `Card`, `Grid`, `DataTable`, `TrendBadge`, `RiskIndicator`, `StatTile`,
   `Toolbar`, `Legend`, `EmptyState`, `Skeleton`, `ErrorState`.
2. **Domain Components** — مخصوص هر بخش، ساخته‌شده از Base.
   - Macro → `InflationCard`, `GDPCard`, `LaborCard`
   - Markets → `EquityCard`, `IndexCard`, `FXCard`, `CommodityCard`, `BreadthCard`
   - Energy → `CrudeCard`, `GasCard`, `PowerMixCard`, `InventoryCard`
   - Crypto → `TokenCard`, `DominanceCard`, `FundingRateCard`, `VolatilityCard`
   - Trading → `PositionCard`, `PNLCard`, `OrderFlowCard` + (LWC کندل)
   - Risk → `VaRCard`, `ExposureCard`, `DrawdownChart`, `LimitUsageCard`
3. **Panels** — ترکیب Domain Components با Gridهای Tailwind.
   `MacroPanel`, `MarketsPanel`, `EnergyPanel`, `CryptoPanel`,
   `TradingPanel`, `RiskPanel`, `CustomPanel`.
4. **Pages** — فقط Panel را نمایش می‌دهند (بدون منطق UI اضافی).
   `/dashboard/{macro,markets,energy,crypto,trading,risk}` و `/dashboard/custom/[slug]`.

---

## 7) API Architecture
- **همهٔ داده‌ها** از Route Handlers داخلی Next.js: `frontend/app/api/*`.
- این Route Handlerها نقش **Proxy** دارند و به بک‌اند اصلی می‌زنند.
- **هیچ fetch مستقیم از کلاینت به بک‌اند اصلی مجاز نیست.**
- Proxy باید **allowlist** مسیر، timeout و cache policy صریح داشته باشد.

---

## 8) ساختار پوشه‌ها (هدف نهایی)
```
frontend/
├─ app/
│  ├─ layout.tsx                       # <html class=dark> + i18n + theme
│  ├─ page.tsx                         # landing/انتخاب دامنه
│  ├─ dashboard/
│  │  ├─ layout.tsx                    # shell ریسپانسیو + nav (RTL/LTR-aware)
│  │  ├─ macro/page.tsx                # فقط <MacroPanel/>
│  │  ├─ markets|energy|crypto|trading|risk/page.tsx
│  │  └─ custom/[slug]/page.tsx
│  └─ api/
│     ├─ _lib/upstream.ts               # helper مشترک proxy
│     └─ {domain}/[...path]/route.ts
├─ components/
│  ├─ base/                             # Visx + primitives
│  ├─ domain/{macro,markets,energy,crypto,trading,risk}/
│  ├─ panels/
│  └─ ui/                               # Headless/ShadCN-style
├─ lib/{api,types,format,theme,i18n}/
├─ messages/{domain}.{fa,en}.json
└─ (config) next.config, tailwind.config, tsconfig(strict)
```

---

## 9) قرارداد داده (Contract) — مشترک همهٔ دامنه‌ها
`lib/types/series.ts` (استاندارد سری/گروه؛ همهٔ دامنه‌ها از همین تغذیه می‌شوند):
- `SeriesPoint { date; value }`
- `SeriesLatest { date; value; mom; yoy }`
- `SeriesTrend { direction; strength; slope_3m/6m/12m; momentum; volatility }`
- `SeriesRisk { high_volatility; sharp_reversal; abnormal_momentum; vol_spike; near_peak; near_trough; has_risk; notes }`
- `Series { dataset; country{code,name}; indicator{code,label,category}; unit; frequency; series_kind; latest; trend; risk_flags; history{full,display} }`
- `Group { group; title; summary{global_trend,avg_yoy,avg_mom}; series: Series[] }`

---

## 10) اولویت‌بندی و مسیر توسعهٔ مرحله‌ای (Incremental)

**P0 — اسکلت و زیرساخت**
1. `frontend/` = Next.js App Router + TS strict + Tailwind + ShadCN + Visx + LWC + next-intl.
2. `darkMode:'class'` + ThemeProvider.
3. i18n (next-intl) + `messages/` + Context زبان.
4. `app/dashboard/layout.tsx` (shell ریسپانسیو).
5. `app/api/_lib/upstream.ts` + اولین proxy: `api/macro/[...path]`.

**P1 — Base Components (اولویت اول)**
`Card, Grid, LineChart(Visx), BarChart, ScatterChart, Heatmap, Sparkline,
TrendBadge, RiskIndicator, StatTile, DataTable, EmptyState, Skeleton, ErrorState, Toolbar`.

**P2 — Domain: Macro** (اولین دامنه، داده آماده)
`GroupSummaryBar, InflationCard, GDPCard, LaborCard, SeriesMetricsGrid, CountrySelector`.

**P3 — Panel + Page: Macro**
`MacroPanel` + `/dashboard/macro` (انتخاب گروه 1A/1B/1C و دوره).

**P4 — Markets** (Base آماده): Domainها + **LWC کندل** + `MarketsPanel` + page + `api/markets`.

**P5 — Energy → Crypto → Trading → Risk → Custom** (هرکدام فقط پوشه‌های خود + یک route).

**P6 — Cross-cutting:** تکمیل i18n، بازبینی ۵ سایز، تنظیم Visx (Dark/Light)،
اسکلت صفحات admin/users/login/settings.

---

## 11) هشدارهای طراحی / معماری (قیدها)
- **مرز موتورها:** LWC فقط در Domain؛ Base فقط Visx/HTML.
- **بدون متن سخت‌کد:** همه از `messages/*`.
- **رنگ معنایی از `theme.ts`:** تورم بالا=بد، رشد بالا=خوب، PnL مثبت=سبز؛ در Base ثابت نشود.
- **Line لازم نیست از صفر، Bar باید از صفر.**
- **حداکثر ۴–۵ خط** روی یک چارت؛ dual-axis فقط با دلیل (هشدار FT/ONS).
- **'use client' هدفمند**؛ Visx/LWC کلاینتی، RSC برای layout/دادهٔ اولیه.
- **Proxy allowlist** + timeout + cache؛ هیچ آدرس/secret بک‌اندی لو نرود.
- **DoD هر کامپوننت:** تست در سایزهای استاندارد + Dark/Light + بدون متن سخت‌کد.
- **داده-محور:** پوشش ناهمگون سری‌ها → `EmptyState` استاندارد؛ لیست ثابت ممنوع.

---

## 12) اعلام Gap (نسبت به فرانت‌اند)
| نیاز | وضعیت |
|---|---|
| Macro 1A/1B/1C payload + proxy | ✅ آماده → کل زنجیرهٔ Macro قابل ساخت |
| Fan/uncertainty, Contribution تورم, Wage/ULC, Expectations, Vacancies, GDP-contribution | ⛔ بک‌اند ندارد (FanChart فعلاً placeholder) |
| Markets/Energy/Crypto/Trading/Risk backends | ⛔ فعلاً نداریم → با `EmptyState` شروع، تکمیل پس از بک‌اند هر دامنه |
| TradingView Drawing (Charting Library) | ⚠️ Lite رایگان؛ Drawing نیازمند نسخهٔ کامل (تصمیم بعدی) |

---

## 13) پیشنهاد توسعهٔ بعدی
1. **P0** را شروع کن: اسکلت `frontend/` (Next+TS strict+Tailwind+ShadCN+Visx+LWC+next-intl)،
   `darkMode:'class'`، i18n، shell داشبورد، اولین proxy `api/macro`.
2. سپس **P1** (Base) و نشاندن «ردیف ۱ Macro» فعلی روی `LineChart/Sparkline/StatTile/TrendBadge/RiskIndicator`.
3. سپس **P2/P3** (Macro کامل)، بعد **P4** (Markets با LWC).

---

## 14) منابع
- Visx: https://airbnb.io/visx/gallery
- TradingView Lightweight Charts: https://www.tradingview.com/lightweight-charts/
- TailwindCSS: https://tailwindcss.com
- next-intl: https://next-intl.dev
- FT Visual Vocabulary / Data-to-Viz / ONS Style — مبنای انتخاب نوع چارت
  (جزئیات: `collector/macro/backend/docs/charts-inflation-growth-labor.md`)

---

## 15) وضعیت اجرا (Live Status)

### ✅ P0 — کامل و تأییدشده (تست اتصال انجام شد)
پشتهٔ نصب‌شده: Next **16.3.4** · React **19** · TS **strict** · Tailwind **4** ·
`@visx/*` **4** (سازگار React19) · `lightweight-charts` **5.2.1** · `next-intl` **4.14.4** ·
`clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`.

تحویل‌شده:
- `lib/types/series.ts` — قرارداد داده **منطبق ۱۰۰٪** با payload واقعی بک‌اند.
- `lib/server/upstream.ts` — proxy سمت سرور (allowlist + timeout + خطای یکنواخت).
- `lib/server/macro.ts` — نگاشت گروه↔مسیر (`1A_inflation`→`inflation`).
- `app/api/macro/route.ts` → `/api/groups` ; `app/api/macro/[...path]/route.ts` → هر گروه.
- `app/layout.tsx` (dir/dark + anti-FOUC + NextIntl + Theme) ; `app/dashboard/layout.tsx` (shell ریسپانسیو).
- `components/providers/ThemeProvider.tsx` ; `components/layout/{SideNav,HeaderControls,PendingSection}.tsx`.
- `messages/{common,macro}.{fa,en}.json` ; `i18n/request.ts` (زبان از کوکی).
- صفحات دامنه با `PendingSection` (راهکار ۵): markets/energy/crypto/trading/risk.

**تست اتصال (بک‌اند زندهٔ پورت ۴۰۰۱، از طریق proxy خودمان):**
```
GET /api/macro/groups         → 200  {groups:[{key,title,canonical_indicators,endpoint}]}
GET /api/macro/1A_inflation   → 200  {group,meta,summary,available:166,series_count:10,series:[...]}
series[0] = BIS_BRA_CPI_M → { latest{date,value,mom,yoy}, trend{direction,strength,...},
                              risk_flags{...}, history{full,display}, dataset_meta{name_en,name_fa} }
```

**یافته‌های انطباق:**
- `country` = `{ code: ISO3, name }` ; `trend.direction ∈ {up,down,flat}` ; `trend.strength ∈ {low,medium,high}`.
- `summary.global_trend ∈ {heating,cooling,stable,mixed}` + `rising/falling/flat` + `coverage`.
- `dataset_meta` شامل `name_fa` — **قابل استفاده مستقیم برای i18n** دیتاست‌ها (بدون ترجمهٔ دستی).

**یادداشت مهاجرت:** پوشهٔ قدیمی `app/ui/**` موقتاً از typecheck exclude شده و در P1/P2 به `components/**` منتقل می‌شود.

### ⏭ P1 — بعدی (Base Components با Visx 4)
`Card, Grid, LineChart(Visx), Sparkline, StatTile, TrendBadge, RiskIndicator, EmptyState, Skeleton, ErrorState, Toolbar, DataTable`.

---
*File: /ROADMAP_FRONTEND.md — مرجع قطعی فرانت‌اند. این سند زنده است و با هر فاز به‌روز می‌شود.*
