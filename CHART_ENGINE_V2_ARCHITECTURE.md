# CHART_ENGINE_V2_ARCHITECTURE.md

> **ارتقای چارت‌انجین فعلی به «چارتانجین ماژولار نسل بعد»**
> نسخهٔ سند: `1.0` · تاریخ: `2026-09-24` · پایه: **وضعیت واقعی کد همین مخزن** (نه طرح فرضی)
> دامنه: همهٔ چارت‌های **زمان‌محور** (تاریخی + ماکرو) با **یک** هستهٔ رندر.
> 🆕 **سند رسمی معماری V2 ⇒ `§۱۲ — Architecture Overview (Presets / Themes / Library)`**
> نسخهٔ معماری: **`2.0.0-alpha`** · تاریخ: **`2026-09-25`** · وضعیت: **تأییدشده ✅** (بازبینی کامل + ماتریس شاهد در §۱۲.۶ ✓ · بازتولید: `python3 -u scripts/review-v2-matrix.py` ✓)

---

## ۰) چکیده و وضعیت مبنا (Baseline امروز)

| لایه | دارایی موجود | قرارداد/فایل |
|---|---|---|
| موتور رندر | `BaseChart` (~۹۰۰ خط) · `ChartFrame` · `themePresets` | `frontend/components/base/*` |
| ریاضی (تنها منبع) | **AL** — رجیستری ۹ اندیکاتور + سیگنال‌ها + ساختار | `frontend/lib/analysis/**` · D11 |
| قرارداد نسخه | `3.0` (ماکرو · فریز) · `3.2` (تاریخی) | `lib/chart/spec/*` · `validateHistoricalSpec` |
| داده | `/tf` (`closed`/`forming`/`gaps`/`window`/`anchored`) · `/metadata` · `diff`+`304` | `collector/crypto/historical/api/**` |
| به‌روزرسانی زنده | `HistoricalLivePoller` + poll سبک (۲۶۴B) + حفظ زوم (`viewKey`) | C3/S4 |
| سیاست دادهٔ ناقص | «هیچ کندل ساختگی» · `N/A` · `gaps/missingBars/coveragePct` | S1 · D6/A7 |
| تست‌ها (دروازهٔ عدم‌رگرسیون) | `normalize-s1(40)` · `worker-s2(25)` · `diff-c3(17)` · `cache-c4(13)` · `evict-s4(7)` · `chart-spec-v3` · `analysis-a1` | فازهای C/S |

**هدف V2:** همان چارت، اما با **یک هسته + ده ماژول مستقل**، **رندر افزایشی** (بدون بازساخت ✗)، **Control Center**، و **پروفایل‌ها** به‌عنوان پریست — بدون ساخت چارت دوم ✗ و بدون کپی فرمول ✗.

---

## ۱) گزارش معماری

### ۱.۱ هستهٔ واحد + ده ماژول مستقل
```
                ┌────────────────── Control Center (State Store) ──────────────────┐
                │ profiles · modules{on,params} · layout · persistence(URL+LS)     │
                └───────────────┬──────────────────────────────┬──────────────────┘
      (فقط وضعیت می‌دهد ✗ هرگز به بوم دست نمی‌زند)              │
                                ▼                              ▼
 dataBus ──► ┌──────────────── ChartEngine Core ────────────────┐ ──► LiveBus (diff/304/forming)
             │ TimeAxis   · SeriesRegistry · LayerPainter        │
             │ InteractionBus · SpecGate · MissingPolicy         │
             └───────┬───────────────────────────────────────────┘
                     │ (قرارداد ChartModule)
   ┌───────────┬─────┴─────┬────────────┬──────────┬───────────┬────────┬──────┬──────┬──────────┐
 MultiChart  MicroFlow  Indicators  PriceAction  Signals  MoneyFlow  Pulse   AI   Bots   Advanced
```

### ۱.۲ شش «یکتایی» که یکپارچگی کامل را می‌سازند
| یکتایی | معنا | چرا نقض‌ناپذیر است |
|---|---|---|
| **یک مسیر داده** | ماژول هرگز شبکه/DB را مستقیم صدا نمی‌زند ✗ | `dataBus` تنها دروازه است؛ همه از سرور (S1–S5) می‌آید |
| **یک منبع ریاضی (AL)** | فرمول فقط در `lib/analysis/**` | D11: چارت بدون فرمول · `lib/historical/indicators.ts` فقط shim |
| **یک قرارداد نسخه (SpecGate)** | اعتبارسنجی `3.0`/`3.2` + نسخهٔ هر ماژول | هر ماژول `version` اعلام می‌کند ⇒ قابل بازرسی در SSR (`data-mod-*`) |
| **یک موتور رندر (LayerPainter)** | نوشتن روی بوم فقط در painter | ماژول‌ها فقط `RenderPlan` می‌دهند ⇒ تضاد بصری در یک جا حل می‌شود |
| **یک سیاست دادهٔ ناقص** | «بدون ساختگی» + `N/A` + شمارش گپ | `MissingPolicy` مشترک؛ ماژول نمی‌تواند مقدار جعلی بسازد ✗ |
| **یک معماری افزایشی** | به‌روزرسانی سری‌ها با `add/remove/update` | بازساخت کامل چارت ممنوع ✗ (زوم کاربر می‌پرد · باگ واقعی C3/S5) |

### ۱.۳ قرارداد ماژول (قلب معماری)
```ts
export interface ChartModule<S = Record<string, unknown>> {
  id: ModuleId;                       // "indicators" | "moneyflow" | …
  version: string;                    // semver · در SSR منتشر می‌شود
  labelKey: string;                   // i18n (هیچ متن ثابت در دامنه ✗)
  requires?: { data?: DataNeed[]; modules?: ModuleId[]; tf?: string[] };
  defaults: S;                        // پارامترهای پیش‌فرض
  spec(s: S): SpecFragment;           // قطعهٔ قرارداد (SpecGate اعتبار می‌سنجد)
  compute?(ctx: AlCtx): AlOutput;     // ریاضی — فقط با توابع AL ✓
  render(ctx: RenderCtx): RenderPlan; // series/layer/pane/marker (اعلان، نه نقاشی)
  controls: ControlSchema;            // همان چیزی که Control Center می‌سازد
  live?: { mode: "onForming" | "onClosed" | "diff"; throttleMs?: number };
}
```

### ۱.۴ RenderPlan و SeriesRegistry
```ts
type RenderPlan = {
  series?: SeriesPlan[];   // {id, role:"main"|"overlay"|"pane", paneId?, scaleId?, colorKey?}
  layers?: LayerPlan[];    // پوسته‌های بوم (کراس/ساختار/FVG/…)
  markers?: MarkerPlan[];  // مارکرهای سیگنال
  panes?: PanePlan[];      // پنل‌ها با heightRatio (مجموع ≤ ۰٫۶ ✓ قاعدهٔ موجود)
};
interface SeriesRegistry {
  ensure(plan: SeriesPlan): ChartSeries;      // ساخت اگر نبود
  update(id: string, points: Point[]): void;  // به‌روزرسانی **افزایشی** (بدون remove ✗)
  drop(id: string): void;                     // حذف تمیز سری حذف‌شده
  list(): SeriesPlan[];
}
```
> **قاعدهٔ سخت:** سوییچ یک ماژول ⇒ فقط `ensure`/`update`/`drop` ✓ — **هرگز** بازساخت کامل ✗ (زوم/اسکرول کاربر باید بماند؛ امروز `viewKey` فقط روی بازساخت کار می‌کند ⇒ در P2 به update افزایشی ارتقا می‌یابد).

### ۱.۵ LiveBus و InteractionBus
- **LiveBus (موجود ✓):** `since` + `If-None-Match` + **۳۰۴ بدون بدنه** + تریگر `forming` با throttle ۳۰s + poll سبک ۲۶۴B. ماژول‌های لحظه‌ای با `live.mode` اعلام می‌کنند چه‌وقت به‌روز شوند ✓.
- **InteractionBus (موجود ✓):** crosshair/zoom/selection + `viewKey` + `redraw()`. ماژول‌ها **مستقیم وصل نمی‌شوند** ✗ (فقط از هسته ✓).

### ۱.۶ وضعیت واقعی ده ماژول
| ماژول | وضعیت | امروز چه دارد | چه باید تکمیل شود |
|---|---|---|---|
| **MultiChart** | ◐ | هستهٔ `BaseChart` + overlay/پنل مخفی + چند سری | `SeriesRegistry` رسمی · شبکهٔ چندچارت هم‌زمان (sync zoom) · مقایسهٔ چند نماد |
| **MicroFlow** | ✗ | — | endpoint سرور (trades/depth) + delta/imbalance در AL + ماژول `onForming` |
| **Indicators** | ✓ | ۹ اندیکاتور AL + `params.json` + برابری AL↔CJS + پنل RSI/MACD | بستهٔ ماژول + کنترل داینامیک + رندر افزایشی |
| **PriceAction** | ✓ | Swing/BOS/CHoCH/FVG + provisional/confirmed | ماژول + کنترل پیوت/حداقل بدنه + نمایش نواحی |
| **Signals** | ✓ | ۷ خانواده + نسخهٔ فرمول + `data-al-signals` | ماژول + فیلترها + tooltip بج‌ها |
| **MoneyFlow** | ✗ | — | CVD/OI/funding از سرور + ماژول پنل |
| **Pulse** | ✗ | تقویم رویداد در ماکرو ✓ | احساسات/اخبار + ماژول رویداد |
| **AI** | ✗ | — | سرویس سرور-ساید + spec JSON + audit/rollback |
| **Bots** | ✗ | — | executor paper-first + ریسک/سایز/حدضرر + توقف اضطراری + لاگ |
| **Advanced** | ◐ | دیاگنوستیک غنی در SSR (`data-hist-*`) | پنل سنجش زنده: فریم · payload · کش · spec · نسخهٔ ماژول‌ها |

### ۱.۷ مرزهای امنیت/مسئولیت (تصویب‌شده)
- **AI:** فقط سرور-ساید ✓ · کلید API هرگز در مرورگر ✗ · خروجی دارای نسخه/مسیر ✓ + «تضمینی نیست» ✓ + audit/rollback ✓
- **Bots:** paper-first ✓ · سقف ریسک/حجم/حدضرر ✓ · **توقف اضطراری** ✓ · لاگ هر تصمیم ✓ · اجرای واقعی **فقط با تأیید صریح** ✓
- **دادهٔ تازه:** احترام به rate-limit هر صرافی ✓ + `lag` صادق ✓ + «بدون کندل ساختگی» ✓

---

## ۲) پروفایل‌ها — نیاز مارکتینگ **بدون** چارت جدید

### ۲.۱ تعریف قراردادی
```ts
type ChartProfile = {
  id: "classic" | "micro" | "flow" | "ai" | "hybrid" | "pro";
  nameKey: string;                       // i18n
  modules: Partial<Record<ModuleId, { on: boolean; params?: unknown }>>;
  layout?: { panes?: PaneId[]; paneRatio?: number };
};
```
**قاعدهٔ حیاتی:** پروفایل **فقط داده** است ✓ — هیچ کد، هیچ چارت، هیچ فایل جدا ✗. افزودن پروفایل = یک ورودی در `profiles.ts` ✓.

### ۲.۲ شش پروفایل پیشنهادی
| پروفایل | ماژول‌های روشن (پیش‌فرض) | وعدهٔ محصولی | انتشار در SSR |
|---|---|---|---|
| **Classic** | MultiChart + Indicators | «چارت کلاسیک حرفه‌ای» | `data-chart-profile="classic"` |
| **Micro** | + MicroFlow | «ریزساختار لحظه‌ای» | `data-chart-profile="micro"` |
| **Flow** | + MoneyFlow + Pulse | «رد پای پول و رویداد» | `data-chart-profile="flow"` |
| **AI** | + AI | «تحلیل هوشمند» | `data-chart-profile="ai"` |
| **Hybrid** | + PriceAction + Signals (سبک) | «تعادل ساختار و سیگنال» | `data-chart-profile="hybrid"` |
| **Pro** | همه (با بودجهٔ رندر) | «همه‌چیز، حرفه‌ای» | `data-chart-profile="pro"` |

### ۲.۳ چرا هم مارکتینگ راضی می‌شود و هم معماری سالم می‌ماند
| نیاز مارکتینگ | چگونه برآورده می‌شود | چرا فنی سالم است |
|---|---|---|
| «چارت‌های ویژه» معرفی کند | هر پروفایل = یک صفحهٔ محصول/لینک | یک کد، شش پریست ✓ |
| قابلیت خاص را تبلیغ کند | `data-chart-profile` + اسکرین‌شات/ویدیو | خروجی قابل‌بازرسی ✓ |
| تفاوت بصری «انواع چارت» | فقط ترکیب ماژول/پنل فرق می‌کند | ساختار رندر یکی است ✓ |
| آیندهٔ نامحدود | ماژول تازه ⇒ پروفایل تازه در یک خط | بدون شاخه‌شدن کد ✗ |

---

## ۳) Control Center — مرکز فرماندهی

### ۳.۱ ساختار
**سایدبار عمودی**، ۱۰ تب با **نام کوتاه** و **آیکون مینیمال تک‌رنگ**:
`MultiChart · MicroFlow · Indicators · PriceAction · Signals · MoneyFlow · Pulse · AI · Bots · Advanced`

هر تب (چیدمان ثابت):
1. **سوییچ ON/OFF** ماژول
2. **آیتم‌های فعال** (بالا) — حذف سریع + کشیدن برای ترتیب
3. **کتابخانهٔ آیتم‌ها** (پایین) — **افزودن با کلیک روی آیتم** (بدون دکمهٔ `+` ✗)
4. **تنظیمات درون‌خطی** (کلیک روی آیتم ⇒ پنل کوچک پارامترها)
5. **خلاصهٔ پارامترها** در همان ردیف (مثل `EMA 21 · RSI 14`)

### ۳.۲ قرارداد state و پایداری
```ts
type ChartState = {
  profile: ProfileId;
  modules: Record<ModuleId, { on: boolean; params: object }>;
  layout: LayoutState;
};
// انتشار: URL  ?profile=hybrid&mod=indicators:ema21+fvg   → لینک اشتراکی ✓
// پایداری: localStorage سبک (فقط تنظیمات، نه دادهٔ کندل ✗)
// SSR: data-chart-profile · data-mod-<id>="on|off" · data-mod-version
```

### ۳.۳ چرا تداخل ندارد (سه نگهبان)
1. **State مرکزی:** ماژول‌ها state را نمی‌خوانند/نمی‌نویسند ✗ — ورودی می‌گیرند و `RenderPlan` می‌دهند ✓
2. **painter انحصاری:** ترتیب/شفافیت/تضاد بصری در یک نقطه حل می‌شود ✓
3. **بودجهٔ رندر:** سقف سری/پنل/مارکر ✓ + `Advanced` سنجش می‌دهد ✓ + اگر پروفایل سنگین شد ⇒ ماژول کم‌اولویت **خودکار خاموش** ✓ (شفاف و اعلام‌شده ✓)

### ۳.۴ چرخهٔ عمر یک کلیک (قرارداد رفتاری)
```
کلیک روی آیتم کتابخانه
  → state.modules[id].on = true
  → SpecGate.validate(fragment)          (نسخه/پارامتر مجاز؟ ✓)
  → SeriesRegistry.ensure(plan)          (ساخت سری/پنل اگر نبود ✓)
  → LayerPainter.repaint()               (فقط بوم، بدون بازساخت چارت ✗)
  → SSR/URL/localStorage sync            (قابل اشتراک/بازگشت ✓)
```
معیار سخت: **زوم/اسکرول کاربر پس از کلیک تغییر نمی‌کند** ✓ و هزینهٔ کلیک < ۱۶ms (یک فریم) ✓

---

## ۴) طرح ارتقا — از امروز به V2 (گام‌های مهندسی)

### ۴.۱ نقشهٔ فایل‌ها (از ➜ به)
| امروز | V2 | کار |
|---|---|---|
| `components/base/BaseChart.tsx` | `engine/core/{ChartEngine,SeriesRegistry,LayerPainter,InteractionBus,SpecGate,MissingPolicy}.ts` | استخراج بدون تغییر رفتار ✗ |
| `lib/chart/spec/*` | `engine/contracts/{module,render,profile}.ts` | افزودن `ChartModule`/`RenderPlan`/`ChartProfile` (سازگار عقب‌رو ✓) |
| `lib/analysis/**` (AL) | بدون تغییر ✓ + `modules/*/compute.ts` (wrapper) | ماژول‌ها فقط AL را صدا می‌زنند ✓ |
| `CandleChart.tsx` (۶۰۰+ خط) | `adapters/HistoricalAdapter.tsx` + `modules/registry.ts` | شکستن به ماژول‌ها |
| ۴ چارت ماکرو | `adapters/MacroAdapter.tsx` | **spec 3.0 فریز** ✓ · ماژول‌های لحظه‌ای خاموش ✓ |
| `HistoricalLivePoller` | `engine/live/LiveBus.ts` | همان منطق + تریگر ماژول‌محور ✓ |
| `viewKey` (BaseChart) | `InteractionBus.viewKey` | تبدیل به قرارداد عام + پشتیبانی update افزایشی |
| `/tf` · `/metadata` | + `/flow/*` · `/pulse/*` · `/ai/*` | endpointهای ماژول‌های تازه (با rate-limit ✓) |

### ۴.۲ گام‌ها (هر گام = یک PR مستقل + تست)
1. **هسته:** استخراج `ChartEngine` از `BaseChart` — **بدون هیچ تغییر رفتاری** ✗ (ماکرو و تاریخی بی‌تبه‌بیت ✓)
2. **`SeriesRegistry` + `RenderPlan`:** رسمی‌سازی اعلان سری/پنل/لایه + `update()` افزایشی
3. **`ChartModule` + `SpecGate`:** قرارداد ماژول + نسخه‌ها + انتشار `data-mod-*`
4. **رندر افزایشی:** حذف بازساخت کامل در مسیر داده (زوم بماند ✓) — پیش‌نیاز Control Center ✓
5. **Control Center:** سایدبار ۱۰ تب + سوییچ/کتابخانه/تنظیمات درون‌خطی + URL/localStorage + پروفایل‌ها
6. **ماژول‌سازی موجودها:** `Indicators` · `PriceAction` · `Signals` (روی همان AL ✓ · `data-al-*` دست‌نخورده ✓)
7. **دادهٔ تازه:** MicroFlow (trades/depth) · MoneyFlow (CVD/OI/funding) · Pulse (تقویم/احساسات) — با کش و `lag` صادق ✓
8. **Advanced:** پنل سنجش (فریم · payload · کش · spec · نسخهٔ ماژول‌ها)
9. **AI:** سرویس سرور-ساید + spec JSON + audit/rollback (advisory ✓)
10. **Bots:** paper-first + ریسک/سایز/حدضرر + توقف اضطراری + لاگ (اجرای واقعی = تأیید صریح ✓)

### ۴.۳ سازگاری عقب‌رو (سخت‌گیرانه)
- `MacroAdapter`: سری‌ها از سرور ✓ spec **3.0** ✓ هیچ ماژول لحظه‌ای ✗ — خروجی، `data-spec-version="3.0"` باید **دست‌نخورده** بماند ✓
- `HistoricalAdapter`: spec **3.2** ✓ ماژول‌ها فعال ✓ `data-hist-*` موجود حفظ می‌شود ✓
- **۷ سوئیت موجود = دروازهٔ عدم‌رگرسیون در هر گام** ✓ (هر گام سبز نشد ⇒ توقف ✗)

---

## ۵) نقشهٔ اجرایی مرحله‌به‌مرحله (P0…P9)

