# Macro Chart Research — Inflation / Growth / Labor
## راهنمای چارت‌های حرفه‌ای و کاربرپسند برای داده‌های ماکرو (خلاصه تحقیق)

> Scope: چارت‌هایی که برای سه گروه بک‌اند **1A_inflation**, **1B_growth**, **1C_labor**
> معنا دارند، با ذکر *فرمت / شکل / چرا* و **وضعیت داده** (ready از `core.db` یا ingest-gap).
>
> منابع (خوانده‌شده مستقیم):
> - Financial Times — *Visual Vocabulary* (chart-doctor)
> - Data-to-Viz — decision tree + caveats
> - ONS — *Data visualisation* style guide (chart types / colours)
> - Wikipedia — *Fan chart (time series)* (روش بانک انگلستان برای تورم)
>
> نکته: موتور جست‌وجوی Web در محیط ما در دسترس نبود؛ منابع منتخب مستقیم Fetch شدند.

---

## 0) اصول مشترک (پایهٔ همهٔ گروه‌ها)

از منابع فوق، این قواعد «حرفه‌ای و کاربرپسند» است:

1. **Change-over-time → Line** (استاندارد سری زمانی). برای سری نامنظم marker.
2. **Magnitude (مقایسه ذاتی) → Bar/Column با محور از صفر.**
   اما **خط** لازم نیست از صفر شروع شود (ONS: line charts ok)، **ستون magnitude باید**.
3. **Deviation (اختلاف از مرجع/صفر) → Diverging bar / surplus-deficit filled line.**
4. **Ranking → Ordered bar / Dot-strip / Slope / Dot plot.**
5. **Correlation → Scatter (و Connected scatter برای مسیر زمانی).**
   هشدار: خواننده فرض علت‌ومعلول می‌کند — محتاطانه.
6. **Part-to-whole → Stacked column/bar** (بیش از چند جزء سخت می‌شود)، pie فقط حدااقل.
7. **Uncertainty → Fan chart** (برای تورم/پیش‌بینی؛ ابداع بانک انگلستان).
8. **اثرات زمانی دقیق (روز/هفته/ماه) → Calendar heatmap** (دقتِ مقدار را قربانی می‌کند).
9. **Dual-axis (Line + Column)** را با احتیاط (خطر گمراهی) — منابع هشدار جدی دارند.
10. **رنگ معنایی:** در تورم «بالا/داغ = بد»، در رشد «بالا = خوب»، در بیکاری «بالا = بد».
    همان رنگ را بی‌متناقض استفاده کن. رنگ کوررنگ‌پسند (palette ONS).
11. **Sparkline** برای «اسکن سریع» در جدول‌ها؛ **Line کامل** برای تحلیل.
12. همیشه **as-of date**، **واحد**، **فرکانس**، و **منبع** را کنار چارت بگذار.

---

## 1) INFLATION (1A: CPI, CORE_CPI, PPI, GDP_DEFL)

| # | چارت | فرمت/شکل | چرا کاربرپسند است | داده |
|---|------|----------|-------------------|------|
| 1 | **CPI Headline YoY** | Line (تک‌سری، 3y/5y، صفر مرجع برای نرخ) | مشهورترین اسطوره‌خوانی تورم | ✅ |
| 2 | **Core vs Headline** | Line چندسری روی یک محور **هم‌مقیاس** | تفکیک تورم پایه از نوسان غذا/انرژی | ✅ |
| 3 | **PPI** | Line / area کوتاه | فشار upstream روی مصرف‌کننده | ✅ |
| 4 | **GDP Deflator (annual)** | Line/Column سالانه | تورم کل اقتصاد (فراخ‌پوش) | ✅ |
| 5 | **Core–Headline spread** | Diverging bar یا Filled area حول صفر | «فشار هسته‌ای/غیر» | ✅ (derived) |
| 6 | **MoM vs YoY** | Line + Column (با احتیاط dual-axis) یا دو ردیف جدا | شتاب کوتاه در برابر روند | ✅ |
| 7 | **Inflation heatmap (cross-country over time)** | XY Heatmap (کشور × ماه) | مقایسهٔ هم‌زمان جهانی/داغ‌ترین | ✅ (چندکشور سری موجود) |
| 8 | **Ranked inflation now** | Ordered bar/Lollipop | «داغ‌ترین/سردترین» یک‌نگاه | ✅ |
| 9 | **Rebased CPI index (100=t)** | Indexed line multi-country | هم‌مقیاس‌سازی کشورها | ✅ (از value) |
| 10 | **Small-multiples per country (4 سری)** | Grid خط‌های کوچک (CPI/CORE/PPI/DEFL) | ردیف‌۱ کنونی ما؛ اسکن کشور | ✅ |
| 11 | **Contribution to inflation** (food/energy/services/…) | Stacked column | سهم اجزا | ⛔ ingest-gap |
| 12 | **Wage / ULC inflation** | Line | تورم دستمزد و آثار ثانویه | ⛔ ingest-gap |
| 13 | **Inflation Expectations** | Line + dash | لنگر انتظارات | ⛔ ingest-gap |
| 14 | **Fan chart تورم (پیش‌بینی)** | Fan/شبح‌های اطمینان | روایت سیاست‌گذار (BoE) | ⛔ نیاز مدل/پیش‌بینی |

مزیت انحصاری: **Trend/risk موتور بک‌اند** → badge/رنگ: `high_volatility`, `sharp_reversal`,
`abnormal_momentum`, `vol_spike`, `near_peak/trough`.