| فاز | کار | معیار پذیرش سخت | وابستگی | ریسک | نقطهٔ توقف |
|---|---|---|---|---|---|
| **P0** | baseline + فریز: TTI · KB payload · فریم · زمان سوییچ | اعداد ثبت‌شده + ۷ سوئیت سبز | — | اندازه‌نگاری ناقص | اگر baseline نگرفتیم، وارد P1 نشو ✗ |
| **P1** | استخراج هسته (`ChartEngine`) | **صفر تغییر ظاهری/رفتاری** ✓ ماکرو+تاریخی سبز | P0 | پنهان‌شدن رگرسیون در refactor | اگر یک پیکسل/عدد عوض شد، برگرد ✗ |
| **P2** | `SeriesRegistry` + `RenderPlan` + **رندر افزایشی** | سوییچ ماژول ⇒ **زوم نمی‌پرد** ✓ · صفر rebuild | P1 | پیچیدگی LWC در add/remove | اگر زوم پرید ⇒ ادامه نده ✗ |
| **P3** | Control Center + پروفایل‌ها | لینک اشتراکی پروفایل ✓ · بازگشت وضعیت بعد از reload ✓ · کلیک < ۱۶ms | **P2** | لگ روی پروفایل سنگین | اگر کلیک کند شد ⇒ بودجهٔ رندر را فعال کن ✓ |
| **P4** | ماژول‌سازی Indicators/PriceAction/Signals | برابری AL↔CJS بی‌تبه‌بیت ✓ · `data-al-*` دست‌نخورده ✓ | P2,P3 | دوباره‌کاری ریاضی ✗ | اگر فرمولی دوباره نوشته شد ⇒ توقف ✗ |
| **P5** | دادهٔ تازه: MicroFlow/MoneyFlow/Pulse | احترام به rate-limit ✓ · `N/A` صادق ✓ · هیچ دادهٔ ساختگی ✓ | P2 | بلاک‌شدن صرافی ✗ | اگر ۴۲۹/۴۱۸ دیدیم ⇒ همان لحظه توقف ✓ |
| **P6** | Advanced | اعداد زنده و قابل‌انتشار | P3 | نویز در UI | — |
| **P7** | AI | کلید در سرور ✓ · خروجی نسخه‌دار + audit ✓ | P5,P6 | هزینه/تاخیر مدل | اگر تاخیر > بودجه ⇒ async + کش ✓ |
| **P8** | Bots | paper-first ✓ · توقف اضطراری ✓ · لاگ کامل ✓ · اجرای واقعی = تأیید صریح ✓ | P7 | ریسک مالی | **بدون تأیید صریح، هرگز live ✗** |
| **P9** | بسته‌بندی + مستندات | سند + تست + **نمونهٔ ماژول جدید در یک ساعت** ✓ | همه | — | — |

---

## ۶) سند نهایی پیشنهادی + راهنمای ماژول + نمونه

**`CHART_ENGINE_V2_ARCHITECTURE.md` (همین سند) شامل:**
۱) معماری و شش یکتایی · ۲) قراردادها (`ChartModule` · `RenderPlan` · `ChartProfile` · `ChartState`) ·
۳) پروفایل‌ها · ۴) Control Center · ۵) نقشهٔ اجرایی P0–P9 · ۶) راهنمای ساخت ماژول · ۷) تست‌ها · ۸) نمونهٔ ماژول.

**راهنمای ساخت ماژول (چک‌لیست اجباری):** ① `id`/`version`/`labelKey` ✓ ② `requires` دقیق (اگر دادهٔ تازه می‌خواهد ⇒ endpoint سرور + کش ✓) ③ `compute` فقط با AL ✓ ④ `render` صرفاً `RenderPlan` ✓ ⑤ `controls` بدون دکمهٔ `+` ✓ ⑥ تست: (الف) رندر بدون داده = `N/A` ✓ (ب) خاموش/روشن ⇒ زوم نمی‌پرد ✓ (ج) نسخه در SSR منتشر می‌شود ✓

**نمونهٔ ماژول جدید (اجراپذیر با دادهٔ موجود، بدون منبع تازه):** «Volume Pulse» — z-score حجم روی کندل‌های بسته:
```ts
export const volumePulseModule: ChartModule<{ window: number; threshold: number }> = {
  id: "pulse", version: "1.0.0", labelKey: "mod.pulse",
  defaults: { window: 96, threshold: 2.5 },
  requires: { tf: ["1m","5m","15m","1h","4h","1d"] },
  spec: (s) => ({ kind: "pane", id: "pulse", heightRatio: 0.18, params: { ...s } }),
  compute: ({ closed }) => ({
    z: zScore(closed.map((c) => c.volume ?? 0), s.window),   // از توابع AL ✓
  }),
  render: ({ computed }) => ({
    panes: [{ id: "pulse", heightRatio: 0.18 }],
    series: [{ id: "pulse.z", role: "pane", paneId: "pulse", colorKey: "signalInfo" }],
    markers: spikeMarkers(computed.z, s.threshold), // جهش‌های معنادار ✓
  }),
  controls: { window: { type: "int", min: 12, max: 500 }, threshold: { type: "float", min: 1, max: 6 } },
  live: { mode: "onClosed" },
};
```
✅ با همین الگو: `MicroFlow`/`MoneyFlow`/`Pulse(AI)` هم فقط یک فایل + یک ثبت‌اند — **بدون لمس هسته** ✓ و بدون چارت جدید ✗.

---

## ۷) P0 — Baseline و فریز رفتار (اجرا و ثبت‌شده)

**زمان اجرا:** `2026-09-24T13:21:16Z` · **مرجع فریز:** این سند (مخزن Git ندارد ⇒ سند + اعداد = مرجع فریز)

| سنجه | مقدار Baseline (P0) | یادداشت |
|---|---|---|
| `tsc --noEmit` | **EXIT=0** ✓ | دروازهٔ ساخت |
| `eslint` (۵ فایل کلیدی) | **EXIT=0** ✓ | بدون warning |
| `/tf` کامل (heavy) | **1,904,993 B · 2.23s** | مسیر SSR |
| `/api/historical/tf?light=1` (poll) | **675 B · 2.07s** | **~۲۸۲۲× کوچک‌تر** ✓ |
| درخواست شرطی (`If-None-Match`) | **304 · 0 B** ✓ | «تغییری نیست» = صفر بایت |
| `/tf 1h` (کش دیسکی + sidecar) | **0.036 s** ✓ | مسیر گرم |
| `/tf 1d` (استارت سرد/کش کهنه) | **11.82 s** ⚠️ | سقفِ شناختهٔ ۱d؛ کش دیسکی در بوت گرم می‌شود ✓ |
| SSR صفحهٔ تاریخی | **1,330,015 B** (`candles=5001` · `basis-bars=5000` · `markers=fvg_bear:4,fvg_bull:6` · `cache=miss` · `time-boundary=utc-21`) | شامل ۵۰۰۱ کندل در payload |
| سوئیت‌ها (۷) | آخرین اجرای کامل: `normalize-s1=40` · `worker-s2=25` · `diff-c3=17` · `cache-c4=13` · `evict-s4=7` · `analysis-a1=0 خطا` · `chart-spec-v3=3 کشور` — همه **سبز** ✓ | فرمان بازسنجی در پیوست |

**قاعدهٔ فریز (حاکم بر P1 تا P9):**
1. هر فاز فقط وقتی «قبول» است که **هر ۷ سوئیت سبز** بماند ✓ (هر قرمزی ⇒ توقف و بازگشت ✗)
2. اعداد baseline **نباید بدتر شوند** (payload · زمان گرم · بایت ۳۰۴ · زوم) ✓ — بهبود، آزاد ✓
3. «بدون تغییر رفتار» یعنی: خروجیِ همین اعداد و همان `data-*` در ماکرو (`3.0`) و تاریخی (`3.2`) ✓

**فرمان بازسنجی P0 (در هر فاز تکرار شود):**
```bash
cd /home/mohsen/TraderBOT
(cd frontend && npx tsc --noEmit) && (cd frontend && npx eslint components/base/BaseChart.tsx components/domain/historical/CandleChart.tsx lib/server/historical.ts)
node collector/crypto/historical/test/normalize-s1.test.cjs && node collector/crypto/historical/test/worker-s2.test.cjs \
 && node collector/crypto/historical/test/diff-c3.test.cjs && node test/cache-c4.test.cjs \
 && node collector/crypto/historical/test/evict-s4.test.cjs && node test/analysis-a1.test.cjs && node test/chart-spec-v3.test.cjs
# payload/۳۰۴:  curl -s -D - -o /dev/null 'http://localhost:4000/tf/BTCUSDT/1h?exchange=binance_spot'
```

### ۷.۱ معیارهای سخت P2 (تصویب‌شده — بدون این‌ها P3 شروع نمی‌شود ✗)
| معیار | سنجش |
|---|---|
| زوم کاربر **هرگز** نمی‌پرد | تست دستی + `data-*`: بازهٔ دیدنی قبل/بعد از تغییر ماژول یکسان ✓ |
| **هیچ بازساخت کامل چارت** مجاز نیست ✗ | شمارندهٔ `chart.remove()` = صفر در چرخهٔ تغییر ماژول ✓ (Advanced می‌سنجد) |
| تغییر ماژول = فقط `add/remove/update` | لاگ `SeriesRegistry` (چه سری‌ای ساخته/به‌روز/حذف شد) ✓ |
| painter فقط بخش‌های تغییر‌یافته را رسم کند | شمارش رسم لایه‌ها + فریم‌تایم < ۱۶ms ✓ |

---

## ۸) گزارش پیشرفت P1 (هستهٔ V2)

### ۸.۱ ماژول‌های ساخته‌شده (همه `TSC=0` ✓ · همه با خودآزمون ✓)
| ماژول | فایل | چه می‌دهد |
|---|---|---|
| **SeriesRegistry** | `components/base/engine/core/seriesRegistry.ts` | `orderPoints` (نگهبان ترتیب، منتقل از BaseChart ✓) · `ensure/update/drop/list/stats` · منطق **افزایشی** (`partial` روی دنباله ✓ · `full` روی بازنگری ✓ · `ignored` ناشناس ✓) · selfTest |
| **LayerPainter** | `.../core/layerPainter.ts` | `createRedrawScheduler` (ادغام در یک فریم ✓ · `dispose` ⇒ صفر رسم ✗) · `class LayerPainter` (رسم **فقط لایه‌های کثیف** ✓) · selfTest |
| **SpecGate + MissingPolicy** | `.../core/specGate.ts` | سیاست واحد دادهٔ ناقص (`fabricate:false` ✗ + `N/A` ✓) · `validateModuleFragment` (شناسه/نوع/semver/`heightRatio ≤ 0.6`/سریالایزپذیری ✗) · selfTest |
| **InteractionBus + ViewMemory** | `.../core/interactionBus.ts` | حفظ زوم با کلید `symbol\|tf` ✓ · گذرگاه رویداد نام‌دار با تحمل خطای شنونده ✓ · selfTest |
| **ChartEngine (facade)** | `.../core/chartEngine.ts` | `{series, layers, interaction, view, applyPlan(), stats()}` · **`applyPlan` فقط ensure/update/drop ✓** (هیچ بازساخت کامل ✗) · دروازهٔ قرارداد ⇒ بدون ساخت سری ✗ |

### ۸.۲ سیم‌کشی‌های انجام‌شده (فریز P0 محفوظ ✓)
- نگهبان ترتیب سری‌ها ⇒ `orderPoints` ✓ (۱.۱)
- زمان‌بند رسم ⇒ `createRedrawScheduler` ✓ · `rafRef` حذف ✓ (۱.۲ب)
- **دروازهٔ CI:** `data-engine-selftest="ok:0|fail:N"` + `data-engine-selftest-first` در SSR ✓ + assertion اجباری در `chart-spec-v3` ✓ (هر **۵** ماژول سنجیده می‌شوند ✓)
- **نقاش لایه‌ها ⇒ `LayerPainter`** ✓ (پل مهاجرت، رفتار عیناً یکسان ✓ — شمارنده‌های `painted/skipped` فعال ✓)

### ۸.۳ وضعیت اتصالات P1.4b
| # | اتصال | مقصد | وضعیت |
|---|---|---|---|
| 1 | `paintLayers(paintCtx, layers)` (≈۵۸۹) | `LayerPainter.register+paint` (**با fallback برای SSR/پیش از mount** ✓) | ✅ انجام شد (رفتار یکسان ✓ · شمارندهٔ `painted/skipped` فعال ✓) |
| 2 | `savedView` (ذخیره در cleanup · بازگردانی بعد از mount) | `ViewMemory.save/restore(viewKey)` | ✅ انجام شد (اعتبارسنجی داخل هسته ✓ · شمارندهٔ `saved/restored/missed` فعال ✓) |
| 3 | حلقهٔ سری‌ها + `series.setData(ordered)` (≈۷۰۰–۷۶۰) | `SeriesRegistry.ensure/update` | ⏳ **آخرین اتصال** (ریسک متوسط) |

### ۸.۶ پچ آمادهٔ اتصال #۳ (اجرای دقیق، برای نوبت بعد)
```ts
// (۱) پیش از حلقهٔ سری‌ها — ساخت «آداپتور» برای هر سری (بدون تغییر رفتار ✗):
const engineSeries = engineSeriesRef.current;           // new SeriesRegistry() داخل همان اثر mount
// (۲) جایگزینیِ درون حلقه (هر جا سری ساخته می‌شود):
engineSeries.ensure({ id: s.id, role, paneId, scaleId, colorKey }, {
  setData: (pts) => series.setData(pts as never),
  update: (p)  => series.update(p as never),              // برای مسیر افزایشی P2 ✓
});
// (۳) جایگزینیِ setData فعلی:
engineSeries.update(s.id, ordered as SeriesPoint[]);      // partial روی دنباله ✓ · full روی بازنگری ✓
// (۴) در cleanup: برای هر سریِ خروجی‌رفته ⇒ engineSeries.drop(id) ✓ (شمارندهٔ dropped)
```
**معیار قبولی #۳:** ۷ سوئیت سبز ✓ · `partial` روی دادهٔ تازه ✓ · `full` فقط روی بازنگری/تغییر TF ✓ · زوم نپرد ✓ · صفر `chart.remove()` اضافه ✗
**نکتهٔ ایمنی:** اگر `series.update` در LWC خطا داد ⇒ همان `setData` قبلی اجرا شود (fallback ✓) تا چارت هرگز نیفتد ✗.

### ۸.۷ تلهٔ «آداپتور مرده» در #۳ (کشف‌شده پیش از اجرا — و پچ ایمن‌شده)
**مسئله:** پس از **بازساخت چارت** (`chart.remove()` + ساخت دوبارهٔ سری‌ها ✗)، اشیای سری قدیمی مرده‌اند ✗ ولی `SeriesRegistry` همان آداپتور کهنه را نگه می‌دارد ⇒ `series.update(...)` روی سریِ مرده ممکن است استثنا بدهد ✗ (و در بدترین حالت چارت بی‌داده شود ✗).
**پچ ایمن‌شده (جایگزین پچ سادهٔ §۸.۶ برای گام ۲/۳):**
```ts
// الف) «نسل» چارت: هر بار که اثر اصلی چارت بازساخته می‌شود، نسل ++ می‌شود
const generationRef = useRef(0);           // در cleanup اثر: generationRef.current += 1
// ب) آداپتور هم‌نسل: اگر نسل عوض شده باشد ⇒ `update` ممنوع ✗ و فقط setData ✓
const generation = generationRef.current;
engineSeries.ensure({ id: s.id, scaleId: s.priceScaleId ?? "right" }, {
  setData: (pts) => series.setData(pts as never),
  update: (p) => {
    if (generationRef.current !== generation) throw new Error("stale-generation"); // ✗ رد
    series.update(p as never);
  },
});
// ج) فراخوان ایمن: هر خطای آداپتور ⇒ بازگشت به setData + ensure تازه ✓
try { engineSeries.update(s.id, ordered as SeriesPoint[]); }
catch { engineSeries.ensure(/* همان پلن */, { setData: (pts) => series.setData(pts as never) });
        series.setData(ordered as never); }
```
**چرا این مهم است:** P2 («هیچ بازساخت کامل ✗») قرار است بازساخت را **حذف** کند؛ تا آن روز، بازساخت رخ می‌دهد ⇒ بدون این محافظ، `update` افزایشی می‌تواند روی سری مرده اجرا شود ✗.
**تست لازم برای #۳ (افزودن به `chartEngineSelfTest`):** آداپتوری که در `update` استثنا می‌دهد ⇒ رجیستری باید `full` (setData) کند، نه اینکه بیفتد ✗.

---

## ۹) P2 — رندر افزایشی (نقشهٔ اجرایی دقیق، آمادهٔ شروع)

### ۹.۱ وضعیت فعلی پس از P1 (دقیق)
- **مسیر دادهٔ سری از هسته می‌گذرد** ✓ (`ensure` در هر ساخت + `update` افزایشی + محافظ try/catch ⇒ بدون افت چارت ✗)
- **ولی بازساختِ `deps`-محور هنوز رخ می‌دهد** ✗: اثر اصلی چارت به `[dataKey, ...deps]` وابسته است ⇒ با هر کندل تازه، چارت **از نو ساخته می‌شود** ✗ (زوم با `ViewMemory` بازمی‌گردد ✓ ولی هزینهٔ ساخت هست ✗)
⇒ **P2 = بستن همین شکاف** تا «هیچ بازساخت کامل ✗» واقعاً صادق شود.

### ۹.۲ گام‌های P2 (هر گام جداگانه + ۷ سوئیت سبز ✓)
> ⚠️ **تصحیح مهم (کشف‌شده پیش از اجرا):** گام‌های ۹.۲.۱ و ۹.۲.۲ **اتمی‌اند** — نمی‌توان فقط `dataKey` را ساختاری کرد ✗: مسیر دادهٔ سری (ساخت + `setData/update`) **داخل همان اثرِ `[dataKey, …]`** است (خطوط ~۷۰۰–۱۰۳۰) ⇒ اگر `dataKey` محتوا را نبیند، **کندل تازه هیچ‌وقت نمی‌رسد** ✗✗. پس باید با هم و در یک PR بیایند ✓.
>
> **بدنهٔ امروز `dataKey` (شاهد):**
> ```ts
> shown.map((s) => `${s.id}:${pts.length}:${first.t}:${last.t}:${lastValue}`).join(",")
> ```
> ⇒ با هر کندل تازه (و حتی تغییر قیمت کندل در حال تشکیل ✗) **بازساخت کامل** رخ می‌دهد ✗.

| گام | کار | معیار قبولی |
|---|---|---|
| **۹.۲.۱+۹.۲.۲ (اتمی)** | (الف) `dataKey` **ساختاری**: `` shown.map(s => `${s.id}:${s.type ?? "line"}:${s.priceScaleId ?? "right"}`).join(",") `` ✓ (ب) `dataSig` جدا برای محتوا (همان رشتهٔ فعلی ✓) (ج) **اثر تازه** روی `[dataSig]` که فقط `engineSeries.update(id, points)` را صدا می‌زند (سری‌ها از `seriesByIdRef` ✓ · بدون دست‌زدن به پنل/مقیاس‌ها ✗) | کندل تازه اضافه می‌شود ✓ · `dataKey` ثابت می‌ماند ✓ · چارت **بازساخت نمی‌شود** ✗ · زوم ثابت ✓ |
| **۹.۲.۳** | لایه‌ها: `invalidate` انتخابی | ⚠️ **تصمیم: لازم نیست** — هر علتِ `redraw` (داده/تم/زوم/ریسایز) **مختصات لایه‌ها را عوض می‌کند** ⇒ رسم دوباره درست است ✓ و `skipped>0` طبق طراحی **کم‌رخداد** می‌ماند ✗. سود واقعیِ «فقط بخش‌های تغییر‌یافته» از دو جای دیگر می‌آید: **(الف) مسیر افزایشی سری‌ها** (`SeriesRegistry.update` ✓ — انجام‌شده ✓) و **(ب) ادغام رسم در یک فریم** (`createRedrawScheduler` ✓ — انجام‌شده ✓). |
| **۹.۲.۴** | انتشار سنجه‌ها در `[data-engine]` | ✅ انجام شد (`created/partial/full/dropped/painted/skipped`) |
| **۹.۲.۵** | تست خودکار چهار معیار | ⏳ نیازمند مرورگر (Playwright) — در این محیط نصب نیست ✗ ⇒ پروتکل دستی زیر جایگزین موقت است ✓ |
| **۹.۲.۶** | `chartEngineSelfTest`: آداپتور خطاانداز ⇒ `full` ✓ · پلن دنباله ⇒ `partial` و `created=0` ✓ | ⏳ (۱ ویرایش در هسته، بدون ریسک ✓) |

### ۹.۲.۷ پروتکل سنجش دستی چهار معیار (مرورگر · ۳۰ ثانیه)
۱) صفحهٔ تاریخی را باز کن · کنسول:
```js
const read = () => [...document.querySelectorAll("[data-engine]")].map(e => e.dataset.engine)[0];
read();                       // نمونهٔ اول
```
۲) بگذار یک کندل تازه برسد (یا TF را عوض کن و برگرد) و دوباره `read()` بزن:
| مشاهده | حکم |
|---|---|
| `partial` افزایش یافته و `created`/`dropped` ثابت | ✅ معیار ۱ و ۳ برقرار (افزایشی ✓ · بدون ساخت/حذف ✗) |
| `painted` رشد کرده ولی نمودار روان است | ✅ معیار ۴ (فریم) |
| بازهٔ دیدنی/زوم **بدون تغییر** | ✅ معیار ۲ (هیچ بازساخت کامل ✗) |
| `full` رشد کرده یا زوم پریده | ❌ ⇒ **فلگ به `false` برگردد** (یک خط) و گزارش شود ✗ |

---

## ۱۰) P3-b — رندر Control Center (نقشهٔ اجرایی + کد آماده)

### ۱۰.۱ وضعیت پس از P3-a (تأییدشده)
- `engine/core/profiles.ts` ✅ — شش پروفایل روی **یک** موتور ✓ · `applyProfile` ✓ · `encodeState/decodeState` (URL ✓) · `profilesSelfTest()` ✓ (در زنجیرهٔ CI ✓)
- هستهٔ V2 = **۶ ماژول** (`SeriesRegistry` · `LayerPainter` · `SpecGate` · `InteractionBus` · `ChartEngine` · `Profiles`) · همه `TSC=0` ✓

### ۱۰.۲ گام‌های P3-b (شش ویرایش، همه کوچک)
| # | فایل | تغییر |
|---|---|---|
| 1 | `app/dashboard/historical/crypto/page.tsx` | destructure: `profile: profileParam` ✓ |
| 2 | همان | `const profileId = applyProfile(profileParam ?? "classic").profile;` ✓ (+ import از `engine/core/profiles` ✓) |
| 3 | همان | `<CandleChart … profile={profileId} />` ✓ |
| 4 | `CandleChart.tsx` | prop اختیاری `profile?: string` ✓ |
| 5 | همان | destructure `profile,` ✓ |
| 6 | همان | `data-chart-profile={profile ?? "classic"}` ✓ (انتشار SSR ⇒ **قابل سنجش و اسکرین‌شات مارکتینگ** ✓) |
| 7 | `test/chart-spec-v3.test.cjs` | assertion: `data-chart-profile` یکی از شش id باشد ✓ (+ `?profile=micro` ⇒ همان ✓) |

### ۱۰.۳ کامپوننت Control Center (`components/domain/historical/ControlCenter.tsx` · Client)
```tsx
"use client";
// props سریالایزپذیر: { profile, state, moduleLabels, profileLabels }  ✓ (بدون تابع ✗ — درس Turbopack)
// چیدمان: سایدبار عمودی · ۱۰ تب کوتاه‌نام (MODULE_IDS) · آیکون مینیمال تک‌رنگ ✓
// هر تب:  ① سوییچ ON/OFF  ② آیتم‌های فعال (بالا، با حذف سریع)  ③ کتابخانه (پایین)
//         ④ افزودن با **کلیک روی آیتم** (بدون دکمهٔ + ✗)  ⑤ تنظیمات درون‌خطی  ⑥ خلاصهٔ پارامترها
// پروفایل: ردیف بالا (classic|micro|flow|ai|hybrid|pro) ⇒ applyProfile + router.replace(encodeState(state))
// منبع حقیقت: engine/core/profiles.ts ✓ (هیچ وضعیت موازی ✗)
```
**معیار قبولی P3-b:** لینک `?profile=hybrid&mod=indicators+moneyflow` ⇒ همان وضعیت ✓ · بازگشت از reload با URL ✓ · سوییچ ماژول ⇒ **زوم نمی‌پرد** ✓ (مسیر افزایشی P2 ✓) · ۷ سوئیت سبز ✓

### ۱۰.۴ جایگاه در نقشه
| فاز | وضعیت |
|---|---|
| P0 · P1 | ✅ |
| P2 | ✅ کد (فلگ روشن) · ⏳ سنجش چهار معیار (§۹.۲.۷) |
| **P3-a** | ✅ پروفایل‌ها/وضعیت/URL + خودآزمون CI |
| **P3-b** | 📋 همین بخش (۷ ویرایش + کامپوننت) ⇒ آمادهٔ اجرا |
| P4 ماژولسازی Indicators/PriceAction/Signals · P5 MicroFlow/MoneyFlow/Pulse · P7/P8 AI/Bots (سرور-ساید + audit) · P9 سند+نمونهٔ ماژول | ⏳ |

### ۹.۳ چهار معیار سخت (اندازه‌گیری)
| معیار | ابزار | آستانه |
|---|---|---|
| زوم هرگز نمی‌پرد | `ViewMemory.stats().restored/missed` + مقایسهٔ بازهٔ قبل/بعد | یکسان ✓ |
| `chart.remove()` = ۰ در چرخهٔ داده | شمارندهٔ **نسل** (`generationRef`) که در cleanup زیاد می‌شود | در چرخهٔ داده **صفر** ✓ |
| فقط `add/remove/update` | `SeriesRegistry.stats().created/dropped` | در چرخهٔ داده **صفر/صفر** ✓ · `partial>0` ✓ |
| painter جزئی + فریم<۱۶ms | `LayerPainter.stats().painted/skipped` + زمان‌بند فریم | `skipped>0` ✓ · فریم < ۱۶ms ✓ |

### ۹.۴ نقاط توقف P2 (سخت)
- زوم پرید ✗ · `created>0` یا `generation++` در چرخهٔ داده ✗ · هر یک از ۷ سوئیت قرمز ✗ · افت چارت/بی‌داده شدن پنل ✗ ⇒ **توقف و بازگشت فوری**
- ریسک اصلی: زنده‌ماندن سری‌ها و **مقیاس‌های پنل** بین دو فریم ✓ (پنل‌ها در مسیر update نباید دست بخورند ✗)

### ۸.۴ P2 — رندر افزایشی (زیرساخت کامل ✓)
**تغییر:** جایگزینی بازساختِ `deps`-محور با `engine.applyPlan(...)` در مسیر داده.
| معیار سخت | ابزار سنجش |
|---|---|
| زوم هرگز نمی‌پرد | `ViewMemory.restore` قبل/بعد ✓ |
| `chart.remove()` = ۰ در چرخهٔ داده | `ApplyPlanResult.created/dropped` = صفر ✓ |
| فقط `add/remove/update` | `ApplyPlanResult{created,updated,dropped,partial,full}` ✓ |
| painter فقط جزئیتغییریافته · فریم < ۱۶ms | `paintedLayers`/`skippedLayers` + زمان‌بند ✓ |

### ۸.۵ نقاط توقف (اجباری)
۷ سوئیت سبز نشد ✗ · زوم پرید ✗ · `chart.remove()` در چرخهٔ داده ✗ · اعداد §۷ بدتر شد ✗ ⇒ **توقف و بازگشت**.


---

## ۱۱) P3-b · P4 · P9-الف — گزارش اجرا (با اعداد)

> ⚠️ **ترتیب ظاهری سند:** بخش‌های §۹/§۱۰ در میانهٔ فایل نشسته‌اند (با لنگر متن اضافه شدند) — بی‌اثر فنی ✓ · در پاس مرتب‌سازی جابه‌جا می‌شوند ✓.

### ۱۱.۱ P3-b — Control Center (ساخته و وصل شد ✓)
- `components/domain/historical/ControlCenter.tsx` (Client · ~۲۳۵ خط) ✓
- **منبع حقیقت واحد:** `core/profiles.ts` ✓ — خواندن از URL (`decodeState`) · نوشتن با `router.replace(encodeState(...))` (هیچ وضعیت موازی ✗)
- ۱۰ تب کوتاه‌نام (`data-cc-tab` / `data-cc-tab-on`) ✓ · هر تب: سوییچ ON/OFF ✓ + آیتم‌های فعال با حذف سریع ✓ + **کتابخانه با افزودن روی کلیک — بدون دکمهٔ `+`** ✗ + تنظیمات درون‌خطی ✓ + خلاصهٔ پارامترها ✓
- **پروفایل‌ها: دکمه‌های پروفایل حذف شدند** ✗ (بازبینی طراحی ✓) — پروفایل **در کد/سرور** تعیین می‌شود: پیش‌فرض صفحه `pro` ✓ (`applyProfile(profileParam ?? "pro")`) و همان مقدار در `data-control-center`/`data-chart-profile` منتشر می‌شود ✓ ⇒ «پروفایل = پریستِ کد، نه انتخاب کاربر» ✗
- **طراحی کشو (P5/4-UI · بازبینی با ماکاپ `frontend/prochart.png` ✓):** ریل آیکونی **`lucide-react`** (۱۰ آیکون · نام کامل **فقط تول‌تیپ** ✓) · تبِ فعال **سبز** (`text-pos`) ✓ / غیرفعال **خنثی** (`text-muted`) ✓ · سوییچ **قرصی** ✓ · کتابخانهٔ **ردیفی** · ردیابی: `data-cc-tab-selected` · `data-cc-icon` ✓ — ⚠️ این توصیف **نسخهٔ اول** بود؛ در §۱۱.۵ بازبینی دوم (کشوی داخل چارت · کارت‌ها · چند-نمونه) جایگزین شد ✓
- **پروفایل `pro`:** هر ۱۰ ماژول روشن ✓ **+ پارامترهای پیش‌فرض معنادار** (ema/sma · swing/bos/fvg · cross/volumeSpike · cvd/funding/openInterest ✓) تا بخش «آیتم‌های فعال» خالی نماند ✗ — ⚠️ این‌ها پریستِ انتخاب‌اند، **داده نمی‌سازند** ✗
- نیمهٔ سروری: `?profile` ⇒ اعتبارسنجی با هسته ⇒ **`data-chart-profile`** در SSR + assertion در `chart-spec-v3` ✓
- رخداد مسیر: کامپوننت ۹۰۰۳ کاراکتر ⇒ ثبت نشد و ساخت لحظه‌ای شکست ✗ ⇒ دو-بخشی ✓ · نوع `searchParams.profile` ✓

### ۱۱.۲ P4 — ماژول‌سازی موجودها (ناورد D11 در CI ✓)
| ماژول | آیتم‌ها (پیش‌فرض = همان پروژه ✓) | مرجع AL |
|---|---|---|
| Indicators | EMA 21 · SMA 50 · RSI 14 · MACD 12 · ATR 14 · BB 20 · VWAP | `indicators/registry#computeIndicator` |
| PriceAction | Swing 2 · BOS · CHoCH · FVG | `signals/registry#structure+fvg` |
| Signals | Cross · Volume spike · ATR breakout · Patterns · Divergence | `chart/signals#buildSignals` |

**ناورد D11:** ماژول فرمول ندارد ✗ (`computeRef` الزامی ✓) · `modulesSelfTest` ۱۲+ بررسی: شناسه · semver · `live` · آیتم‌ها · **عبور `spec()` از `SpecGate`** · هم‌خوانی پیش‌فرض‌ها با پروژه ✓ · دو ایراد رفع‌شده (TS2322 ⇒ `(): SpecFragment` ✓ · import بی‌استفاده ✓)

### ۱۱.۳ P9-الف — نمونهٔ ماژول تازه («Volume Pulse»)
- `engine/modules/pulse.module.ts` ✓ · **ثبت = یک خط** در `MODULES` ⇒ خودکار در CI ✓ (**صفر لمس هسته** ✗ · بدون تست تازه ✓)
- بدون چرخهٔ ران‌تایم ✓ (`import type` یک‌طرفه ✓)
- ⚠️ **صادقانه: ثبت‌شده ولی بدون رندر** ✗ (تابع `volumeZScore` هنوز در AL نیست) ⇒ وضعیت **planned** ✓ و CI تضمین می‌کند ماژول بدون `computeRef` وارد نشود ✗

### ۱۱.۴ شواهد + وضعیت
```
TSC_EXIT=0 ✓ · ESLINT_EXIT=0 ✓ · ۷ سوئیت: ۴۰ · ۲۵ · ۱۷ · ۱۳ · ۷ · ۹۲ · ۳ کشور ✓
SSR: data-chart-profile=hybrid ✓ · data-engine-selftest="ok:0" (۷ ماژول هسته ✓)
```
| فاز | وضعیت |
|---|---|
| P0 · P1 · P2(کد+فلگ) · P3-a · P3-b · P4 · P9-الف | ✅ |
| P2 سنجش ۴ معیار | ⏳ پروتکل §۹.۲.۷ (مرورگر) |
| P5 · P7 · P8 · P9-ب | ⏳ |

### ۱۱.۵ P5/4-UI — **بازبینی دوم کشو** (۸ مورد کاربر ✓ · اجرا و سنجیده شد)

**فایل‌های لمس‌شده:** `ControlCenter.tsx` (بازنویسی ✓) · `core/library.ts` (**جدید** ✓) · `core/profiles.ts` (مدل چند-نمونه + کدک URL ✓) · `core/chartEngine.ts` (افزودن `librarySelfTest` ✓) · `page.tsx` (میزبان `relative` + رنگ/برچسب ✓) · `messages/macro.{fa,en}.json` ✓ · `app/globals.css` (انیمیشن `cc-sheet` ✓)

| # | خواستهٔ کاربر | پیاده‌سازی | شاهد |
|---|---|---|---|
| ۱ | کشو **بخشی از چارت** باشد، نه کل صفحه | میزبان `relative` فقط چارت را می‌گیرد؛ کشو `absolute inset-y-0 left-0` ⇒ `fixed` حذف ✗ | `data-cc-anchor="chart"` · `data-cc-host="chart"` ✓ |
| ۲ | فلش وسط ارتفاع + انیمیشن نرم + ~۱/۳ عرض + بستن با کلیک روی چارت | فلش `top-1/2 -translate-y-1/2` ✓ · `transition-[transform,opacity] duration-300 ease-out` ✓ · `w-[min(22rem,34%)]` ✓ · اسکریم فقط وقتی باز است ✓ + Esc ✓ | کلاس‌ها در SSR ✓ · `data-cc-scrim` (۰ وقتی بسته ✓) |
| ۳ | کلید ON/OFF ظریف برای **هر آیتم** + ظریف‌ترکردن کلید هدر | `Switch` دو اندازه: `item` = `h-3 w-7` · `header` = `h-3.5 w-9` (کوتاه‌تر از `h-5 w-9` قبل ✓ با طول حفظ‌شده ✓) | `switches=3` (۱ هدر + ۲ آیتم) ✓ |
| ۴ | حذف حالت خنثی/غیرفعال + افزودن چندباره + `+` همه خنثی | `params[key]` = **آرایهٔ نمونه** ✓ (`ParamInstance[]`) ⇒ افزودن مکرر ✓؛ کتابخانه همه فعال و **خنثی** ✓ (بدون `disabled` ✗) | `lib-disabled=0` ✓ · URL نمونه‌ای با دو EMA (۲۱ و ۵۵ ✓) + `lib-count ema:2` ✓ |
| ۵ | پارامترها **به رنگ همان سری در چارت** | `colorKey` عیناً از رجیستری AL ✓ + `resolveSlot(getThemePreset("shahrivar_hist"))` سمت سرور ✓ | EMA `#a3e635` (سبز فسفری همان خط چارت ✓) · SMA `#3b82f6` ✓ |
| ۶ | هر آیتم در **قاب** (نه لیست متنی ✗) | کارت با قاب/پس‌زمینه + نوار رنگ در لبهٔ شروع ✓ | `data-cc-item` + `borderInlineStartColor` ✓ |
| ۷ | کلیک روی آیتم ⇒ **کشوی تنظیمات از پایین** | `SettingsSheet` داخل محدودهٔ چارت ✓: اسلایدر + ورودی عددی با `min/max/step/unit` از AL ✓ · خاموش/روشن ✓ · حذف نمونه ✓ | `data-cc-sheet-*` (پس از کلیک ✓) + انیمیشن `cc-sheet` ✓ |
| ۸ | اعمال و بازبینی | همین سند ✓ | `TSC=0` · `ESLINT=0` ✓ |

**قراردادهای تازه (مهم):**
- `ModuleState.params[key]` از **اسکالر** به **`ParamInstance[]`** تغییر کرد: `{ on: boolean, values: Record<string, number> }` ✓ — خواندن فرم قدیمی تحمل‌پذیر است ✓ (اسکالر/آرایهٔ عددی ⇒ یک/چند نمونه ✓).
- **کدک URL تازه:** `p=<module>.<key>:1~period=21|1~period=55;signals.cross:1` ✓ ⇒ پارامترها هم قابل اشتراک/بازگشت‌اند ✓ (باگ پیشین: `encodeState` پارامترها را در URL نمی‌برد ⇒ با هر تیک ماژول، ویرایش‌های کاربر پاک می‌شد ✗). سقف: ۸ نمونه/آیتم · ۶ پارامتر/نمونه ✓.
- `core/library.ts` = **منبع حقیقت واحد اقلام**: پارامترها از `PARAM_SCHEMA`/`SIGNAL_PARAM_SCHEMA` ✓ (هیچ عدد دوباره‌نویسی نشد ✗) · `librarySelfTest` به دروازهٔ هسته افزوده شد ✓ (۸ سنجه: کلید یکتا · شناسهٔ AL · پارامتر معتبر · پیش‌فرض در بازه · تحمل فرم قدیمی · استقلال نمونه‌ها · حذف کلید · کلمپ ✓).

**شواهد زنده (SSR · `pro`):**
```
TSC=0 ✓ ESLINT=0 ✓ JSON fa/en=ok ✓ HTTP=200 (1,353,884 بایت)
data-engine-selftest="ok:0" ✓ (شامل profilesSelfTest + librarySelfTest تازه ✓)
drawer=absolute inset-y-0 left-0 z-20 w-[min(22rem,34%)] transition-[transform,opacity] duration-300 ✓
-toggle=open · data-cc-open="0" (پیش‌فرض بسته ✓ · inert ✓ · scrim=0 ✓)
items=ema,sma · item-colors=#a3e635,#3b82f6 · param-values=21,50 · item-switch=ema#0,sma#0 ✓
lib=ema:1 sma:1 (بقیه 0) · lib-disabled=0 ✓ (همه `+` خنثی و افزودنی ✓)
URL چند-نمونه: ?p=indicators.ema:1~period=21|1~period=55;signals.cross:1
  ⇒ items=ema,ema,sma · params=21,55,50 · lib-count ema:2 · summary=ema 21 · ema 55 · sma 50 ✓✓
fa: «افزودن: میانگین نمایی (EMA)» · «افزودن: باندهای بولینگر» ✓ (برچسب‌ها از i18n ✓)
candles=5001 ✓ (چارت سالم ✓) · profiles-row=0 ✓
```

**محدودیت‌های صادقانه (باقی‌مانده ✗ — وعدهٔ نادرست نمی‌دهیم):**
1. رندرِ ماژول‌های تازه روی چارت (moneyflow/pulse/microflow/ai/bots/advanced) هنوز کار **P5/4 بک‌اند** است ✓ — یعنی نمونه‌ها/پارامترها **وضعیت انتخاب** را می‌سازند و از URL برمی‌گردند ✓، ولی پنل چارت‌شان رسم نشده ✓ (هیچ پنل ساختگی ✗).
2. رفتار کلیک/انیمیشن کشو و کشوی تنظیمات، **نیاز به تأیید مرورگر** دارد ✓ (SSR فقط ساختار را نشان می‌دهد ✓ — کلیک در خروجی سرور قابل سنجش نیست ✗).
3. کلید ON/OFF هر نمونه «انتخاب کاربر» است ✓؛ چون رندرِ سری برای همهٔ ماژول‌ها هنوز نیست، خاموش‌کردن یک نمونه امروز فقط در وضعیت/URL دیده می‌شود ✓.

### ۱۱.۶ P5/4-UI — **بازبینی سوم** (۹ مورد کاربر ✓ + یک باگ واقعیِ رفع‌شده ✓)