---

## 2) GROWTH (1B: GDP, IND_PRO, …)

| # | چارت | فرمت/شکل | چرا | داده |
|---|------|----------|-----|------|
| 1 | **Real GDP growth YoY** | Line (نرخ) | شاخص محوری ادوار | ✅ |
| 2 | **GDP level vs growth** | Column level + Line growth (Dual-axis فقط در صورت نیاز) | سطح و روند | ✅/⚠️ |
| 3 | **Industrial Production YoY** | Line | چرخه صنعت (پیش‌رو) | ✅ |
| 4 | **Growth heatmap (country × quarter)** | XY Heatmap | دامنه تورم/رکود جهانی | ✅ |
| 5 | **Ranked growth now** | Ordered bar | صف‌بندی سریع | ✅ |
| 6 | **Rebased real GDP (100=t)** | Indexed line | مقایسه ساختاری کشورها | ✅ |
| 7 | **Small multiples** | Grid | اسکن همه کشورها | ✅ |
| 8 | **GDP contribution by demand** | Stacked column / waterfall | نگاه ترکیب | ⛔ ingest-gap |
| 9 | **Diffusion / breadth (share مثبت)** | Line (0–100%) | تصویر گرایش کلی | ⛔ نیاز محاسبه |
| 10 | **Nowcast vs actual** | Line + band | دقت انتظارات | ⛔ |

---

## 3) LABOR (1C: UNEMP, EMP, …)

| # | چارت | فرمت/شکل | چرا | داده |
|---|------|----------|-----|------|
| 1 | **Unemployment rate** | Line (نرخ) | جانِ بازار کار | ✅ |
| 2 | **Employment level** | Line/Area | ظرفیت واقعی اشتغال | ✅ |
| 3 | **Employment change (جریان)** | Column (m/m, y/y) | جریان در برابر سطح | ✅ (derived) |
| 4 | **Participation rate** | Line | نیروی کار بالقوه | subset |
| 5 | **Labor heatmap (country × period)** | XY Heatmap | مقایسه | ✅ |
| 6 | **Ranked unemployment** | Ordered bar / Dot-strip | مقایسه | ✅ |
| 7 | **Philips-style: inflation × unemployment** | Scatter (+ نسخه connected) | رابطه کلیدی ماکرو | ✅ (نیاز تطبیق زمانی) |
| 8 | **Beveridge curve (vacancies × unemployment)** | Connected scatter | کارایی بازار کار | ⛔ ingest vacancies |
| 9 | **Slack/Nowcast indicators** | Line | فشار تورمی و بازار کار | ⛔ |

---

## 4) نگاشت به دادهٔ واقعی بک‌اند (کلیدهای JSON)

هر سری ما این ساختار را دارد (از `picker`/`processors`):
`country{code,name}`, `indicator{code,label,category}`, `unit`, `frequency`, `series_kind`,
`latest{date,value,mom,yoy}`, `trend{direction,strength,slope_3m,slope_6m,slope_12m,momentum,volatility}`,
`risk_flags{high_volatility,sharp_reversal,abnormal_momentum,vol_spike,near_peak,near_trough,has_risk,notes}`,
`history{full,display}`, `dataset`, `source`, `dataset_meta`.

ت ز این‌ها هر چارت لازم دارد:
| چارت | نیاز به فیلد |
|------|--------------|
| Line over time | `history.full/display` |
| YoY/MoM headline | `latest.yoy`, `latest.mom` |
| Spread (Core−Headline) | دو سری + هم‌تاریخ |
| Heatmap کئشوری | چند سری `latest.yoy`/`history` در یک دوره |
| Ranked bar now | `latest.yoy` یا `latest.value` |
| Sparkline table | `history.display` + `trend.direction` |
| Risk badge | `risk_flags.*` |
| Fan/uncertainty | ⛔ نیاز تولید باند در بک‌اند (فعلاً نداریم) |

---

## 5) OK / NO-GO (کاربرپسند نبودن)

- **NO**: Pie برای تورم/Sector؛ 3D؛ dual-axis بدون دلیل؛ نقشه برای rate بدون سهم جمعیت؛
  axis برعکس (down=good)؛ بیش از ۴–۵ خط در یک chart.
- **OK**: خط، ستون (mأg)، heatmap، ranked bar، scatter، sparkline، fan (پیش‌بینی).

---

## 6) اولویت پباده‌سازی پیشنهادی (بعد از ردیف ۱)

1. **CPI YoY line (full 5y) + Core overlay** (هم‌محور) — تورم تک‌کشور.
2. **Cross-country inflation heatmap + Ranked now** — تورم مقطعی.
3. **Rebased/Indexed multi-country line** (هم‌مقیاس) — مقایسه.
4. **Growth YoY line + cross-country heatmap.**
5. **Labor: Unemployment line + scatter(UR, Infl).**
6. (بعد از ingest) Contribution/Wage/Expectations/Fan.

---

## 7) منابع (URL)
- FT Visual Vocabulary: https://github.com/Financial-Times/chart-doctor (visual-vocabulary)
- Data-to-Viz: https://www.data-to-viz.com (caveats: /caveats.html)
- ONS Data Visualisation: https://style.ons.gov.uk/category/data-visualisation/
- Fan chart: https://en.wikipedia.org/wiki/Fan_chart_(time_series)

---
*File: collector/macro/backend/docs/charts-inflation-growth-labor.md*
*This is a living document — update when new series are ingested.*