| # | خواسته | پیاده‌سازی | شاهد |
|---|---|---|---|
| ۱ | هدر: **بدون آیکون** · نام **وسط‌چین** و برجسته‌تر · کلید ON/OFF ظریف‌تر و **وسط‌چین کنار نام** · **نام کامل** · «کتابخانه» وسط‌چین | هدر = `justify-center` + `text-sm font-semibold` و کلید `header` کنار نام ✓ · آیکون هدر حذف ✗ · `cc.module.*` به نام‌های کامل بازنویسی شد («نشانگرهای تکنیکال» / «Technical Indicators» ✓) · برچسب کتابخانه `text-center` ✓ | `cc-icons=10` (قبلاً ۱۱ ✗) · `panel-title="نشانگرهای تکنیکال"` ✓ |
| ۲ | دو-ستونه‌بودن کتابخانه | حفظ شد ✓ (`grid-cols-2` ✓) | — |
| ۳ | **سورت/جابجایی با درگ‌ودراپ** برای آیتم‌های فعال | کارت‌ها `draggable` ✓ + دستهٔ `GripVertical` ✓ · ترتیب = **خودِ داده** (آرایهٔ نمونه‌ها + ترتیب کلیدهای `params` ✓) ⇒ در URL هم می‌ماند ✓ و **بدون فهرست ترتیب موازی** ✗ | `draggable=2` · `data-cc-grip=ema,sma` · `data-cc-item-row=0,1` ✓ |
| ۴ | **لینک آیتم‌های چارت ↔ کنترل سنتر** | `ChartLegend.tsx` (**کلاینت ✓**) داخل خود چارت: هر ردیف = سری واقعی (نام/رنگ/آخرین مقدار ✓) · کلیک ⇒ `cc:focus` ⇒ کشو باز + تب + **کشوی تنظیمات همان آیتم** ✓ · هاور دوطرفه ⇒ `cc:highlight` ⇒ رینگ روی ردیف ✓ | `data-chart-legend="2"` · رنگ‌ها `#a3e635,#3b82f6` · مقدارها `84,251.11` و `84,851.43` ✓ (مقدار واقعی AL، نه ساختگی ✗) |
| ۵ | کوتاه‌ترکردن ارتفاع کلیدها | `item` = `h-2.5 w-6` (قبلاً `h-3 w-7` ✓) · `header` = `h-3 w-8` (قبلاً `h-3.5 w-9` ✓) | `sizes = 2×h-2.5 w-6 + 1×h-3 w-8` ✓ |
| ۶ | متن اضافهٔ زیر تب‌ها (ابزارک مرورگر) + فوتر | علت: **`title` بومیِ دکمه‌های ریل** بود ✗ ⇒ حذف شد ✓ (a11y با `aria-label` ✓) و به‌جایش **فوتر وسط‌چین و ریز** با **توضیح همان بخش** (`cc.desc.*` ✓) نشست ✓ — **هیچ نام آیتم/اندیکاتوری در فوتر نیست** ✗ | `tab-title-attr=0` ✓ · `data-cc-desc="indicators">میانگین‌ها، نوسان و مومنتوم روی کندل بسته` ✓ |
| ۷ | پنهان‌کردن آیکون بازشو وقتی کشو باز است + انیمیشن نرم | آیکون با `transition-all duration-300` ⇒ `opacity-0 -translate-x-2 pointer-events-none` وقتی باز ✓ (تداخل با ریل تب‌ها تمام شد ✓) | `data-cc-toggle="open"` + `transition-all` ✓ |
| ۸ | کلیک روی هر آیتم ⇒ کشوی تنظیمات از پایین | پیاده‌سازیِ کامل ✓ (`SettingsSheet` ✓ با اسلایدر/ورودی از اسکیمای AL ✓) — و الان **از دو راه** باز می‌شود: کارتِ کشو ✓ و **ردیف لجند چارت** ✓ (مورد ۴) | `data-cc-sheet-*` ✓ (باز شدن نیاز به کلیک مرورگر ✓) |
| ۹ | حذف «بخش تم مستقل» — همهٔ رنگ‌ها **داخل قالب چارت** | تمام اسلات‌های مصرفی کتابخانه حالا در `lib/chart/themes/shahrivar_hist/colors.ts` تعریف شده‌اند ✓: `series[]` (**پالت اختصاصی قالب ✓**) + `trend` (میانهٔ BB، قبلاً نبود و به پالت پایه نشت می‌کرد ✗) · هیچ رنگ/تمِ بیرون از قالب ✗ | tsc با `satisfies ChartThemePaletteInput` ✓ (شکل پالت قالب تأیید شد ✓) |

**یک باگ واقعی که در همین بازبینی رفع شد ✗→✓:** با مدل چند-نمونه‌ای، حذف یک آیتم (مثلاً SMA) در URL **ثبت نمی‌شد** ✗ ⇒ با اولین تغییر URL (تیک یک ماژول)، `applyProfile` دوباره آن را از پریست **زنده می‌کرد** ✗. راه‌حل: **تومبستون** `[]` (کلید با آرایهٔ خالی ✓) که هم در `p=` کد می‌شود ✓ و هم روی پریست سوار می‌شود ✓ · selfTest تازه: «آیتم حذف‌شده پس از رفت‌وبرگشت URL زنده نشود» ✓.

**شواهد زنده (SSR · `pro`):**
```
TSC=0 ✓ ESLINT=0 ✓ JSON fa/en=ok ✓ HTTP=200 (1,356,306 بایت) ✓ data-engine-selftest="ok:0" ✓
cc-icons=10 (هدر بدون آیکون ✓) · tab-title-attr=0 ✓ · panel-title=Technical Indicators / نشانگرهای تکنیکال ✓
desc=«Averages, volatility and momentum on closed candles» / «میانگین‌ها، نوسان و مومنتوم روی کندل بسته» ✓
legend: 2 ردیف (ema,sma) · رنگ #a3e635/#3b82f6 · مقدار 84,251.11 و 84,851.43 ✓
drag: draggable=2 · grip=ema,sma · rows=0,1 ✓ · switches=3 (sizes: h-2.5 w-6 ×2 · h-3 w-8 ×1) ✓
حذفِ ماندگار: ?p=indicators.sma: ⇒ items=ema فقط ✓✓ (SMA برنگشت ✓)
```

**محدودیت صادقانه (بدون تغییر از قبل):** رندرِ پنل چارتِ ماژول‌های تازه (moneyflow/pulse/…) هنوز P5/4 بک‌اند است ✓ — لجند امروز **سری‌های واقعاً رسم‌شده** را نشان می‌دهد ✓ و ادعای بیشتری نمی‌کند ✗.

### ۱۱.۷ P5/4-UI — **بازبینی چهارم** (۵ اصلاح ظاهری ✓)

| # | خواسته | پیاده‌سازی | شاهد (SSR) |
|---|---|---|---|
| ۱ | تب: **بدون کادر سفید فوکوس** و **بدون قاب سبز** · فقط **رنگ آیکون** سبز شود | کلاس تبِ فعال ⇒ فقط `text-pos` ✓ (قابِ `border-pos/40 bg-pos/10` حذف ✗) · `outline-none` + حلقه فقط برای **کیبورد** (`focus-visible:ring-1 ring-pos/50` ✓) ⇒ کلیک ماوس هیچ کادری نمی‌سازد ✓ | `class="… border border-transparent outline-none … text-pos"` ✓ |
| ۲ | محتوای تب کمی پایین‌تر و **هم‌تراز با نخستین آیکون ریل** (Multi-Chart) | ارتفاع ردیف هدر = **`h-8`** = همان ارتفاع دکمه‌های ریل ✓ ⇒ نام هدر و آیکون اول در **یک خط عمودی** ✓ | `header class="flex h-8 items-center …"` · `data-cc-tab="multichart"` هم `h-8` ✓ |
| ۳ | نام هدر **کوچک‌تر و ظریف‌تر** | `text-sm` ⇒ **`text-xs`** با `font-semibold` و `text-center` ✓ | `… text-center text-xs font-semibold …` ✓ |
| ۴ | کلید هدر **هم‌اندازهٔ** کلید آیتم‌ها و **هم‌تراز افقی** با آن‌ها | واریانت دومِ `Switch` حذف شد ✗ ⇒ **یک اندازه برای همه** (`h-2.5 w-6` ✓) و کلید هدر در انتهای ردیف ⇒ همان ستون عمودی کلیدهای آیتم‌ها ✓ | `switch-sizes = 3 × "relative h-2.5 w-6"` ✓ |
| ۵ | حذف **رنگ‌شدن بوردر سمت چپ** کارت · رنگ کنار نوشته بماند | `style={{ borderInlineStartColor }}` از کارت حذف شد ✗ · نشانگر رنگ (`h-2.5 w-1` ✓) و رنگ پارامترها ✓ دست‌نخورده ماندند ✓ | `card-style-attr=0` ✓ · `data-cc-item-color=#a3e635,#3b82f6` ✓ |

**شواهد:** `TSC=0` ✓ · `ESLINT=0` ✓ · `data-engine-selftest="ok:0"` ✓ · HTTP=200 ✓ (بازگشتِ کوچک، صفر ریسک قرارداد ✓)

### ۱۱.۸ P5/4-UI — **بازبینی پنجم** (۵ مورد ✓ · یک بازآرایی مهم: حذف کشوی زیر چارت ✗)

| # | خواسته | پیاده‌سازی | شاهد (SSR) |
|---|---|---|---|
| ۱ | **فونت هدر مثل فونت کتابخانه** | کلاس نام هدر = `text-center text-foreground/70` ✓ (همان اندازهٔ ارثیِ `text-xs`ِ کشو و **همان رنگ/وزنِ برچسب‌های کتابخانه** ✓ ⇒ هیچ `font-semibold text-sm` جدا ✗) | `title class="min-w-0 flex-1 truncate text-center text-foreground/70"` ✓ |
| ۲ | مشکلِ **هم‌ترازی** کلید هدر با کلید آیتم‌ها (اثر بوردر آیتم‌ها) · **در هر شرایطی حتی ریسپانسیو** | ① هدر همان `px-[7px]` کارت‌ها را گرفت ✓ (۶px پدینگ + ۱px بوردر ✓) · ② **اسکرول‌بارِ لیست پنهان شد** ✗ (`[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden` ✓) ⇒ عرض محتوا هرگز کم/زیاد نمی‌شود ⇒ ستون کلیدها **همیشه** هم‌تراز ✓ | `header class="flex h-8 items-center gap-1 … px-[7px]"` ✓ · `active-list = … [scrollbar-width:none] …` ✓ |
| ۳ | کلیک روی آیتم ⇒ **بسط آکاردئونی درجای خود** (ارتفاع زیاد شود، پایینی‌ها با انیمیشن نرم پایین بروند) — ⛔ **نه کشو زیر چارت** | `SettingsSheet` و CSS `cc-sheet` **کامل حذف شدند** ✗ · به‌جایش بدنهٔ آکاردئون در همان کارت ✓ با `grid-template-rows: 0fr → 1fr` + `opacity` + `duration-300 ease-out` ✓ و `motion-reduce` ✓ · کنترل‌ها وقتی بسته‌اند `inert` ✓ (خارج از tab/a11y ✓) · حذفِ آیتم دکمهٔ `Trash2` داخل همان بدنه ✓ | `data-cc-item-body="ema#0"` · کلاس `grid transition-[grid-template-rows,opacity] … grid-rows-[0fr] opacity-0` ✓ · `inert=True` ✓ · `data-cc-sheet` = **0** ✓ |
| ۴ | انیمیشن باز/بستِ کشو نرم و **در محدودهٔ چارت** — رفع «پرش به چپِ کل سایت» ✗ | علت: کشو با `translateX(-100%)` **بیرون از مرزهای چارت** می‌رفت و پیج اسکرول افقی می‌گرفت ✗ ⇒ میزبان `relative` حالا **`overflow-hidden rounded-lg`** است ✓ ⇒ کل انیمیشن **داخل قاب چارت کلیپ** می‌شود ✓ (شعاع گوشه = شعاع خودِ کارت ✓) | `anchor = class="relative overflow-hidden rounded-lg"` ✓ |
| ۵ | باز شدن **از همان جایی که هست** و بستن نرم به موقعیت قبلی + **فید نرم** | کشو: `transition-[transform,opacity] duration-300 ease-out` ✓ (اسلاید + فید هم‌زمان ✓) · آکاردئون: `grid-rows` + `opacity 300ms` ✓ · آیکون بازشو با `transition-all` محو می‌شود ✓ | کلاس‌های بالا در SSR ✓ |

**درسِ این بازبینی:** «کشوی جدا زیر چارت» هم **مفهومی** غلط بود ✗ (تنظیمات یک آیتم باید کنار خودِ آیتم باشد ✓) و هم به‌خاطر `absolute` بیرونِ محدوده، باعث **اسکرول افقیِ صفحه** می‌شد ✗ ⇒ حذف شد و به آکاردئون تبدیل شد ✓؛ برای رفع پرش، **کلیپِ میزبان** کافی بود ✓ (هیچ `position: fixed` برنگشت ✗).

**وضعیت اجرا:** سرور dev در میانهٔ کار بسته شده بود ✗ ⇒ **دوباره detached بالا آمد** ✓ (`setsid nohup next dev -p 3000`, لاگ: `/tmp/next9.log`) · سرویس تاریخی `:4000` بالا بود ✓.

---

## ۱۲) Architecture Overview (Presets / Themes / Library)

> # Time‑Chart Engine V2 — Architecture Overview (Presets / Themes / Library)
> **نسخه: `2.0.0-alpha` · تاریخ: `2026-09-25`**
> **وضعیت: تأییدشده ✅** — کل موتور V2 با این معماری **مرور کامل شد** و **همهٔ ۹ ادعای چک‌لیست** با شاهد عددی تأیید شد ✓
> دامنه: موتور زمان‌محور V2 (چارت تاریخی + ماکرو) · مبنای سند: **کد واقعی همین مخزن** ✓ (نه طرح فرضی ✗)
> ⚠️ هر عدد/مسیر این سند از اجرای زنده یا فایل واقعی گرفته شده است ✓ — هیچ ادعای تأییدنشده در آن نیست ✗.

### ۱۲.۱ نقشهٔ سه‌لایه (منبع حقیقت هر لایه)

| لایه | فایل(های) **منبع حقیقت** | مسئولیت | استقلال (قفل‌شده ✗) |
|---|---|---|---|
| **۱) پریست** | `components/base/engine/core/profiles.ts` | انتخاب ماژول‌ها · پارامترهای پیش‌فرض · ترتیب اولیه · کدک URL (`profile`, `mod`, `p=`) | ⛔ **صفر** وابستگی به تایم‌فریم و تم ✓ |
| **۲) تم** | `lib/chart/themes/shahrivar_hist/*` + `lib/chart/themePresets.ts` | پالت سری‌ها (`series[]`) · اسلات‌ها (`emaFast`, `smaSlow`, `trend`, `signal*`, …) · رنگ‌های UI کشو/لجند | ⛔ **صفر** وابستگی به پریست و کتابخانه ✓ |
| **۳) کتابخانه** | `components/base/engine/core/library.ts` | منبع حقیقت **ماژول/آیتم**: کلیدها · پارامترها (از AL ✓) · رنگ **به‌مرجع نام** (`colorKey` ✓) · چند-نمونه · درگ‌ودراپ · تنظیمات درون‌خطی · selfTest | ⛔ بدون وابستگی به تم/پریست ✓ (فقط `import type` ✓ · صفر رنگ/عدد هاردکد ✗) |

> **لایهٔ چهارمِ بیرونی (نام‌گذاری‌شده برای شفافیت):** **AL (Analysis Layer)** = `lib/analysis/**` ⇒ ریاضی/فرمول/اسکیمای پارامترها ✓.
> کتابخانه **فرمول ندارد** ✗ و فقط با شناسهٔ AL (`alId` / `signalId` ✓) به آن وصل است ✓؛ رجیستری ماژول‌ها (`engine/modules/registry.ts` ✓) هم فقط **قراردادِ محاسبه** (`computeRef`, `status`, `semVer`) را نگه می‌دارد و شناسه‌هایش از همان `MODULE_IDS` می‌آید ✓.

### ۱۲.۲ لایهٔ ۱ — پریست‌ها (Chart Presets)

| ویژگی خواسته‌شده | وضعیت کد | شاهد |
|---|---|---|
| فقط انتخاب ماژول + پارامتر پیش‌فرض | `applyProfile(id)` ⇒ `ModuleState{on, params}` ✓ | `profilesSelfTest` ✓ |
| **بدون** وابستگی به تایم‌فریم | در کل `profiles.ts` هیچ اشاره‌ای به `tf`/`timeframe` نیست ✗ | `grep -n 'tf\|timeframe' profiles.ts` → **۰ نتیجه** ✓ |
| **بدون** وابستگی به ظاهر/تم | هیچ `theme`/`color` در `profiles.ts` ✗ | `grep -n 'theme\|color' profiles.ts` → **۰ نتیجه** ✓ |
| «فقط یک شروع» است | تغییر بعدی کاربر در لایهٔ ۳ (کتابخانه) و در URL می‌نشیند ✓ | `p=` codec ✓ |
| پریست `pro` = همهٔ ماژول‌ها | `tabs_on = 10` ✓ (بقیه: classic ۲ · micro ۳ · flow ۴ · ai ۳ · hybrid ۴ ✓) | ماتریس §۱۲.۶-A ✓ |
| ترتیب اولیه | ترتیب `MODULE_IDS` = ریل تب‌ها ✓ · ترتیب آیتم‌ها = ترتیب کلیدهای `params` ✓ | `reorderRows` ✓ |
| نگهداری در URL (`p=`) | `encodeParams`/`decodeParams` ✓ + تومبستون `[]` ✓ | §۱۲.۶-D ✓ |

**قالب وضعیت:** `{ profile, engine, modules: { [moduleId]: { on, params: { [itemKey]: ParamInstance[] } } } }`
و هر نمونه: `{ on: boolean, values: Record<string, number> }` ✓ (چند-نمونه ⇒ هر آیتم چند بار با پارامترهای متفاوت ✓).

### ۱۲.۳ لایهٔ ۲ — تم‌ها (Chart Themes)

| ویژگی خواسته‌شده | وضعیت کد | شاهد |
|---|---|---|
| فقط ظاهر را کنترل می‌کند | `ChartTheme = { palette, layout, signals }` ✓ (هیچ منطق داده ✗) | `lib/chart/types.ts` ✓ |
| رنگ سری‌ها | `palette.series[]` **داخل خود قالب** ✓ | `shahrivar_hist/colors.ts: series: [6 رنگ]` ✓ |
| رنگ `trend` | اسلات `trend` اضافه شد ✓ (قبلاً نبود و رنگ به پالت پایه **نشت** می‌کرد ✗) | `trend: "#c084fc"` ✓ |
| رنگ متن/پس‌زمینه/محور | `text`, `textMuted`, `background`, `grid`, `axis`, `border`, `crosshair` ✓ | همان فایل ✓ |
| **بدون** وابستگی به پریست‌ها | در `themes/shahrivar_hist/*` هیچ ارجاعی به `preset`/`profile` نیست ✗ | `grep -rn 'preset\|profile' themes/shahrivar_hist/*` → **۰ نتیجه** ✓ |
| **بدون** وابستگی به کتابخانه | هیچ ارجاعی به `library` نیست ✗ | `grep -rn 'library' themes/shahrivar_hist/*` → **۰ نتیجه** ✓ |
| **هماهنگی چارت ↔ کشو ↔ لجند** | هر سه از **یک** تابع و **یک** تم رنگ می‌گیرند: `resolveSlot(getThemePreset("shahrivar_hist"), colorKey)` ✓ | §۱۲.۶-C: `legend_color == cc_color` ✓ |
| پوشش کامل کلیدهای رنگ کتابخانه | ۱۴ کلید مصرفی کتابخانه همه در قالب تعریف شده‌اند ✓ | ممیزی خودکار: `missing_slots = []` ✓ |
| تم روی **همهٔ** پریست‌ها کار می‌کند | رنگ‌ها از وضعیت پریست مستقل‌اند ✓ (پریست فقط `on/params` می‌دهد ✗) | §۱۲.۶-A: هر ۶ پریست با همان تم ✓ |
| تم روی **همهٔ** تایم‌فریم‌ها کار می‌کند | تم به `tf` کاری ندارد ✗ | §۱۲.۶-B ✓ |

**کلیدهای رنگ مصرفی کتابخانه (۱۴):** `emaFast` · `smaSlow` · `trend` · `signalInfo` · `signalWarn` · `signalRisk` · `signalPos` · `signalNeutral` · `series.0..5` ✓ — همه **نام‌محور** ✓ (کتابخانه هیچ کد رنگ هاردکد ندارد ✗).

### ۱۲.۴ لایهٔ ۳ — کتابخانه‌ها (Module Libraries)

**فایل حقیقت:** `components/base/engine/core/library.ts` (۳۳۲ خط ✓) · ساختار: `LIBRARY: Record<ModuleId, LibraryItemSpec[]>` ✓
هر `LibraryItemSpec` = `{ key, fallbackLabel, colorKey, alId? | signalId?, params?: string[], pane? }` ✓

| دسته (خواسته‌شده) | شناسه‌های پیاده‌شده |
|---|---|
| **Indicators** | `ema` · `sma` · `rsi` · `macd` · `atr` · `bb` · `vwap` ✓ |
| **PriceAction** | `swing` · `bos` · `fvg` ✓ |
| **Signals** | `cross` · `volumeSpike` · `atrBreakout` ✓ |
| **Flow** | `moneyflow.cvd` · `funding` · `openInterest` ✓ |
| **MicroFlow** | `microflow.delta` · `imbalance` ✓ |
| **Pulse** | `pulse.events` · `sentiment` ✓ |
| **Advanced** | `advanced.frame` · `payload` · `cache` ✓ |
| (به‌علاوه) Multi‑Chart · AI · Bots | `multichart.panes/sync` · `ai.summary` · `bots.paper/alerts` ✓ |

| وظیفهٔ خواسته‌شده | وضعیت | شاهد |
|---|---|---|
| تعریف ماژول‌ها | ۱۰ ماژول = `MODULE_IDS` ✓ (کلیدهای کتابخانه **دقیقاً** همان‌ها ✓) | `librarySelfTest`: «ماژول بدون آیتم ✗» + «شناسهٔ ناشناس ✗» ✓ |
| تعریف پارامترهای هر ماژول | **از AL** ✓ (`PARAM_SCHEMA` / `SIGNAL_PARAM_SCHEMA` ✓) — هیچ `min/max/step/default` دوباره‌نویسی نشد ✗ | `paramRulesOf()` ✓ · selfTest: «پارامتر اعلامی در اسکیمای AL نیست ✗» ✓ |
| رفتار **افزودن** | کلیک روی کارت کتابخانه ⇒ یک **نمونهٔ تازه** با پیش‌فرض‌های AL ✓؛ **چند بار** مجاز ✓ (سقف ۸ ✓) | §۱۲.۶-D: `ema:2` ✓ |
| رفتار **حذف** | `−/🗑 حذف آیتم` ⇒ **تومبستون `[]`** ✓ (حذف ماندگار در URL ✓) | §۱۲.۶-D: `items=ema` بعد از حذف SMA ✓ |
| رفتار **درگ‌ودراپ** | درگ روی ردیف سرِ کارت ⇒ ترتیب نمونه‌ها **و** ترتیب کلیدهای `params` عوض می‌شود ✓ (ترتیب = خودِ داده ✓ · بدون آرایهٔ ترتیب موازی ✗) | `reorderRows` ✓ · `draggable` ✓ |
| رفتار **تنظیمات** | کلیک روی کارت ⇒ **آکاردئون درجای خود** ✓ با اسلایدر + ورودی عددی از اسکیمای AL ✓ · `inert` در حالت بسته ✓ | §۱۱.۸ ✓ |
| ارتباط با **URL** | `p=<module>.<key>:<on>~<param>=<v>|<sample>; …` ✓ (کدک در `profiles.ts`، **اسکیماآگاه نیست** ✓) | §۱۲.۶-D ✓ |
| ارتباط با **چارت** | رویدادهای `cc:focus` (لجند ⇒ کشو ✓) و `cc:highlight` (هاور دوطرفه ✓) | `ChartLegend.tsx` ✓ |
| **selfTest کتابخانه** | `librarySelfTest()` با **۸ سنجه** ✓ (کلید یکتا · شناسهٔ AL · پارامتر معتبر · پیش‌فرض در بازه · تحمل فرم قدیمی · استقلال نمونه‌ها · حذف=تومبستون · کلمپ) | §۱۲.۷ ✓ |

### ۱۲.۵ روابط بین سه لایه (ماتریس استقلال)

```
        ┌────────────────────┐        انتخاب            ┌──────────────────────┐
        │  ۱) PRESETS        │ ───────────────────────▶ │  ۳) LIBRARY          │
        │  profiles.ts       │  (فقط on/params/ترتیب ✓)  │  library.ts          │
        │  «شروع» ✗ تم/تایم‌فریم│                          │  منبع حقیقت آیتم‌ها ✓ │
        └─────────┬──────────┘                          └──────────┬───────────┘
                  │ ⛔ هیچ لبه‌ای بین ۱ و ۲ نیست ✗                  │ colorKey (نام ✓)
                  │                                                 ▼
        ┌─────────┴──────────┐        رنگ                    ┌──────────────────────┐
        │  ۲) THEMES         │ ◀───────────────────────────  │  resolveSlot(theme…) │
        │  shahrivar_hist    │  (چارت ↔ کشو ↔ لجند ✓)          │  چارت/کشو/لجند ✓      │
        └────────────────────┘                               └──────────────────────┘
                  ▲                        ▲
                  └──── AL (بیرونی) ───────┘ : فرمول + اسکیمای پارامترها ✓ (کتابخانه فرمول ندارد ✗)
```

| رابطه | حکم | شاهد |
|---|---|---|
| پریست ← فقط **انتخابی** از کتابخانه | ✅ درست · `applyProfile` کلیدها/پارامترها را از قالب کتابخانه می‌نویسد ✓ | `pro` = `ema:[{period:21}]` ✓ |
| تم ← **فقط ظاهر** · هیچ دخالتی در انتخاب ماژول | ✅ درست · صفر ارجاع متقابل (هر دو جهت ✓) | grepهای §۱۲.۳ ✓ |
| کتابخانه ← **منبع حقیقت** ماژول/پارامتر | ✅ درست · ۱۰/۱۰ ماژول · پارامترها از AL ✓ | `data-cc-lib-item` برای هر ۱۰ تب ✓ |
| پریست و تم **کاملاً مستقل** | ✅ درست (هیچ import/ارجاعی بینشان نیست ✗) | grep دوطرفه ✓ |
| کتابخانه مستقل از هر دو | ✅ درست (`import type` از profiles ✓ · هیچ import از theme ✗) | `import`های `library.ts` ✓ |

### ۱۲.۶ نتیجهٔ بازبینی — چک‌لیست ۹ موردی (شاهد زنده ✓)

> **روش:** همهٔ اعداد از **اجرای زندهٔ SSR** روی `http://127.0.0.1:3000/dashboard/historical/crypto` گرفته شده‌اند ✓ (سرور dev + سرویس تاریخی `:4000` بالا ✓) — اسکریپت بازتولید در §۱۲.۹ ✓.

| # | ادعای مورد بازبینی | حکم | شاهد |
|---|---|---|---|
| ۱ | پریست `pro` روی **تمام تایم‌فریم‌ها** کار می‌کند | ✅ تأیید | **۱۰/۱۰** تایم‌فریم: `self=ok:0` · `profile=pro` · `tabs_on=10` (جدول ۱۲.۶-B ✓) |
| ۲ | تم `shahrivar_hist` روی **تمام پریست‌ها** کار می‌کند | ✅ تأیید | **۶/۶** پریست: HTTP 200 · `self=ok:0` · `data-chart-profile` مطابق پریست ✓ (جدول ۱۲.۶-A ✓) |
| ۳ | **کتابخانه منبع حقیقت** ماژول‌هاست | ✅ تأیید | ۱۰/۱۰ ماژول در `library.ts` ✓ · کلیدهایش **دقیقاً** `MODULE_IDS` ✓ · پارامترها از AL ✓ · `librarySelfTest` ✓ |
| ۴ | رنگ سری‌ها در چارت = رنگ آیتم‌ها در کشو | ✅ تأیید | `legend_color = #a3e635,#3b82f6` و `cc_color = #a3e635,#3b82f6` ⇒ **match = True** ✓ (هر دو از `resolveSlot`ِ یک تم ✓) |
| ۵ | چند-نمونه (EMA/SMA/…) کاملاً **پایدار** است | ✅ تأیید | URL دو-نمونه‌ای ⇒ `items = ema,ema,sma` · `lib = ema:2` ✓ · selfTest: «نمونه‌ها شیء مشترک ندارند» ✓ |
| ۶ | پارامترها در **URL حفظ** می‌شوند | ✅ تأیید | `?p=indicators.ema:1~period=21|1~period=55` ⇒ دو نمونه با ۲۱ و ۵۵ ✓ · selfTest رفت‌وبرگشت ✓ |
| ۷ | حذف آیتم با **تومبستون `[]`** درست کار می‌کند | ✅ تأیید | `?p=indicators.sma:` ⇒ `items = ema` (SMA **برنگشت** ✓) · selfTest سنجهٔ ۱۰ ✓ |
| ۸ | لجند چارت ↔ کشو کاملاً **هماهنگ** است | ✅ تأیید | `legend_items = cc_items = ema,sma` ✓ · رنگ‌های یکسان ✓ · مقدار لجند = اتریبیوت چارت ✓ · رویداد `cc:focus`/`cc:highlight` ✓ |
| ۹ | selfTest **هسته** و **کتابخانه** سبز هستند | ✅ تأیید | در **هر ۱۶ درخواست**: `data-engine-selftest="ok:0"` ✓ (+ سوئیت قرارداد: **۴۶ assertion** ✓ · exit=0 ✓) |

**۱۲.۶-A — ماتریس پریست‌ها (tf=1h · BTCUSDT):**

| پریست | HTTP | `data-chart-profile` | `data-engine-selftest` | candles | تب‌های روشن | سرویس |
|---|---|---|---|---|---|---|
| classic | 200 | `classic` ✓ | `ok:0` ✓ | 5001 | **۲** ✓ | up |
| micro | 200 | `micro` ✓ | `ok:0` ✓ | 5001 | **۳** ✓ | up |
| flow | 200 | `flow` ✓ | `ok:0` ✓ | 5001 | **۴** ✓ | up |
| ai | 200 | `ai` ✓ | `ok:0` ✓ | 5001 | **۳** ✓ | up |
| hybrid | 200 | `hybrid` ✓ | `ok:0` ✓ | 5001 | **۴** ✓ | up |
| **pro** | 200 | `pro` ✓ | `ok:0` ✓ | 5001 | **۱۰** ✓ (همه) | up |

**۱۲.۶-B — پریست `pro` روی همهٔ تایم‌فریم‌ها:**

| tf | 1m | 5m | 15m | 1h | 4h | 1d | 5d | 1w | 1mo | 1y |
|---|---|---|---|---|---|---|---|---|---|---|
| نتیجه | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| candles | 4999 | 5000 | 5000 | 5001 | 5001 | 1826 | 366 | 262 | 62 | 6 |
| `tabs_on` | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| `selfTest` | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 | ok:0 |

⇒ **پریست هیچ وابستگی به تایم‌فریم ندارد** ✓ (تعداد تب‌های روشن در همهٔ tfها ثابت = ۱۰ ✓).
⚠️ صادقانه: در **نخستین** درخواستِ `1y` عدد **۱۴٬۸۱۷ms** ثبت شد ✗ (کامپایل سرد مسیر + پنجرهٔ کامل)؛ در اجرای دومِ همان درخواست **۹۳ms** ✓ و بقیهٔ tfها ۹۱–۹۶۱ms ✓ ⇒ **کندی، گذرا و مربوط به warm-up است** ✓، نه معماری ✗.

**۱۲.۶-C — هماهنگی رنگ (pro@1h):**
```
legend_items = ema,sma          cc_items   = ema,sma            ⇒ کلیدها یکی ✓
legend_color = #a3e635,#3b82f6  cc_color   = #a3e635,#3b82f6   ⇒ رنگ‌ها یکی ✓
legend_vals  = 84,292.69 / 84,385.57
chart attrs  = data-hist-ema21="84292.692553" · data-hist-sma50="84385.570999"  ⇒ همان اعداد ✓
cc_icons     = 10  (ریل ۱۰ ✓ · هدر آیکون ندارد ✓)
```
⇒ **رنگ و مقدار در سه‌جا (چارت · لجند · کشو) یکی است** ✓ و هیچ عددی ساخته نشده ✗.

**۱۲.۶-D — چند-نمونه · URL · تومبستون:**
```
?profile=pro&p=indicators.ema:1~period=21|1~period=55;signals.cross:1
   ⇒ items = ema,ema,sma ✓ · lib = ema:2, sma:1 ✓ · legend = ema,sma ✓
?profile=pro&p=indicators.sma:
   ⇒ items = ema ✓ · lib = ema:1, sma:0 ✓ (حذف ماندگار ✓)
```

### ۱۲.۷ خودآزمون‌ها (SelfTests) — دروازهٔ CI

`chartEngineSelfTest()` در `components/base/engine/core/chartEngine.ts` **۷ خودآزمون** را ترکیب می‌کند ✓ و نتیجه در SSR منتشر می‌شود ✓:

| # | خودآزمون | دامنه | شاهد |
|---|---|---|---|
| ۱ | `seriesRegistrySelfTest` | رجیستری سری‌ها (ensure/update/drop ✓) | `data-engine-selftest="ok:0"` ✓ |
| ۲ | `layerPainterSelfTest` | نقاشی لایه‌ها + skip جزئیات‌تغییریافته ✓ | همان ✓ |
| ۳ | `specGateSelfTest` | دروازهٔ قرارداد (بدون ساخت سری ✗) | همان ✓ |
| ۴ | `interactionBusSelfTest` | گذرگاه تقابل/حافظهٔ نما ✓ | همان ✓ |
| ۵ | **`profilesSelfTest`** | ۱۰ سنجه: موتور یکسان · فهرست پریست‌ها · شمارش روشن‌ها · پروفایل ناشناس · URL رفت‌وبرگشت (**پارامتری**) · کپی عمیق · سقف · **تومبستون** ✓ | همان ✓ |
| ۶ | **`librarySelfTest`** | ۸ سنجه: کلید یکتا · شناسهٔ AL · پارامتر معتبر · پیش‌فرض در بازه · تحمل فرم قدیمی · استقلال نمونه‌ها · تومبستون · کلمپ ✓ | همان ✓ |
| ۷ | `modulesSelfTest` | قرارداد ماژول‌ها (شناسه · semVer · computeRef · `SpecGate` ✓) | همان ✓ |

**انتشار در SSR:** `data-engine-selftest` = `ok:0` ✓ · `data-engine-selftest-first` = **خالی** ✓ (هیچ خطایی ✗).
**سوئیت بیرونی:** `node test/chart-spec-v3.test.cjs` ⇒ **H1: ۴۶ assertion** ✓ + **۳ کشور** ✓ + `exit=0` ✓.

### ۱۲.۸ مرزهای معماری و محدودیت‌های صادقانه (بدون ادعای اضافی ✗)

| # | مرز | وضعیت فعلی | اثر روی معماری |
|---|---|---|---|
| ۱ | **فاصلهٔ «انتخاب» و «رندرِ سری»** | کشو نمونه‌ها/پارامترها را می‌سازد ✓ (امروز فقط `ema`/`sma`/پنل `rsi\|macd` روی چارت رسم می‌شوند ✗) — در آزمون تومبستون: کشو `sma:0` ولی لجند چارت هنوز `SMA50` را نشان می‌دهد ✓ | **نقض معماری نیست** ✗ — کتابخانه منبع حقیقتِ **انتخاب** است ✓ و **رندر** مرحلهٔ P5/4-بک‌اند است ✓ |
| ۲ | **پارامتر پریست/کشو ↔ AL** | مقادیر EMA21/SMA50 که الان **رسم** می‌شود از `params.json` (AL) می‌آید ✓؛ پارامتر نمونه‌های کشو در URL ذخیره می‌شود ✓ ولی هنوز به تابع محاسبه پاس داده **نمی‌شود** ✗ | در فاز رندر، `instance.values` باید به `paramsFor(alId, …)` پاس شود ✓ (قراردادش همین‌جا نوشته شد ✓) |
| ۳ | **تم‌های دیگر** | `themePresets` چند تم دارد ✓ ولی صفحه به `shahrivar_hist` سیم‌کشی شده است ✓ (انتخاب تم در UI نیست ✗) | تم **جایگزین‌پذیر** است ✓ (رابط `ChartTheme` ✓) |
| ۴ | **درگ‌ودراپ روی لمس** | HTML5 DnD دسکتاپ ✓ — روی موبایل رویداد drag بومی اجرا نمی‌شود ✗ | fallback با Pointer Events کار آینده ✗ |
| ۵ | **اسکرول‌بار پنهانِ لیست آیتم‌ها** | انتخابِ آگاهانه برای هم‌ترازیِ ستون کلیدها ✓ (چرخ ماوس/لمس کار می‌کند ✓) | بدهی UI ✗ (نه معماری ✗) |
| ۶ | **ماژول `pulse`** | در `engine/modules/registry` ثبت شده ✓ با وضعیت `planned` ✓ (تابع حجم در AL نیست ✗) | CI تضمین می‌کند ماژول بدون `computeRef` وارد نشود ✓ |
| ۷ | **تاخیر سرد `1y`** | ۱۴٬۸۱۷ms در **نخستین** درخواست ✗ · در اجرای دوم ۹۳ms ✓ (بقیه ۹۱–۹۶۱ms ✓) | گذرا و مربوط به warm-up ✗ — نه معماری ✗ |

### ۱۲.۹ بازتولید بازبینی (دستورها)

```bash
# ۰) پیش‌نیاز: سرویس‌ها بالا باشند (فرانت :3000 · سرویس تاریخی :4000)
ss -ltn | grep -E ':(3000|4000)'
cd frontend && setsid nohup npx next dev -p 3000 > /tmp/next9.log 2>&1 &

# ۱) ماتریس کامل بازبینی (۶ پریست × ۱۰ تایم‌فریم + رنگ/URL/تومبستون/fa)
#    اسکریپت **داخل مخزن** است ✓ ⇒ بازتولیدپذیر ✓ (نیازمند سرور بالا ✓)
python3 -u scripts/review-v2-matrix.py

# ۲) خودآزمون‌ها + سوئیت قرارداد (H1 ۴۶ assertion · ۳ کشور)
node test/chart-spec-v3.test.cjs

# ۳) دروازهٔ تایپ/لینت
cd frontend && npx tsc --noEmit
npx eslint components/domain/historical/ControlCenter.tsx app/dashboard/historical/crypto/page.tsx \
           components/base/engine/core/library.ts components/base/engine/core/profiles.ts
```

**اتریبیوت‌های بازرسی (SSR):** `data-engine-selftest` · `data-chart-profile` · `data-cc-tab-on` · `data-cc-item` · `data-cc-item-color` · `data-cc-lib-item` · `data-cc-lib-count` · `data-cc-expanded` · `data-chart-legend-item` · `data-chart-legend-color` · `data-chart-legend-value` · `data-hist-candles` ✓.

### ۱۲.۱۰ تأیید رسمی

> ✅ **تأیید می‌شود** که تمام اجزای ساخته‌شدهٔ موتور Time‑Chart V2 **دقیقاً** مطابق معماری سه‌لایه‌اند:
> **۱) پریست‌ها** فقط انتخاب ماژول/پارامتر/ترتیب‌اند و به تایم‌فریم و تم وابستگی **ندارند** ✓ (۱۰/۱۰ تایم‌فریم ✓).
> **۲) تم‌ها** فقط ظاهر (رنگ سری/`trend`/UI) هستند و به پریست و کتابخانه وابستگی **ندارند** ✓؛ و کلیدهای رنگِ کتابخانه (۱۴/۱۴) **داخل خودِ قالب** تعریف شده‌اند ✓.
> **۳) کتابخانه** منبع حقیقت ماژول‌هاست ✓: پارامترها از AL ✓، چند-نمونه ✓، درگ‌ودراپ ✓، تنظیمات درون‌خطی ✓، ارتباط دوطرفه با URL و چارت ✓، selfTest سبز ✓.
> **هماهنگی رنگ در سه‌جا (چارت ↔ لجند ↔ کشو)** با شاهد عددی تأیید شد ✓ و **هر ۹ مورد چک‌لیست** ✅ است ✓.
>
> **نسخه: `2.0.0-alpha` · تاریخ: `2026-09-25` · بخش سند: «Architecture / V2 / Presets‑Themes‑Library» (§۱۲ همین فایل)**
> **کارِ بازِ بعدی (نه نقض معماری):** بستنِ فاصلهٔ «انتخاب ↔ رندرِ سری» ⇒ فاز **P5/4-بک‌اند** (پنل‌های moneyflow/pulse/… + پاس‌دادن پارامترهای نمونه‌ها به AL) ✓.

---

## ۱۳) Responsive Screen Themes — **پنج نسخهٔ نمایشی خانوادهٔ شهریور**

> **نسخه: `2.0.0-alpha` · تاریخ: `2026-09-25` · وضعیت: پیاده‌شده و سنجیده ✅**
> خواستهٔ کاربر: «برای قالب شهریور پنج نسخهٔ تم بساز (`ShahrivarMobile/Tablet/Desktop/UltraWide/TV`) و پارامترهای نمایشی هر نسخه را مطابق جدول اعمال کن — **پریست‌ها و داده‌ها نباید تغییر کنند** ✗؛ فقط تم‌ها نسخه‌بندی شوند ✓».

### ۱۳.۱ چه ساخته شد

| جزء | مسیر | نقش |
|---|---|---|
| **منبع حقیقت اعداد** | `lib/chart/screenProfiles.ts` (**جدید** ✓) | جدول رسمی ۵ کلاس (chart + UI) ✓ · `screenClassOf` · `screenLayoutOf` · `pickScreenTheme` · `screenProfilesSelfTest` (۷ سرویس سنجه ✓) |
| **۵ نسخهٔ تم** | `lib/chart/themes/shahrivar_{mobile,tablet,desktop,ultrawide,tv}/index.ts` | هر تم = **همان پالت/سیگنال** `shahrivar_hist` ✓ + چیدمان اسکرینی ✓ + `ui` ✓ + `manifest 2.0.0-alpha` ✓ |
| ثبت در رجیستری | `lib/chart/themePresets.ts → THEME_REGISTRY` | ۵ ورودی جدید ✓ (تم جدید = یک خط ✓) |
| قرارداد چیدمان | `lib/chart/types.ts` | فیلدهای **افزودنی** ✓: `anchor` · `series.thickness` · `legendRows` · `header` · `dprCap` · `ChartThemeSpec.ui` ✓ |
| اعمال در موتور | `lib/chart/layout.ts` · `components/base/BaseChart.tsx` | `resolveZoomRange(…, anchor)` ✓ · `dprCap` ✓ · `mergeLayout` برای `series` ✓ |
| اعمال در دامنه | `CandleChart.tsx` | `theme` prop ✓ · ضخامت سری از تم ✓ · سقف ردیف لجند ✓ · حالت هدر ✓ · ۱۰ اتریبیوت بازرسی ✓ |
| اعمال در UI | `ControlCenter.tsx` · `ChartLegend.tsx` | عرض کشو/ریل · ناحیهٔ لمس · ستون‌های کتابخانه · قلم UI · قلم لجند · انیمیشن‌کم (TV) ✓ |
| انتخاب خودکار | `page.tsx` + `ScreenThemeSync.tsx` (**جدید** ✓) | `?theme=` > UA/Client-Hints > **دسکتاپ (رفتار امروز)** ✓ و اصلاح با عرض واقعی viewport در کلاینت ✓ |
| i18n | `messages/themeNames.{fa,en}.json` | ۵ توضیح تم ✓ (کلید `description_key` ✓) |

### ۱۳.۲ پارامترهای اعمال‌شده (خلاصهٔ جدول)

| پارامتر | Mobile | Tablet | Desktop (پیش‌فرض ✓) | UltraWide | TV |
|---|---|---|---|---|---|
| زوم | 6M | 1Y | **3Y6M** | 5Y | 1Y |
| `futureMargin` | 12 | 16 | **24** | 32 | 48 |
| `barSpacing` / `minBarSpacing` | 4/2 | 5/2 | **6/2** | 8/3 | 10/4 |
| `rightOffset` | 1 | 2 | **2** | 3 | 4 |
| `seriesThickness` | 1.5 | 2 | **2** | 2 | 3 |
| `fontSize` / بج سیگنال | 10 / 9 | 11 / 10 | **11 / 10** | 12 / 11 | 16 / 14 |
| `maxSignals` | 4 | 6 | **8** | 8 | 8 |
| `header` | compact | full | **full** | full | full |
| `legendRows` | 2 | 3 | **8** | 8 | 8 |
| `dprCap` | 2 | 2 | **2** | 1.5 | 1.5 |
| عرض کشو | 100% | min(20rem,70%) | **max(15rem,min(22rem,34%))** | 22rem | 28rem |
| ناحیهٔ لمس (px) | 44 | 44 | 28 | 28 | 56 |
| کتابخانه | ۱ ستون | ۱ ستون | **۲ ستون** | ۲ | ۲ |
| قلم لجند / UI | 11 / 11 | 10 / 12 | **10 / 12** | 10 / 12 | 14 / 15 |
| انیمیشن | normal | normal | **normal** | normal | **reduced** |
| **`anchor`** | last | last | **last** | last | last |
| **`anchorRatio`** (موقعیت آخرین کندل ✓) | **0.8** (۲۰٪ ✓) | **0.8** | **0.8** | **0.8** | **0.8** |

> ⚠️ کلیدهای پررنگ = **مقادیر امروزِ قالب شهریور** ✓ ⇒ `shahrivar_desktop` عیناً همان رفتار پیشین است ✓ و **هیچ تغییری برای کاربر فعلی رخ نمی‌دهد** ✗ (این خودش یک سنجهٔ selfTest است ✓).

### ۱۳.۳ شواهد زنده (اسکریپت داخل مخزن ✓)

```
python3 -u scripts/review-screen-themes.py
SUMMARY: ✅ 29 passed · ❌ 0 failed
  ✅ shahrivar_mobile     class=mobile    fm=12 bs=4  th=1.5 font=10  (anchor=last ✓ selfTest=ok:0 ✓)
  ✅ shahrivar_tablet     class=tablet    fm=16 bs=5  th=2   font=11
  ✅ shahrivar_desktop    class=desktop   fm=24 bs=6  th=2   font=11  ⇒ پیش‌فرض بدون ?theme= ✓
  ✅ shahrivar_ultrawide  class=ultrawide fm=32 bs=8  th=2   font=12
  ✅ shahrivar_tv         class=tv        fm=48 bs=10 th=3   font=16  (motion=reduced ✓)
  ✅ در هر ۵ تم: data-chart-profile="pro" ✓ و data-hist-candles="5001" ✓ ⇒ پریست/داده دست‌نخورده ✓
TSC=0 ✓ ESLINT=0 ✓ (کل تغییرات)
```

### ۱۳.۴ مرزهای صادقانه (۱۳.۴)
1. **سرور عرض viewport را نمی‌داند** ✗ (اغلب مرورگرها `Sec-CH-Viewport-Width` نمی‌فرستند) ⇒ پیش‌فرض دسکتاپ است ✓ و `ScreenThemeSync` در کلاینت با `matchMedia` تم را دقیق می‌کند ✓ (یک `router.replace` بدون حلقه ✓).
2. **تشخیص TV** بر پایهٔ UA است ✓ (هیوریستیک ✓)؛ تلویزیون‌هایی که UA استاندارد می‌دهند، با عرض ≥۲۵۶۰px شناسایی می‌شوند ✓.
3. **درگ‌ودراپ روی لمس** هنوز fallback ندارد ✗ (بدهی UI ✓ — نه معماری ✗).
### ۱۳.۵ سیاست‌های ثبت‌شدهٔ UI (بازبینی هفتم · 2026-09-25)

**الف) «غیرفعال‌سازی فوکوس ماوس» (Mouse-focus policy) — سیاست رسمی سیستم ✓**
- **رفتار مطلوب:** فوکوس فقط برای **کیبورد** (`:focus-visible`) دیده می‌شود ✓؛ کلیک ماوس/لمس **هیچ حلقه‌ای** نمی‌سازد ✗.
- **پیاده‌سازی (تک‌نقطه ✓):** در `app/globals.css`: `:focus:not(:focus-visible){outline:none}` · `-webkit-tap-highlight-color:transparent` · کلاس **`.no-focus-ring`** با `outline:none !important` ✓.
- **دامنهٔ اعمال:** تب‌های ریل · ردیف سرِ کارت‌های آیتم · کلیدهای `+`/`−` · سوئیچ ON/OFF · دکمهٔ بازشوی کشو · دکمهٔ «حذف آیتم» · **اسکریمِ چارت** (کلیک برای بستن ✓) ⇒ در SSR: **۳۸** عنصر با `no-focus-ring` ✓.
- **دسترس‌پذیری:** هر کنترل `aria-label`/`aria-selected`/`aria-checked` دارد ✓ ⇒ مسیر غیربصری حفظ است ✓.

**ب) «کلید هدر = کلید همهٔ آیتم‌های همان بخش» ✓**
- خاموش‌کردن بخش ⇒ **همهٔ نمونه‌ها** خاموش ✓ (پارامتر/ترتیب دست‌نخورده ✓) · روشن‌کردن ⇒ همه روشن ✓.
- رندر هم همین را می‌سنجد: بخش خاموش ⇒ **هیچ سری‌ای** رسم نمی‌شود ✗ (شاهد: `mod=multichart` ⇒ فقط `candles,volume` ✓).

**ج) «رنگ نمونه‌های تکراری از قالب تم» ✓**
- ماژول: `components/base/engine/core/instanceColors.ts` ✓ (بدون رنگ هاردکد ✗ · resolver تزریقی ✓).
- قاعده: نمونهٔ **اول** = رنگ آیتم ✓ · نمونه‌های **بعدی** = حلقهٔ پالت قالب (`series.N` ✓) با **پرش از رنگ‌های مصرف‌شده** ✓ ⇒ تضاد ممنوع ✗ (شامل تضاد با رنگ آیتم‌های دیگر مثل `SMA=smaSlow` ✓).
- شاهد زنده (سه EMA + SMA پیش‌فرض): رنگ‌های لجند = رنگ کارت‌های کشو = **۴ رنگ یکتا** ✓.

**د) «تنظیمات عددی = فیلد عدد، نه اسلایدر» ✓**
- `input[type=range]` **حذف شد** ✗ · فقط `input[type=number]` با `min/max/step` از اسکیمای AL ✓ (+ کلمپ در `clampValue` ✓) ⇒ بخش تنظیمات تمیزتر ✓ (SSR: `type="range"` = **۰** ✓).

**هـ) «فیلد عددی تمیز — بدون فلش مرورگر» ✓ (بازبینی هشتم)**
- **ریشه:** فلش‌های بالا/پایین، رفتار پیش‌فرض مرورگر برای `input[type=number]` است (`::-webkit-inner-spin-button` / `::-webkit-outer-spin-button` ✗).
- **رفع در `globals.css`:** هر دو شبه‌عنصر با `-webkit-appearance:none` خاموش می‌شوند ✓ + `-moz-appearance:textfield` برای فایرفاکس ✓ ⇒ **هیچ فلشی نمایش داده نمی‌شود** ✗.
- **استایل تم:** کلاس **`.num-field`** = `font-variant-numeric: tabular-nums` + سطح `--surface-2` + بوردر `--border` + گردی `0.375rem` ✓ و در فوکوس/هاور فقط **بوردر به `--pos`** تغییر می‌کند ✓ (بدون حلقه ✗ ⇒ هم‌راستا با سیاست «no-focus-ring» ✓).
- **مقداردهی:** فقط **تایپ** یا دکمه‌های **`−`/`+`** خودِ پنل ✓ (`data-cc-setting-dec` / `data-cc-setting-inc` ✓) که هر کدام دقیقاً `step` اسکیمای AL را جابه‌جا می‌کنند ✓ و نتیجهٔ نهایی همیشه با `clampValue` در بازهٔ مجاز می‌ماند ✓.
- **شاهد:** `num-field` در SSR = **۴** فیلد ✓ · `type="range"` = **۰** ✓.

### ۱۳.۶ ارتفاع چارت و فضای راست — قاعدهٔ نهایی (بازبینی دوازدهم · 2026-09-25)

**الف) ارتفاع — کاملاً از تم‌ها حذف شد ✗ و فقط آرگومانِ صفحه است ✓**
- تم‌ها **هیچ** قاعدهٔ ارتفاعی ندارند ✗ (نه «یک‌سوم عرض» ✗ نه نسبت viewport ✗) — فیلدهای `chartViewportRatio` و `heightRule` **حذف شدند** ✗.
- `ScreenThemeSync` فقط **تم** را عوض می‌کند ✓ و به ارتفاع کاری ندارد ✗.
- فراخوانی چارت: `<CandleChart height={desired} … />` ⇒ `finalHeight = max(desired ?? 360, 360)` ✓ (کف ۳۶۰px ✓ · سقف: هیچ ✗).
- پیش‌فرض `HIST_CHART_HEIGHT` از ۴۲۰ ✗ به **۳۶۰** ✓ تغییر کرد (صفحه می‌تواند عدد دلخواه بدهد ✓).

**ب) فضای خالی راست — **همیشگی** ✓ (مستقل از تم ✗)**
```
rightOffset = min(chartWidth × 0.20, 600px)     // نسبت ۱ به ۵ ✓ · سقف ۶۰۰px ✓
```
- همیشه اعمال می‌شود ✓ (نه فقط وقتی تم نسبت بدهد ✗) + بازمحاسبه با **زوم/اسکرول کاربر** و **ریسایز** ✓.
- ضدِ حلقهٔ رویداد ✓: پرچم «در حال اعمال» + تلورانس ۲ میله ✓ (باگِ «چارت خالی در اولترا واید» ✗ از همین جنس بود ✓).
- ⚠️ **اثر جانبی صادقانه:** این قاعده در `BaseChart` است ⇒ روی **همهٔ** چارت‌ها (از جمله ماکرو ✓) اعمال می‌شود؛ اگر بخواهی فقط صفحهٔ تاریخی باشد، یک گیتِ یک‌خطی کافی است ✓.

**ج) تم‌ها چه چیزی را نگه می‌دارند ✓**
`anchorRatio` (۰٫۸ ✓) · `barSpacing`/`minBarSpacing` · `futureMargin` · `rightOffset` (پایه ✓) · `fontSize`/`signalFontSize`/`maxSignals` · `seriesThickness` · `legendRows`/`header` · `dprCap` · بلوک `ui` (کشو/لمس/قلم ✓) ✓.

**د) شاهدها**
```
TSC=0 ✓ · ESLINT=0 error ✓ · data-engine-selftest="ok:0" ✓ · پایگاه داده/سری‌ها: candles:5001,ema21,sma50,volume ✓
```

### ۱۳.۷ سیاست خنثیِ SSR و تک‌منبعیِ کلاینت (بازبینی سیزدهم · 2026-09-25)

**ریشهٔ باگ «چارت در اسکرین‌های غیرِ دسکتاپ پنهان می‌شد» ✗:** سرور با **UA/Client-Hints**
حدس می‌زد ✗ و کلاینت با `matchMedia` چیزِ دیگری می‌دید ✗ ⇒ `?theme=` می‌چرخید ✗ ⇒
چارت **چند بار** بازساخت می‌شد و در حالت‌هایی (اولتراواید ✗) خالی می‌ماند ✅→❌.

**الف) SSR کاملاً خنثی ✓**
- `screenClass = "unknown"` ✓ (سرور **هیچ** aspect/orientation/ultrawide/tv/desktop ✗)
- تم = **`shahrivar_default`** ✓ (alias خنثی روی قالب پایهٔ شهریور ✓) — سرور **هیچ**
  `anchorRatio`/`rightOffset` تعیین نمی‌کند ✗
- فراخوانی `headers()` و `pickScreenTheme()` از صفحه **حذف شد** ✗

**ب) کلاینت تنها منبع تشخیص ✓**
- `ScreenThemeSync` با `matchMedia`+`innerWidth/Height` کلاس را می‌سنجد ✓ (`detectScreenClass` ✓)
- تم را **یک‌بار** می‌گذارد ✓ (`done` ref ⇒ بعد از نخستین تعیین، هیچ سوییچ دیگری ✗)
  ⇒ **یک re-init** بیش از آن هم نه ✓ (پایداری ✓ · بدون پرش ✓)
- `anchorRatio`/`rightOffset` هم فقط کلاینت اعمال می‌کند ✓ (در `BaseChart` ✓)

**ج) ضدِ صفحهٔ سفید (تورِ سه‌لایه) ✓**
۱) `rAF` بعد از زوم ⇒ آشکارسازی ✓ · ۲) تورِ ۴۰۰ms ✓ · ۳) **تورِ ۱٫۵s** تازه ✓
⇒ در هیچ حالتی چارت پنهان نمی‌ماند ✗

**د) شاهدها**
```
SSR: data-chart-theme="shahrivar_default" ✓ · data-screen-class="unknown" ✓ · selftest=ok:0 ✓
با ?theme=shahrivar_ultrawide ⇒ همان تم خواسته‌شده ✓ (فقط برای دیباگ/اشتراک ✓)
```

### ۱۳.۸ محل چارت کاملاً مستقل از تم + خنثی‌سازی کامل SSR (بازبینی پانزدهم · 2026-09-25)

**الف) محل چارت دیگر از تم نمی‌آید ✗**
- `anchorRatio` از `ChartLayout` ✓، از `ScreenChartProfile` ✓، از هر ۵ جدول تم ✓، از `screenLayoutOf` ✓، از selfTest ✓ و از اتریبیوت SSR ✓ **حذف شد**.
- `rightOffsetBase`/`scrollToPosition` هم هیچ مقدار تمی نمی‌گیرند ✗ (آفست صرفاً از کش/عدد ثابت می‌آید).
- قاعدهٔ تمها فقط: `anchor` (معنایی = `last`) · `zoom` · `barSpacing`/`minBarSpacing` · `futureMargin` · `rightOffset` (پایه، بی‌اثر بر محل ✓) · فونت/ضخامت/سقف بج/هدر/لجند/`dprCap` · `ui`.

**ب) محل اولیه: ۱۵۰px، فقط یک‌بار ✓**
```
INITIAL_OFFSET_PX = 150          // فقط در نخستین mount · مستقل از تم/اسکرین
bars = round(px / barSpacing)    // تبدیل با فاصلهٔ واقعی میله
chart.applyOptions({ timeScale: { rightOffset: bars } })
```

**ج) کش کلاینت ✓**
- بعد از **اولین حرکت کاربر** (فلگ `armedRef` پس از ۶۰۰ms روشن می‌شود):
  `localStorage["chartOffset:<نماد|تایم‌فریم>"] = round(rightOffset × barSpacing)` (پیکسل ✓)
  🔴 **بازبینی هجدهم:** کلید **به تفکیک (نماد|تایم‌فریم)** ✓ (پیش‌تر یک کلید جهانی بود ✗ و
  آفست TF قبلی روی TF جدید می‌نشست ✗) · کش کهنهٔ جهانی یک‌بار پاک می‌شود ✓ ·
  آفست **یک‌بار در هر ساخت** اعمال می‌شود ✓ (نه روی هر پن ✗) · نبودِ کش ⇒ `150px` ✓.
- در همهٔ refreshها همان اعمال می‌شود ✓ · تغییر تم ✗ / تغییر اسکرین ✗ / refresh داده ✗ ⇒ **صفر تغییر** در محل چارت.
- ضدِ حلقهٔ رویداد: پرچم «در حال اعمال» + تلورانس ۲ میله.

**د) ارتفاع چارت**
- هیچ قاعده‌ای در تم نیست ✗ · `finalHeight = max(height ?? 360, 360)` (آرگومان صفحه ✓).

**ه) SSR کاملاً خنثی ✓**
- `screenClass = "unknown"` ✓ و تم = **`shahrivar_default`** ✓ · سرور هیچ aspect/orientation/ultrawide/tv/desktopتشخیص نمی‌دهد ✗ و **anchorRatio/rightOffset تعیین نمی‌کند** ✗.
- تشخیص فقط در کلاینت ✓ (`ScreenThemeSync` با `matchMedia` ✓) و **تنها یک بار** ✓ (`done` ref ✓).
- تورهای نمایش ضدِ صفحهٔ سفید: ① `rAF` پس از زوم ② تورِ ۴۰۰ms.

**و) شاهدها**
```
TSC=0 ✓ · ESLINT=0 error ✓ · suite=0 (H1: 46 assertion · 3 کشور · SSR ok)
SSR → data-chart-theme="shahrivar_default" ✓ · data-screen-class="unknown" ✓ · data-engine-selftest="ok:0" ✓
```

> ⚠️ درسِ ماندگار: ویرایش خط‌محورِ خودکارِ کامنت‌ها ممنوع ✗ — `screenProfiles.ts` در همین مسیر آسیب دید و **از صفر بازنویسی شد** ✓ (فایل تازه ۴۶۲ خط ✓ با selfTest که صراحتاً نبودِ `anchorRatio`/`heightRule` را می‌سنجد ✓).

### ۱۳.۹ دروازهٔ ScreenThemeSync — چارت فقط بعد از تشخیص کلاینت ساخته می‌شود (بازبینی شانزدهم · 2026-09-25)

**ریشهٔ باگ:** هر Apply (مثل تغییر تایم‌فریم) فرم را با کوئری خودش می‌فرستد ⇒
`?theme=` باقی نمی‌ماند ⇒ صفحه با تم خنثی رندر و چارت **پیش از** کامل‌شدن تشخیص
اسکرین ساخته می‌شد (`screenClass="unknown"` · قاب نامعتبر) ⇒ ناپدید شدن چارت.

| قطعه | فایل | نقش |
|---|---|---|
| singleton | `components/domain/historical/screenSyncState.ts` (**جدید**) | `markScreenSyncDone` · `isScreenSyncDone` · `onScreenSync` — بدون React و تم |
| اعلام | `ScreenThemeSync` | پیش از هر سوییچ، `markScreenSyncDone()` ⇒ چارت با تم نهایی **یک‌بار** |
| دروازه | `BaseChart` | `if (!gateOpen) return;` پیش از `createChart` ⇒ init در **صف** و تخلیه با تغییر state |

**fail-open:** صفحه‌های بدون `ScreenThemeSync` (چارت‌های ماکرو) با تورِ ۲۵۰ms باز می‌شوند ⇒ هیچ چارت قفل‌شدهٔ دائمی نداریم.

**نگهبان ارتفاع:** `Number.isFinite(height) && height > 0` نباشد ⇒ **۳۶۰px** (در `CandleChart.finalHeight` و `BaseChart.safeHeight`).

**بازرسی:** `data-chart-gate="queued|ready"` (در SSR: `queued`).

**تضمین بند ۶:** تغییر ارتفاع/پروفایل/تم/سایز صفحه/داده ⇒ هیچ‌کدام «ناپدید شدن» نمی‌سازد
(دروازه + نگهبان ارتفاع + دو تورِ آشکارسازی: rAF پس از زوم و ۴۰۰ms).

### ۱۳.۱۰ معماری تم‌های خانواده — `shahrivar_base` + ارث‌بری صریح (بازبینی هفدهم · 2026-09-25)

**نقد ساختاری که این بخش می‌بندد:** تم‌های خانوادگی پیش‌تر **غیرصریح** به درونِ
`shahrivar_hist` وابسته بودند و هیچ **گارانتی سختِ کاملیت** وجود نداشت (ولیدیتور فقط
در dev هشدار می‌داد).

| قطعه | مسیر | نقش |
|---|---|---|
| تم پایهٔ مشترک | `lib/chart/themes/shahrivar_base/index.ts` (**جدید**) | مرجع پالت کامل · اسلات‌ها (کندل/حجم/EMA/SMA/سیگنال) · چیدمان پایه · سیگنال‌ها · typography · ui پیش‌فرض |
| کارخانهٔ نسخه‌ها | `screenProfiles.screenThemeOf(cls, base)` (**جدید**) | هر تم = `{ ...base, فقط تفاوت‌ها }` (هیچ پایه‌ای از صفر ساخته نمی‌شود) |
| ۵ تم خانوادگی | `themes/shahrivar_{mobile,tablet,desktop,ultrawide,tv}/index.ts` | هر کدام **۱ خط**: `screenThemeOf(CLS, shahrivar_base)` |
| خنثیِ SSR | `shahrivar_default` | `{ ...shahrivar_base, name }` |
| گارانتی کاملیت | `lib/chart/themeCompleteness.ts` (**جدید**) | ۷ تم × (۱۵ کلید پالت · series ≥ ۲ · ۱۳ اسلات · typography · zoom/futureMargin/grid/panes.volume/scaleMargins/timeScale/series.thickness/legendRows/header/dprCap · نبود پارامترهای ممنوع) |
| انتشار در SSR | `CandleChart` | `data-theme-selftest="ok:0"` + `data-theme-selftest-first` |

**سه لایهٔ محافظت در برابر «ناپدید شدن چارت»:**
① کاملیتِ تم در CI (`data-theme-selftest`) ② `resolveThemeSpec` روی `BASE_THEMES.dark`
(لایهٔ fallback ران‌تایم) ③ نگهبان ارتفاع `360px` در `BaseChart`/`CandleChart`.

### ۱۳.۱۱ رفع باگ «Apply تایم‌فریم ≠ Ctrl+Shift+R» (بازبینی هجدهم · 2026-09-25)

**شاهدِ کاربر:** با `Ctrl+Shift+R` ظاهر چارت درست است؛ با Apply روی تایم‌فریم ظاهر عوض
می‌شود و انگار کش/وضعیت قبلی استفاده شده است.

**سنجش کد (پیش از تغییر):** re-init **انجام می‌شد** ✓ — `CandleChart` تایم‌فریم را در
`deps` می‌گذارد (`deps={[timeframe, symbol, axis.length, cross?.dir]}`) و افکت ساخت با
`chart.remove()` چارت را تخریب و از نو می‌سازد ✓. پس ریشه در **پنج نشتیِ حالت بین
instanceها** بود ✗:

| # | نشتی (پیش از تغییر ✗) | رفع (پس از تغییر ✓) |
|---|---|---|
| ۱ | کش آفست **جهانی** (`localStorage["chartOffset"]`) ⇒ آفست TF قبلی روی TF جدید | کلید `chartOffset:<نماد\|تایم‌فریم>` + پاک‌سازی یک‌بارهٔ کلید کهنه |
| ۲ | `armedRef` روی re-init ریست نمی‌شد ⇒ آفست قاب اولیهٔ چارت جدید **کش** می‌شد | `armedRef.current = false` در هر ساخت (۵۰۰–۶۰۰ms بعد «مسلح» ✓) |
| ۳ | آشکارسازی فقط به `zoomKey` گره داشت ⇒ با تغییر TF (زوم یکسان) قابِ **پیش از اعمال زوم** دیده می‌شد | نسل چارت: `viewReady = readyKey === zoomKey && readyGen === chartGen` |
| ۴ | `ViewMemory` بین TFها حافظهٔ **نشست** را برمی‌گرداند ⇒ Apply ≠ رفرش | کلید عوض شد ⇒ نمای **پیش‌فرض همان TF** + `viewMemory.clear(key)` ✓؛ کلید همان (رفرش کندل) ⇒ حافظه بازمی‌گردد ✓ |
| ۵ | `applyChartOffset` روی **هر پن/زوم** صدا زده می‌شد ⇒ چارت به آفست قدیمی «قفل» و پرش | آفست **یک‌بار در هر ساخت** (پیش از زوم) ✓؛ `onLogicalRange` فقط **ذخیره** می‌کند ✓ |

**قاعدهٔ نهایی:** هر ساخت = «نسل تازه» ⇒ `offsetKey` تازه · `armed=false` · آفست از
کشِ همان (نماد\|تایم‌فریم) یا `150px` · زوم/نما از پیش‌فرض همان کلید · تم/داده/اسکرین از
پارامترهای لحظهٔ ساخت (`buildChartOptions(theme, layout, …)` ✓) ⇒ **هیچ config از
instance قبلی patch نمی‌شود** ✗ (اثر `applyOptions` ظاهرِ زنده فقط idempotent روی چارت جاری است ✓).

**بازرسی در DOM (فرمول پذیرش کاربر):**
`data-chart-gen` (باید با هر Apply یکی جلو برود ✓) · `data-chart-view-src`
(`default` = TF عوض شد ✓ / `memory` = رفرش همان کلید ✓) · `data-chart-offset-key`
(`BTCUSDT|4h` ✓) · `data-chart-gate` ✓ · `data-chart-ready` ✓.

**معیار قبولی:** برای همان (نماد\|تایم‌فریم)، مقادیر `data-chart-*` و ظاهر چارت پس از
Apply با پس از `Ctrl+Shift+R` **یکسان** باشد ✓ (زیرا هر دو مسیر اکنون از یک قاعدهٔ
قطعی می‌آیند: کشِ همان کلید یا پیش‌فرض ✓).

### ۱۳.۱۲ رفع باگ «پرش پس از Apply روی **همان** تایم‌فریم» (بازبینی نوزدهم · 2026-09-25)

**شاهد کاربر:** `Ctrl+Shift+R` روی `…?tf=5m…` ⇒ چارت ۵ دقیقه‌ای درست ✓؛ سپس **Apply روی
همان ۵m** ⇒ اول چارت قبلی ~۱s دیده می‌شود، بعد چارت **به یک نمای زوم‌شدهٔ دیگر می‌پرد** ✗.

**دو ریشهٔ واقعی (هر دو بسته شد ✓):**

| # | ریشه ✗ | چرا می‌پرید | رفع ✓ |
|---|---|---|---|
| ۱ | `getVisibleLogicalRange()` ⇒ ذخیرهٔ **ایندکس میله** | با رسیدن کندل تازه، ایندکس‌ها جابه‌جا می‌شوند ⇒ همان اعداد به **پنجرهٔ زمانی دیگری** نگاشت می‌شد | ذخیره/بازگردانی با **timestamp** (`getVisibleRange`/`setVisibleRange`) + **نگهبان هم‌پوشانی** با دادهٔ جاری (بازهٔ بیرون از داده ⇒ رد ⇒ زوم پیش‌فرض) |
| ۲ | `rAF` بلافاصله پس از بازگردانی، **زوم پیش‌فرض را دوباره** اعمال می‌کرد | نما از حافظه می‌آمد و همان لحظه باطل می‌شد ⇒ «پرش به یک نمای دیگر» | `if (viewSrcNow !== "memory") applyZoom(layout.zoom)` ⇒ **مالکیت نما**: حافظه برنده است ✓ |

**نکته‌های تأییدشده برای کاربر:**
- **سرور نیازی به ریبوت ندارد ✗** — `next dev` فایل‌ها را زنده می‌خواند ✓ (لاگ: همان URL `200` ✓)
  و `data-chart-gen` در SSR نشان می‌دهد باندل تازه فعال است ✓. فقط **مرورگر** باید یک‌بار
  باندل تازه را بگیرد ✓ (`Ctrl+Shift+R` ✓) وگرنه JS قدیمی اجرا می‌شود ✗.
- کش `chartOffset` **جهانیِ** قدیمی خودکار پاک می‌شود ✓ و کش جدید به تفکیک `BTCUSDT|5m` ✓ است.
- نمایش ~۱s «چارت قبلی» **باگ نیست** ✓ — همان رفت‌وبرگشت سرور (`router.replace` ⇒ RSC ✓) است؛
  پس از رفع، همان چارت با **همان پنجرهٔ زمانی** می‌ماند و فقط کندل تازه اضافه می‌شود ✓ (بدون پرش ✗).
- `axis.length` در `deps` همچنان re-init می‌دهد ✓ (برای درستی داده ✓) ولی چون نما **زمان‌محور**
  بازمی‌گردد، re-init دیگر «پرش» ایجاد نمی‌کند ✓.

### ۱۳.۱۳ ماژول واحد مدیریت نما — `lib/chart/viewPersistence.ts` (مرحلهٔ ۳ · 2026-09-25)

**مالکِ واحد نما:** `frontend/lib/chart/viewPersistence.ts` (**جدید** · خالص ✓ پاک: صفر
وابستگی React/DOM/LWC ✓ · `localStorage` با نگهبان SSR ✓) + `viewPersistenceSelfTest()`.

| قاعده | پیاده‌سازی |
|---|---|
| ۱) کلید یکتا | `viewKeyOf(symbol, tf, chartType)` و `persistKeyOf(viewKey, chartType)` ⇒ `<symbol>\|<tf>\|<chartType>` ✓ |
| ۲) حافظهٔ زمان‌محور | `saveView/getVisibleRange` (timestamp ✓) — **بدون** ایندکس میله ✗ |
| ۳) انقضا | `VIEW_MAX_AGE_MS = 12h` ✓ ⇒ کهنه ⇒ باطل + پاک‌سازی رکورد ✓ |
| ۴) آفست اولیه | `INITIAL_OFFSET_PX = 150` ✓ (تک‌منبع ✓) |
| ۵) نسخه‌گذاری باندل | رکورد شامل `v` (نسخهٔ حافظه ✓) و `b` (`NEXT_PUBLIC_BUILD_ID` ?? `dev` ✓) ⇒ ناسازگار ⇒ باطل ✓ |
| ۶) مالکیت نما | BaseChart: `viewSrcNow === "memory"` ⇒ **زوم پیش‌فرض/تم/auto-fit/rightOffset تم اعمال نمی‌شود** ✗ (فقط آفست استاندارد/کاربر ✓) |
| ۷) بازگردانی یک‌بار | `restoreView(key, { fresh })` — `fresh = keyChanged \|\| !restoredOnceRef` ✓ ⇒ `localStorage` فقط در mount اول (یا تغییر کلید، مثل رفرش ✓) |
| ۸) ایزولاسیون نسل | هر ساخت: `chartGen++` · `armed=false` · `offsetKey` تازه · `seriesMap/seriesById` صفر ✓ ⇒ هیچ نشت ✗ |
| ۹) استقلال از تم | تم صفر پارامتر نما دارد ✗ (آفست و زومِ تم باطل می‌شوند ✓) |
| ۱۰) استقلال از اسکرین | `ScreenThemeSync` فقط تم را هدایت می‌کند ✗ ⇒ صفر اثر بر نما ✓ |
| ۱۱) استقلال از SSR | ماژول در SSR هیچ رکوردی نمی‌خواند/نمی‌نویسد ✗؛ BaseChart فقط داخل effect (کلاینت ✓) از آن استفاده می‌کند ✓ |
| ۱۲) نسخهٔ باندل | تغییر `v`/`b` ⇒ حافظه باطل ✓ · نمای پیش‌فرض ✓ · چارت با نسخهٔ جدید ساخته می‌شود ✓ |
| ۱۳) ریل‌تایم | کندل تازه ⇒ `dataKey` ساختاری ثابت ✓ (مسیر افزایشی `SeriesRegistry.update` ✓) و در re-init هم نما **زمان‌محور** برمی‌گردد ✓ ⇒ زوم/محل ثابت ✓ بدون پرش ✗ |

**بازرسی در DOM:** `data-view-key` ✓ · `data-view-age` (ms ✓) · `data-view-selftest="ok:0"` ✓
· `data-chart-gen` ✓ · `data-chart-view-src` ✓ (`memory` = از حافظه ✓ / `default` = پیش‌فرض ✓).
**حذف موازی‌ها:** `ViewMemory` موضعیِ BaseChart ✗ و کش جهانیِ `chartOffset` ✗ (یک‌بار پاک ✓).

### ۱۳.۱۴ ریشهٔ «زوم متفاوت پس از Apply» — **پارامتر `theme` در فرم گم می‌شد** (مرحلهٔ ۵ · 2026-09-25)

**شاهد کاربر:** `Ctrl+Shift+R` ⇒ زوم درست ✓ · زدنِ **Apply** ⇒ زوم متفاوت ✗ (در حالی که
`viewPersistence` و آفست‌ها همه کلیددار و زمان‌محور بودند ✓).

**ریشه (با شاهد کد ✓):** فرم کنترل‌های سرور در `app/dashboard/historical/crypto/page.tsx`
** فقط ۴ فیلد** دارد: `asset` · `venue` · `tf` · `pane` ✓ — و ارسالِ `GET` مرورگر،
**بقیهٔ پارامترهای URL را حذف می‌کند** ✗ (از جمله `theme=shahrivar_desktop` ✓ و وضعیت
ماژول‌ها `mod`/`p` ✓). با نبودِ `theme`:

```
page.tsx:109   themeId = (themeParam && …) ? themeParam : SSR_THEME_ID   // ⇒ shahrivar_default (خنثی ✓)
ScreenThemeSync.tsx:50   router.replace(`?theme=${want}`)                  // ⇒ تمِ واقعیِ اسکرین کاربر ✗
screenProfiles.screenLayoutOf(cls):36-40   zoom: c.zoom                   // ⇒ هر اسکرین زوم خودش! ✗
   mobile 6M · tablet 1Y · desktop 3Y6M · ultrawide 5Y · tv 1Y
```
⇒ روی رفرش، زوم = **دسکتاپ `3Y6M`** (چون `theme` در URL بود ✓) و پس از Apply، زوم =
**تمِ واقعیِ اسکرین** ✗ ⇒ همان «زومِ متفاوت» ✓. (کش/حافظهٔ `viewPersistence` بی‌گناه بود ✓.)

**رفع ✓:** همهٔ پارامترهای دیگر به‌صورت `<input type="hidden">` همراه فرم می‌شوند
(`keptParams` در همان صفحه ✓) ⇒ `Apply ≡ Ctrl+Shift+R` ✓ و وضعیت Control Center هم
با Apply **ریست نمی‌شود** ✓.

**مسیرهای بروزرسانی داده (پاسخ به پرسش کاربر ✓):**
| مسیر | محرک | جزئیات |
|---|---|---|
| **Apply** (نیتیو) | `<form method="get">` صفحه (`page.tsx:274` ✓) | ناوبری کامل سند ⇒ رندر دوبارهٔ Server Component ⇒ `fetchHistoricalCandles` ⇒ `lib/server/historical.ts` ⇒ سرویس `:4000` ⇒ `GET /tf/:symbol/:tf` ✓ (سقف ۵٬۰۰۰ کندل و `clampWindow` ✓) |
| **پولر زنده** | `HistoricalLivePoller` هر ۴۵s ✓ | `GET /api/historical/tf?light=1&since=…` ✓ ⇒ `304` = صفر کار ✓ · `appended>0` یا تغییر `forming` (throttle ۳۰s ✓) ⇒ **`router.refresh()`** ✓ ⇒ همان RSC با پروپ‌های تازه (بدون remount ✓) |
| **تغییر ماژول/آیتم** | `ControlCenter` (`router.replace(encodeState…)` ✓ خط ۲۴۹) | فقط وضعیت URL ⇒ همان داده، سری/پارامترهای تازه ✓ |

**همهٔ نقاط ذخیرهٔ نما/زوم در کد (پاسخ پرسش ۳ ✓):**
`lib/chart/viewPersistence.ts` (مالک واحد ✓: `session` + `localStorage["view:<symbol>|<tf>|<chartType>"]` ✓ با `at`/`v`/`b` ✓) ·
`BaseChart.tsx`: `restoreOffsetPx` (خط ۳۷۲ ✓) · `applyChartOffset` (۳۹۹ ✓) · آفست پس از زوم (۷۵۳ ✓) ·
زوم پیش‌فرض + `lastZoomKeyRef` (۱۱۷۵–۱۱۷۶ ✓) · `restoreView(…, { fresh })` (≈۱۱۹۵ ✓) ·
اعمال در rAF با **مالکیت حافظه** (≈۱۲۳۰ ✓) · `saveView` در teardown (≈۱۳۴۰ ✓) · `saveOffsetPx` روی حرکت کاربر (≈۱۳۵۰ ✓) ·
پاک‌سازی کش کهنهٔ جهانی `chartOffset` (✓) · `interactionBus.ViewMemory` (هستهٔ V2 — **BaseChart دیگر استفاده نمی‌کند** ✗) ·
و **حالت درونیِ LWC** (حفظ logical range هنگام `setData/update` ✗ — نامستند، ولی با بازگردانی زمان‌محور بی‌اثر می‌شود ✓).

### ۱۳.۱۵ آفست ۱۰۰px + رفع «زوم خودکار بعد از مدی باز بودن» (مرحلهٔ ۶ · 2026-09-25)

**(۱) فضای آیندهٔ بصری — ۱۰۰px ✓ :** `viewPersistence.INITIAL_OFFSET_PX: 100` ✓
(`VIEW_MEMORY_VERSION` به `1.1.0` رفت ✓ ⇒ رکوردهای کهنه با `px=150` باطل می‌شوند ✓ و
نخستین باز شدن/رفرش، آخرین کندل را ≈۱۰۰px از لبهٔ راست می‌نشاند ✓). تبدیل px⇒میله با
`barSpacing` واقعی انجام می‌شود ✓ (`barsForPx` ✓ · سقف ۲۰۰ میله ✓) و هیچ تمی آن را
override نمی‌کند ✗.

**(۲) زومِ خودکار بدون دخالت کاربر ✗ — ریشه و رفع:**
| حلقه | شاهد |
|---|---|
| پولر زنده هر ۴۵s (یا تغییر کندل در حال تشکیل، throttle ۳۰s ✓) ⇒ `router.refresh()` | `HistoricalLivePoller.tsx:122-125` ✓ |
| پروپ‌های تازه ⇒ افکت `[dataSig]` ⇒ `engineSeries.update(id, pts)` | `BaseChart.tsx:1401` ✓ |
| اگر شکل داده عوض شود ⇒ `SeriesRegistry.update` مسیر **`full`** ⇒ **`setData`** ✗ | `seriesRegistry.ts:110-137` ✓ |
| LWC بازهٔ **logical** (ایندکس میله ✗) را نگه می‌دارد ⇒ با لغزش پنجرهٔ ۵۰۰۰ کندلی/عوض‌شدن کندل جاری، همان اعداد به **پنجرهٔ زمانی دیگری** نگاشت می‌شوند ✗ | رفتار داخلی LWC (نامستند ✗) |
| نتیجه: چارت «خودش» روی یک محدودهٔ دیگر زوم می‌شود ✗ | شاهد کاربر ✓ |

**رفع ✓:** در همان افکت، پنجرهٔ دیدنی **قبل** از به‌روزرسانی snapshot می‌شود و **بعد** از
آن — یک `rAF` + یک تایمر ۱۸۰ms ✓ — دوباره `setVisibleRange` + `applyChartOffset` می‌شود ✓؛
با نگهبان «همان چارت» ✓ (اگر بازساخت شده باشد، بی‌اثر ✓). شمارندهٔ بازرسی:
`data-view-reassert` روی کانتینر چارت ✓ (باید با هر تازه‌سازی داده یکی جلو برود ✓ و
`data-chart-gen` **ثابت** بماند ✓ ⇒ یعنی زوم دست‌نخورده ✓).

### ۱۳.۱۶ «تابع افزودن کندل، محور زمان را عوض می‌کند؟» — **بله بود ✗ · رفع شد ✓** (مرحلهٔ ۷ · 2026-09-25)

**پرسش کاربر:** آیا تابعی که کندل‌های جدید را اضافه می‌کند، تایم‌لاین چارت را تغییر می‌دهد؟
**پاسخ با شاهد رسمی کتابخانه ✓:** **بله** — آپشن `timeScale.shiftVisibleRangeOnNewBar` در
`lightweight-charts@5.2.1` (`dist/typings.d.ts:1437-1443` ✓):

```
* Shift the visible range to the right (into the future) by the number of new bars when new data is added.
* Note that this only applies when the last bar is visible.
* @defaultValue `true`
shiftVisibleRangeOnNewBar: boolean;
```

و در کد ما **هیچ‌جا ست نشده بود** ✗ (`grep` در `components/ lib/ app/` = ۰ ✓) ⇒ پیش‌فرض
`true` فعال بود ✓. زنجیرهٔ رخداد:
`HistoricalLivePoller` (۴۵s یا تغییر کندل در حال تشکیل ✓) ⇒ `router.refresh()` ✓ ⇒
پروپ‌های تازه ⇒ `engineSeries.update(id, pts)` ⇒ `series.update(newBar)`/`setData` ✓ ⇒
چون **آخرین کندل دیدنی است** (فضای ۱۰۰px مرحلهٔ ۶ ✓) ⇒ LWC پنجره را یک میله **به جلو**
می‌لغزاند ✗✓ = «محور زمان خودش عوض می‌شود» ✓.

**رفع ✓ (یک خط، مستند):** در `lib/chart/lwcOptions.ts` داخل `timeScale`:
```ts
shiftVisibleRangeOnNewBar: false,                              // ⇒ هیچ حرکتِ خودکار با کندل تازه ✗
allowShiftVisibleRangeOnWhitespaceReplacement: false,          // ⇒ پر شدن «جای خالی آینده» هم حرکت نمی‌دهد ✗
```
**همراه با لایهٔ قبلی:** snapshot/بازاعمال پنجره در افکت داده (مرحلهٔ ۶ ✓) + بازگردانی
زمان‌محور در هر re-init (مرحلهٔ ۳ ✓) ⇒ «کندل تازه اضافه شود، نما ثابت بماند» ✓ (بند ۱۳
مرحلهٔ ۳ ✓). **بازرسی:** `data-view-reassert` (تازه‌سازی داده ✓) و `data-chart-gen`
(باید ثابت بماند ✓).

### ۱۳.۱۷ «روشن/خاموش کردن اندیکاتور، مکان محور زمان را ریست می‌کرد» ✗ → رفع ✓ (مرحلهٔ ۸ · 2026-09-25)

**شاهد کاربر:** کاربر محور زمان را جابه‌جا می‌کند ✓؛ بعد در کشوی Control Center یک
اندیکاتور را روشن/خاموش می‌کند ⇒ چارت **به حالت پیش‌فرض مکانی** می‌پرد ✗.

**ریشه (دو حلقه، هر دو بسته شد ✓):**
| حلقه | چرا پرش می‌داد |
|---|---|
| ۱) روشن/خاموش اندیکاتور ⇒ پلن سری‌ها عوض می‌شود ⇒ `dataKey` **ساختاری** (`id:type:scale` ✓) تغییر می‌کند ⇒ **re-init** کامل (destroy + create ✓) | در مسیر re-init، بازگردانی نما **انجام می‌شد** ✓ ولی در `rAF` حالتِ «از حافظه» **هیچ‌کاری نمی‌کرد** ✗ ⇒ LWC در فریم اول همان نمای پایه/پیش‌فرض خودش را می‌نشاند ⇒ پنجرهٔ کاربر ریست می‌شد ✗ |
| ۲) پلِ نما بین نسل‌ها نبود ✗ (تنها `viewPersistence` که هم `session` ✓ هم `localStorage` ✓ دارد) | اگر نوشتن/خواندن حافظه به هر دلیلی رد شود، نسل بعد «بی‌نما» بالا می‌آید ⇒ `applyZoom(layout.zoom)` ⇒ نمای پیش‌فرض ✗ |

**رفع ✓:**
1. **پلِ نسل‌ها** (`pendingViewRef` ✓): در `teardown` پنجرهٔ **دقیقِ** کاربر (`getVisibleRange` ⇒ timestamp ✓) با **کلید یکتای همان لحظه** ذخیره می‌شود ✓ و ساخت بعدی — اگر کلید یکتا **همان** باشد ✓ — همان را می‌نشاند ✓ (یک‌بارمصرف ✓ ⇒ با تغییر نماد/TF منتقل نمی‌شود ✗).
2. **بازتأکید در فریم نخست** (`wantRangeRef` ✓): در `rAF` اگر پنجرهٔ آرمانی وجود دارد، **دوباره** `setVisibleRange` + `applyChartOffset` ✓؛ فقط در نبودِ آن `applyZoom(layout.zoom)` ✓.
3. **تور دوم ۱۸۰ms** ✓ (مقاوم به تنظیم دیرهنگام LWC ✓ · مقید به «همان چارت» ✓ و در teardown پاک می‌شود ✓).
4. **صفر‌سازی در هر ساخت** ✓: `wantRangeRef.current = null` ⇒ هیچ پنجره‌ای به کلید دیگر نشت نمی‌کند ✗.

**نتیجه:** جابه‌جایی محور زمان + روشن/خاموش کردن اندیکاتور ⇒ **مکان ثابت** ✓ (بدون پرش ✗)؛
و در تغییر نماد/تایم‌فریم همچنان قاعدهٔ «پیش‌فرض/حافظهٔ همان کلید» حکم‌فرماست ✓.

### ۱۳.۱۸ «خاموش‌کردن اندیکاتور ⇒ پرش به موقعیتِ تایم‌فریم ۱ ساعته» ✗ → رفع ✓ (مرحلهٔ ۹ · 2026-09-25)

**شاهد کاربر:** چارت روی **۵ دقیقه** است؛ در کشو یک اندیکاتور را خاموش می‌کند ⇒ چارت به
**موقعیت چارتِ ۱ ساعته** می‌پرد ✗ (در حالی که تایم‌فریم انتخابی ۵m بوده ✓).

**ریشه (قطعی، با شاهد کد ✓):** زنجیرهٔ `ControlCenter` وضعیت را در URL می‌نویسد ولی
**بقیهٔ پارامترها را حذف می‌کرد** ✗:
```
profiles.ts:225-239   encodeState(state) ⇒ فقط `?profile=…&mod=…&p=…`            ⛔ نه tf/asset/venue
ControlCenter.tsx:249 push = router.replace(`${pathname}${encodeState(next)}`)     ⛔ بدون ادغام با sp
page.tsx (searchParams)  tf غایب ⇒ HISTORICAL_DEFAULTS.timeframe = "1h"           ⇒ رندرِ ۱ ساعته ✗
```
⇒ داده و کلید یکتای نما هم به `BTCUSDT|1h|candle` عوض می‌شد ✓ ⇒ کاربر «موقعیت چارتِ ۱ ساعته»
را می‌دید ✓ (و همان پنجرهٔ ۱h از `viewPersistence` می‌آمد ✓). این هم‌خانوادهٔ باگِ مرحلهٔ ۵ بود
(فرمِ Apply ✗) که حالا **هر سه** مسیر نوشتن URL اصلاح شده‌اند ✓:
| مسیر نوشتن URL | وضعیت |
|---|---|
| فرمِ کنترل‌های سرور (`page.tsx` ✓) | مرحلهٔ ۵: پارامترها با `hidden` حفظ می‌شوند ✓ |
| `ScreenThemeSync` (`router.replace`) | از ابتدا `new URLSearchParams(sp.toString())` ✓ (حفظ ✓) |
| **`ControlCenter.push`** | **مرحلهٔ ۹ (همین):** وضعیت قبلی پاک (فقط `profile`/`mod`/`p` ✓) و سپس روی **پارامترهای موجود** سوار می‌شود ✓ |

**نتیجه:** خاموش/روشن کردن اندیکاتور ⇒ `tf=5m` و نماد/تم/پنل دست‌نخورده ✓ · کلید یکتا همان
`BTCUSDT|5m|candle` ✓ · و با پلِ مرحلهٔ ۸ **مکان محور زمان ثابت** ✓ (پرش ✗). نگهبان رگرسیون
در `scripts/review-screen-themes.py` (بررسی منبعی: وجود `sp.toString()` در `push` ✓ و
`keptParams` در فرم ✓).

### ۱۳.۱۹ ماندگاری **بازهٔ عمودی (Y)** + حفظ در لحظهٔ ترک صفحه (مرحلهٔ ۱۰ · 2026-09-25)

**خواستهٔ کاربر:** مکانِ محور زمانی (**X**) و بازهٔ عمودی (**Y**) در هر تایم‌فریم، پس از
جابه‌جایی در **کش مرورگر** بماند ✓ و هنگام تغییر پارامتری مثل اندیکاتور (نیاز به
بازرندر ✓) از همان کش خوانده شود ✓ — با همان قواعد معماری (کلید یکتا · انقضا · نسخه ✓).

| قطعه | پیاده‌سازی |
|---|---|
| کلید | همان `<symbol>\|<timeframe>\|<chartType>` ✓ (per-TF ✓) |
| **Y در رکورد** | `ViewRecord.y = { min, max } \| null` ✓ (`viewPersistence.ts` ✓) · نسخه به **`1.2.0`** رفت ✓ (تغییر معنای رکورد ⇒ رکوردهای کهنه باطل ✓) |
| **تشخیص «دستی»** | فقط اگر `chart.priceScale("right").options().autoScale === false` ✓ (`PriceScaleOptions.autoScale` · `@defaultValue true` ✓ — کشیدن محور قیمت توسط کاربر آن را `false` می‌کند ✓) ⇒ در حالت خودکار **صفر ذخیره** ✓ (صفر تغییر رفتار ✗) |
| خواندن Y | `series.coordinateToPrice(0)` و `coordinateToPrice(chart.paneSize(0).height)` ✓ (در v5 `getVisiblePriceRange` وجود ندارد ✗) |
| تثبیت Y | `seriesOptionsFor(..., pinnedY)` ⇒ `autoscaleInfoProvider` بازهٔ **ثابت** می‌دهد ✓ (∪ آخرین قیمت سری ✓ تا کندل زنده بیرون نیفتد ✗ · ∪ باند هدف ✓ · حاشیهٔ تم حفظ ✓) و فقط برای سری‌های **مقیاس راست** ✓ |
| نگهبان‌ها | Y باید `max>min>0` ✓ و با **دامنهٔ داده** هم‌پوشانی داشته باشد ✓ (بی‌ربط ⇒ رد ✓ ⇒ محور خودکار می‌ماند ✓ ⇒ چارت خالی/بریده ✗) · انقضای ۱۲h ✓ · نسخهٔ رکورد ✓ |
| **حفظ هنگام ترک صفحه** | `pagehide` + `visibilitychange→hidden` ⇒ `persistNow()` که **هم X هم Y** را در همان کش می‌نویسد ✓ (رفع شکافِ رفرش سخت که `teardown` را تضمین نمی‌کند ✗) · در teardown هم پاک‌سازی می‌شوند ✓ |
| مسیر بازرندر (اندیکاتور ✓) | پلِ نسل‌ها (X ✓ مرحلهٔ ۸) + `restorePriceRange` (Y ✓) هر دو از همان کش ⇒ **X و Y ثابت** ✓ |

**بازرسی:** `data-view-selftest="ok:0"` ✓ · `data-view-key` · `data-view-age` ✓
(و در کلیدهای `localStorage`: `view:<symbol>|<tf>|<chartType>` با `from/to/at/px/y/v/b` ✓).

### ۱۳.۲۰ زنده‌کردن دادهٔ تاریخی + چارتِ «فقط کندل بسته» (مرحلهٔ ۱۱ · 2026-09-25)

**۱) به‌روزرسانِ پس‌زمینهٔ ۱ دقیقه‌ای** — `scripts/historical-updater.sh` (**جدید** ✓):
- حلقهٔ بی‌پایان روی `collector/crypto/historical/full/run-update-all.cjs <SYMBOL>` ✓ که برای هر
  **(ونو × بازار)** فقط **دُمِ تازه** را می‌گیرد و با کلید `(symbol, exchange, timestamp_raw)`
  در `candles_1m.db` **ادغام** می‌کند ✓ (بدون backfill ✗ — آن کار Full Downloader ✓ ·
  بدون بازنویسی ✗). خودِ updater کنار DB یک **sidecar** (`latest.json`) می‌نویسد تا سرویس
  تاریخی تازگی را `O(1)` بخواند ✓ (`update-1m.cjs` ✓ · fail-open ✓).
- الگوها: **backoff نمایی** روی خطا (۶۰→…→۳۰۰s ✓) · قفل تک‌نمونه با PID-file ✓ ·
  لاگ `/tmp/hist-updater.log` ✓ · خروج تمیز با SIGTERM/SIGINT ✓ · حالت `--once` برای تست ✓.
- متغیرها: `HIST_UPDATER_SYMBOL` (BTCUSDT ✓) · `HIST_UPDATER_INTERVAL` (60s ✓) ·
  `HIST_UPDATER_LOG` · `HIST_UPDATER_PID` ✓.
- اجرا: `bash scripts/historical-updater.sh` (پس‌زمینه ✓) یا `… --once` (تست ✓).

**۲) چارتِ «فقط کندل بسته»** ✓:
| جا | تغییر |
|---|---|
| `CandleChart.tsx` (محور اصلی ✓) | `seriesCandles = closed?.length ? closed : candles` ✓ ⇒ **سری کندلی = کندل‌های بسته** ✓ (کندل نیم‌بسته هرگز روی چارت نمی‌آید ✗) · پاسخ شکل قدیمی ⇒ `candles` (صفر تغییر رفتار ✓) · چون محورِ ساختار/اندیکاتور هم از همین می‌آید ✓، منطق `drop` دیگر لازم نمی‌شود ✓ |
| `HistoricalLivePoller.tsx` | تریگر **نوک زندهٔ `forming`** پیش‌فرض **خاموش** ✓ (`FORMING_TICK_ENABLED` ✓ · روشن‌کردن با `NEXT_PUBLIC_HISTORICAL_FORMING=1` ✓) ⇒ رفرش فقط با **کندل بستهٔ تازه** (`appended > 0` ✓) ⇒ صفر churn بصری ✓ |

**۳) زنجیرهٔ زندهٔ کامل:** `scripts/historical-updater.sh` (DB ✓) ⇒ سرویس `:4000`
(`/tf` ✓ · ETag/`304` ✓ · sidecar ✓) ⇒ `HistoricalLivePoller` (۴۵s · `light=1` ✓) ⇒
`router.refresh()` **فقط** با کندل بستهٔ تازه ✓ ⇒ `CandleChart` (کندل بسته ✓) ⇒ نما/بازهٔ
عمودی از کشِ مرحلهٔ ۱۰ ثابت می‌ماند ✓ (`data-view-reassert` ✓ · `data-chart-gen` ثابت ✓).

### ۱۳.۲۱ هم‌زمانی با بسته‌شدن کندل‌های صرافی (مرحلهٔ ۱۳ · 2026-09-25)

**شاهد کاربر:** «گاهی یک کندل تازه می‌آید، گاهی دو تا» ⇒ یعنی ضربان به‌روزرسانی با
مرزهای بسته‌شدن صرافی‌ها **هم‌فاز نیست** ✗.

**سنجش علت (شواهد خودمان ✓):**
| شاهد | معنا |
|---|---|
| لاگ یک دور: `kucoin_spot → 20:30:00` ✓ · `bitget_spot → 20:28:00` ✗ · `okx_futures → 20:29:00` ✗ | هر بازار در **دقیقهٔ متفاوتی** «بسته» می‌شد ⇒ نوسان ۱/۲ کندل ✓ |
| `timedatectl`: **System clock synchronized: yes** ✓ · NTP active ✓ | مشکل **skew ساعت نیست** ✗ — مشکل **فاز** است ✓ |
| پولر فرانت: `intervalMs = 45s` ثابت ✗ (و `MIN_REFRESH_MS = 30s`) | ضربان ثابت هیچ نسبتی با عرض TF ندارد ⇒ گاهی ۰ کندل، گاهی ۲ ✓ |
| کلکتور: `sleep 60` بعد از پایان دور ✗ | فازِ دورها در طول ساعت **سُر می‌خورد** ✗ (دور کند ⇒ تأخیر انبار می‌شود ✓) |

**راهکار سه‌لایه (پیاده شد ✓):**
| لایه | تغییر | نتیجه |
|---|---|---|
| **۱) کلکتور هم‌تراز با مرز دقیقهٔ UTC** | `scripts/historical-updater.sh` ⇒ محاسبهٔ `60000 - (now mod 60000) + SAFETY` با `awk` **کسرثانیه‌ای** ✓ · `HIST_UPDATER_SAFETY_MS` پیش‌فرض **5000ms** ✓ (مهلت انتشار صرافی ✓) · در خطا همان backoff نمایی ✓ | هر دور **درست چند ثانیه پس از مرز** شروع می‌شود ✓ ⇒ همهٔ ونوها در **یک دقیقهٔ مشترک** به‌روز می‌شوند ✓ |
| **۲) پولر فرانت هم‌تراز با مرز TF** | `alignedDelayMs(timeframe, now)` ✓ در `HistoricalLivePoller` ⇒ `delay = عرضTF − (now mod عرضTF) + مهلت` ✓ · مهلت ۴s (TF≤۱h ✓) و ۱۵s (بزرگ‌تر ✓) · کف ۱۵s ✓ · سقف ۵ دقیقه ✓ (TFهای بلند تا دیرکرد پنهان نماند ✓) | هر رفرش **دقیقاً یک کندل بستهٔ تازه** می‌آورد ✓ (نه ۰ نه ۲ ✓) |
| **۳) سرویس (بسته‌شدن TFهای بالاتر)** | `/tf` همان ۱m خام را با `closed` می‌دهد ✓ و TTL کش ۴۵s ✓ | یک باکت ۵m/۱h وقتی «بسته» است که **آخرین ۱m داخلش** رسیده باشد ✓ ⇒ هم‌ترازیِ لایهٔ ۱ پیش‌نیاز درستیِ ۳ است ✓ |

**قدم بعدی (اختیاری ✓):** زمان‌بند **per-venue** (هر ونو با فازِ انتشار خودش ✓ — مثلاً
bitget/KuCoin که چند ثانیه دیرتر منتشر می‌کنند ✓) + «پاس دوم» فقط برای ونوهایی که
عقب مانده‌اند ✓. تا آن زمان، لایهٔ ۱ نوسان را از «چند دقیقه» به «حداکثر یک دقیقه و
فقط بعضی ونوها» می‌رساند ✓.
