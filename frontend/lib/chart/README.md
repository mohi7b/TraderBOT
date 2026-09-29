# Chart Reference — چارت مرجع ماژولار

> موتور واحد همهٔ چارت‌های پروژه: **Macro · Markets · Energy · Crypto · Trading · Risk**
> قاعده: **چارت فقط داده را رسم می‌کند، ظاهر را از بیرون می‌گیرد.**

```tsx
<BaseChart
  data={series}      // ChartSeriesInput[]
  theme={...}        // ChartTheme | override | themeName
  layout={...}       // زوم · لجند · سیگنال‌ها · grid · padding · scales
  signals={...}      // ids کتابخانه یا سیگنال‌های سفارشی (+ anchored · target)
  layers={...}       // باند هدف · رکود · رویداد · پیش‌بینی · شوک
/>
```

## فایل‌ها

| فایل | مسئولیت |
|---|---|
| `types.ts` | **قراردادها**: `ChartSeriesInput` · `ChartTheme` · `ChartThemeSpec` · `ChartLayout` · `ChartSignal` · `ChartLayer` · `LayerPaintContext` |
| `themePresets.ts` | **رجیستری تم‌ها** (`THEME_REGISTRY`) + `resolveThemeSpec()` + `resolveThemeName()` + `getThemeSpec()` + `mergeTheme()` + `resolveSlot()` |
| `themeSpec.ts` | **قالب تم**: `normalizePaletteInput()` (شکل سبک → پالت) · `normalizeLayoutSpec()` (`scaleMargins` → `priceScale`) · `resolveColorRef()` (`slot:badgeBg`) · `validateThemeSpec()` |
| `themes/<family>/` | تم‌های خانوادگی: `inflation_modern/{index,colors.dark,colors.light,layout,signals,manifest.json}` + `_template/` |
| `THEME_AUTHORING.md` | **استاندارد ساخت تم** (چک‌لیست + قواعد نام‌گذاری + نسخه‌گذاری) |
| `layout.ts` | `ZOOM_PRESETS` (1M…MAX) · `resolveZoomRange()` · `mergeLayout()` · `toUnixSec()` |
| `signals.ts` | کتابخانهٔ **۹ سیگنال** خالص (شامل **ISS**) + `computeSignals()` |
| `layers.ts` | **۵ نقاش لایه** روی بوم + `paintLayers()` + رجیستری (`LAYER_IDS`) |
| `adapters.ts` | تبدیل دادهٔ دامنه → `ChartSeriesInput[]` (`fromDatedPoints` · `fromOhlc` · `fromNumericPoints`) |
| `lwcOptions.ts` | `buildChartOptions(theme, layout, format)` + `PRICE_FORMATTERS` (بدون مقدار هاردکد) |
| `presets/macro.ts` | پیکربندی آمادهٔ ماکرو: `MACRO_LAYOUT` · `MACRO_SIGNALS` · `macroLayers()` · `MACRO_THEME_OVERRIDE` |
| `theme.ts` | *(Legacy)* لایهٔ سازگاری برای مصرف‌کننده‌های قدیمی |
| `components/base/BaseChart.tsx` | **موتور**: چارت + بوم لایه‌ها + پنل سیگنال + لجند + Tooltip |
| `components/base/ChartFrame.tsx` | پوستهٔ بیرونی: عنوان · متادیتا · لجند · حالت‌ها (empty/error/loading) |

## ۱) تم — ظاهر کاملاً قابل‌تعویض

```tsx
<BaseChart themeName="terminal" ... />            // تم آماده
<BaseChart themeName="inflation_modern_dark" ... /> // تم خانوادگی
<BaseChart themeName="auto" ... />                 // هم‌راستا با روشن/تیرهٔ سایت
<BaseChart theme={{ slots: { headline: "#ff0" } }} ... />   // override جزئی
```
تم‌های ثبت‌شده: `light` · `dark` · `terminal` · `print` · `inflation_modern_dark` · `inflation_modern_light` · **`shahrivar`** (قالب رسمی تورم) · **`default_chart`** (آرشیو ظاهر پیشین)

### قالب رسمی «شهریور»
```tsx
<BaseChart themeName="shahrivar" … />   // نوار سبز هدف + ۶ سیگنال شفاف/هم‌اندازه + زوم ۵ساله
<BaseChart themeName="default_chart" … /> // بازگشت به ظاهر پیشین (آرشیو)
```
- چارت تورم (`CpiYoyChart`) از ثابت `MACRO_TEMPLATE_THEME` (در `presets/macro.ts`) استفاده می‌کند ⇒ **سوئیچ ظاهر فقط با تغییر themeName**.
- قالب‌ها: `lib/chart/themes/shahrivar/` و `lib/chart/themes/default_chart/` (هردو spec مستقل روی پایهٔ `dark`).

اسلات‌های رنگی (همه در تم تزریق می‌شوند):
`headline · core · annualized3m · target · targetBand · recession · projection · shock · eventHigh/Medium/Low · signalPos/Neg/Warn/Info/Neutral · badgeBg · badgeBorder`
سری از `colorKey` (نام اسلات) یا `color` (صریح) رنگ می‌گیرد.

### تم خانوادگی = قالب سبک + رجیستری
نویسندهٔ تم فقط **spec** می‌نویسد؛ ارث‌بری/نرمال‌سازی/اعتبارسنجی در `themeSpec.ts` + `themePresets.ts`:

```ts
// lib/chart/themes/my_theme/index.ts
export const MY_THEME_DARK: ChartThemeSpec = {
  name: "my_theme_dark", family: "my_theme", mode: "dark", base: "dark",
  palette: { headline: "#3b82f6", series: ["#3b82f6", "#facc15"] }, // بقیه از base
  layout: { zoom: "2Y", scaleMargins: { top: 0.05, bottom: 0.1 } },
  signals: { ids: ["trend", "pressure"], style: { transparent: true, uniform: true,
             background: "slot:badgeBg", border: "slot:badgeBorder" } },
  meta: { manifest: { name: "my_theme", version: "1.0.0",
                      description_key: "themeNames.my_theme.description" } },
};
```
سپس فقط یک ورودی در `THEME_REGISTRY` (themePresets.ts). جزئیات: **`THEME_AUTHORING.md`**.

**تقدم (همیشه از چپ به راست):** `DEFAULT_LAYOUT` → `layout تم` → `layout دامنه (props)`
همین قاعده برای سیگنال‌ها: `signals تم` → `signals دامنه` (و `style` به‌صورت کلید‌به‌کلید ادغام می‌شود).

**اعتبارسنجی dev:** نام‌گذاری · کامل‌بودن پالت پس از ارث‌بری · وجود `signal id`ها · بازهٔ `scaleMargins` · متادیتا ⇒ هشدار در کنسول (`[chart-theme:<name>]`)، نه خرابیِ بی‌صدا.

## ۲) چینش و زوم

```ts
{ zoom: "5Y", legend: "top-left", signals: "bottom-right",
  grid: { vert: false, horz: true },
  priceScale: { visible: true, top: 0.1, bottom: 0.1, mode: "normal" },
  timeScale: { timeVisible: false, rightOffset: 3, barSpacing: 6 },
  crosshair: { mode: "normal", dashed: true } }
```
زوم: `1M · 3M · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · MAX · fit` یا بازهٔ صریح `{from, to}`.
> ⚠️ `padding` **منسوخ** است و اثری ندارد؛ حاشیهٔ عمودی مقیاس از `priceScale.top/bottom`
> (یا میانبر `scaleMargins: {top,bottom}` در تم — بازهٔ ۰..۰٫۵) می‌آید.

### استایل سیگنال‌ها (قابل تزریق)
```tsx
signals={{ ids: ["trend","pressure"], max: 4,
           style: { transparent: true, uniform: true, fontSize: 10,
                    background: "slot:badgeBg", border: "slot:badgeBorder" } }}
```
- `transparent` → پنل بدون پس‌زمینهٔ سطح · `uniform` → بج‌های هم‌اندازه و تراز
- `background`/`border` رنگ صریح (`#hex`) یا ارجاع اسلات (`slot:<name>`) می‌پذیرند

## ۳) سیگنال‌ها (کتابخانه + سفارشی)

| id | معنا |
|---|---|
| `trend` | جهت روند (شیب ۳/۶ دوره) |
| `momentum` | تغییر ۱ و ۳ دوره |
| `deviation` | فاصله از میانگین ۱۲دوره (σ) |
| `volatility` | σ گام‌ها + هشدار جهش |
| `pressure` | فشار ۰..۱۰۰ (z + شیب) |
| `divergence` | اختلاف Core − Headline |
| `reversal` | احتمال بازگشت ۰..۹۵٪ (هیوریستیک مستند) |
| `stability` | پایداری ۰..۱۰۰ |
| `iss` | **ISS** — سیگنال جامع تورمی: رنگ (سالم/هشدار/پرخطر/خطرناک) + فلش جامع + درصد پایداری |

### بج ISS: رنگ وضعیت در پس‌زمینه + رنگ جهت در متن

| لایه | منبع رنگ | معنا |
|---|---|---|
| **پس‌زمینه** | `tone` (۴ سطح) با آلفای `statusTint` **روی پایهٔ `badgeBg`** | وضعیت کلی تورم: سبز سالم · زرد هشدار · نارنجی پرخطر · قرمز خطرناک |
| **حاشیه** | همان رنگ با آلفای `+۰٫۲۵` | «هاله»/لبهٔ واضح رنگ وضعیت |
| **متن مقدار** | `valueTone` → اسلات‌های **جهت**: `valueUp`/`valueDown`/`valueFlat` | فقط **سه حالت**: سبز `#22c55e` · قرمز `#ff3b30` · سفید `#e2e8f0` (مثل منطق روند) |
| **صفحهٔ زیرین متن** | `valuePlate` (شهریور **۰٫۷۵**) | متن را «جلوتر» می‌آورد تا رنگش با هیوی وضعیت مخلوط نشود |
| **برچسب (Iss)** | `textMuted` تم | خوانا روی هر حاله |

- `fill: true` روی سیگنال ⇒ پس‌زمینه از رنگ وضعیت ساخته می‌شود
  (`linear-gradient(rgba(tone,α), rgba(tone,α)), <badgeBg>`)؛ بقیهٔ بج‌ها همان
  پایهٔ شفاف را دارند ⇒ خانوادهٔ بج‌ها نمی‌شکند.
- `statusTint` در `signals.style` شدت حاله را تعیین می‌کند (پیش‌فرض و شهریور: **۰٫۳۵**).
  کمتر = ملایم‌تر و متن پررنگ‌تر (مثلاً ۰٫۲۵) · بیشتر = پررنگ‌تر (۰٫۵).
- **حلقه (حاشیه)** با آلفای `tint + ۰٫۵` (≈۰٫۸۵) رسم می‌شود ⇒ **رنگ خالص وضعیت** در لبه
  خوانده می‌شود؛ همین حلقه است که «زرد» را از «نارنجی» و «نارنجی» را از «قرمز» جدا می‌کند.
- **نردبان رنگ وضعیت (شهریور):** سبز `#22c55e` → زرد لیمویی `#fde047` (hue 50) →
  نارنجی عمیق `#ea580c` (hue 21) → سرخابی `#f43f5e` (hue 350).
  ΔE (CIE76) روی پس‌زمینهٔ مؤثر: زرد↔نارنجی **۲۸٫۱** · نارنجی↔قرمز **۲۱٫۷**
  (قبل از تغییر قرمز: ۱۵٫۲).
- **صفحهٔ زیرین متن (`valuePlate`، شهریور **۰٫۷۵**):** متن مقدار روی یک سطح تیرهٔ ملایم
  هم‌سو با کارت می‌نشیند («جلوتر آوردن متن») ⇒ رنگ متن **مطلق** می‌ماند: سبز `#22c55e` ·
  قرمز `#ff3b30` · سفید `#e2e8f0` روی **هر چهار** پس‌زمینهٔ وضعیت بدون تغییر (ΔE≈۰) با
  کنتراست AA. `adaptivePlate` (پیش‌فرض روشن) عمق را با روشنایی تگ حداکثر تا ۰٫۸ تنظیم
  می‌کند. ⚠️ تجربه: با صفحهٔ کم‌آلفا (۰٫۴) قرمز روی تگ زرد به نارنجی میل می‌کند.
- **رنگ متن جهت (سه حالت · مستقل از نردبان وضعیت):** اسلات‌های `valueUp`/`valueDown`/`valueFlat`
  در پالت تم — تا ISS هرگز قرمز را به صورتی/نارنجی روشن نکند.
- **کنتراست متن:** مقدار با هدف **۴٫۵ (AA)** و برچسب ۴٫۰ روی «سطح مؤثر» سنجیده می‌شود.
- **هالهٔ نور متن** (`textShadow: 0 0 6px <رنگ خالص جهت>@۰٫۵۵`) ⇒ حتی اگر متن برای
  کنتراست روشن‌تر شود، رنگ‌مایهٔ جهت در هاله دیده می‌شود.
- `valueTone` رنگ **متن مقدار** را جدا از رنگ وضعیت می‌کند؛ ISS آن را از منطق روند می‌گیرد.
- **خوانایی:** متن مقدار و برچسب با `ensureContrast` (حد کنتراست ۳٫۵) روی پس‌زمینهٔ
  مؤثر تنظیم می‌شوند؛ فقط روشناییِ همان رنگ‌مایه تغییر می‌کند تا در تم تیره و
  روشن/سفید هم نام سیگنال خوانا بماند (`lib/chart/colorMath.ts`).

فلش ISS از چهار مؤلفه ساخته می‌شود (`display` = فلش + درصد، همراه برچسب `Iss` مثل بقیهٔ سیگنال‌ها):

| مؤلفه | ورودی | خروجی بصری |
|---|---|---|
| جهت | Δ1 و Δ3 | بالا ↑/↗ · پایین ↓/↘ · افقی → |
| زاویه | شدت مومنتوم (نسبت به σ گام‌ها) | عمودی (قوی) · مورب (ضعیف) |
| تعداد | شدت شیب: میانگین \|slope3\| و \|slope6\| | ۱ · ۲ · ۳ فلش |
| ضخامت (فشار) | نوسان (CV گام) + \|z\| + شکاف Core−Head | `weight` ۱ نازک · ۲ متوسط · ۳ ضخیم (→ وزن فونت) |

- **درصد** = پایداری روند: `0.6×stability + 0.4×(100 − reversal)` — ۱۰۰ = پایدار و قابل‌اعتماد.
- **رنگ** = وضعیت کلی تورم (۴ سطح): `pos` سبز سالم · `warn` زرد هشدار · `risk` نارنجی پرخطر · `neg` قرمز خطرناک.
  قاعده: فاصلهٔ فراتر از دامنهٔ هدف ⇒ `≤۰٫۵pp` سالم · `≤۱٫۵pp` هشدار · `≤۳pp` پرخطر · `>۳pp` خطرناک؛
  و اگر فشار ≥۰٫۶۷ یا احتمال بازگشت ≥۶۰٪ باشد یک پله ارتقا می‌گیرد. بدون هدف: برش‌های |z| = ۰٫۷۵/۱٫۵/۲٫۲۵.
  دامنهٔ هدف از `signals={{ target: { low, high } }}` می‌آید.
- **جای نمایش**: مثل بقیهٔ سیگنال‌ها، داخل پنل سیگنال‌ها (`layout.signals`) و با همان
  اندازهٔ باکس (`uniform`) — در قالب شهریور **اول لیست** (`ids: ["iss", …]`) یعنی سمت چپ چارت.
- ضخامت فلش (`weight`) روی «مقدار» اعمال می‌شود (برچسب مانند بقیه ثابت می‌ماند).
- نمونهٔ خروجی بج: `Iss  ↘↘ 39%` (رنگ/ضخامت بر پایهٔ وضعیت و فشار تورم).

### قواعد رنگ هر سیگنال (چرا این رنگ؟)

| سیگنال | مبنا | رنگ |
|---|---|---|
| `trend` / `momentum` | حرکت Δ1/Δ3 **نسبت به دامنهٔ هدف** | بالای هدف: نزول سبز · صعود قرمز — زیر هدف: صعود سبز · نزول قرمز — داخل هدف: خاکستری |
| `trend` / `momentum` (بدون هدف) | `bias` دامنه | `up-is-bad` (تورم): صعود قرمز · نزول سبز |
| `deviation` / `divergence` | «بالا = نامطلوب» با `bias` | z>+0.5σ قرمز (بالای میانگین) · z<−0.5σ سبز |
| `volatility` | σ(Δ12)/σ(Δall) | `>1.3` ⇒ ⚠ + زرد (هم‌آستانه با نشانگر) · وگرنه آبی |
| `pressure` | ۰..۱۰۰ | `>65` زرد · `<35` آبی · بین ⇒ خاکستری |
| `stability` | ۰..۱۰۰ | `>65` سبز (پایدار) · `<35` قرمز (پرنوسان) |
| `iss` | فاصله از دامنهٔ هدف + فشار/بازگشت | سبز سالم · زرد هشدار · نارنجی پرخطر · قرمز خطرناک |

> 🔑 **دقت معنایی:** رنگ `trend`/`momentum` به **دامنهٔ هدف** نگاه می‌کند؛ پس تورم
> نزولیِ **زیر** هدف (ریسک رکود) قرمز است، در حالی که همان نزول **بالای** هدف سبز است.
> دامنه و قرارداد از دامنه تزریق می‌شوند: `signals={{ target, bias }}`.

```tsx
signals={{ ids: ["trend","divergence"], custom: [mySignal], slot: "top-right", max: 5 }}
```
افزودن سیگنال جدید = یک entry در `SIGNAL_LIBRARY` (بدون تغییر چارت).

## ۴) لایه‌های بصری (روشن/خاموش مستقل)

| id | نقاشی |
|---|---|
| `target-band` | نوار هدف + دو خط چین |
| `recession` | سایهٔ بازه‌های رکود |
| `event-markers` | خط عمودی + مثلث + برچسب رویداد |
| `projection` | ناحیهٔ پیش‌بینی + خط چین مقدار/سری |
| `shock-indicators` | دایره روی نقاط شوک |
| `custom` | تابع `paint(ctx, layer)` از دامنه |

```tsx
layers={macroLayers({ target: { low: 1, high: 3 }, events, recessions, projection, shocks })}
```
هر لایه `enabled: false` دارد ⇒ بدون حذف داده، خاموش می‌شود.

> ⚠️ **مقیاس قیمت و باند هدف:** مقیاس به‌صورت خودکار از دادهٔ سری ساخته می‌شود، پس
> هدفِ بیرون از دامنهٔ داده (مثل تورم چین ‎-۰٫۸..۱٫۳ با هدف ۳٪) پیش‌تر **دیده
> نمی‌شد**. حالا `BaseChart` از `expandRangeForTarget()` استفاده می‌کند و باند هدف را
> (تا `max(0.5, 1.5×span)` فراتر از داده) در مقیاس می‌گنجاند؛ دورتر از آن (مثل تورم
> ۱۰۰٪ با هدف ۲٪) چارت فشرده نمی‌شود و مقدار هدف از لجند خوانده می‌شود.

## ۵) افزودن دامنهٔ جدید (بدون کدنویسی چارت)

```tsx
// 1) داده را به شکل واحد تبدیل کن (هر دامنه‌ای)
const data = [ makeCandleSeries(fromOhlc(bars), { id: "BTCUSDT", colorKey: "headline" }) ];

// 2) یک preset بساز (تم/چینش/سیگنال/لایه)
<BaseChart
  data={data}
  themeName="terminal"
  layout={{ zoom: "3M", signals: "top-right", grid: { vert: false, horz: true } }}
  signals={{ ids: ["trend", "volatility", "momentum"] }}
  layers={[{ id: "shock-indicators", points: shocks }]}
  priceFormat="currency"
/>
```

## ۶) مشاهدهٔ چشمی
`/dashboard/chart-lab` — تعویض تم · زوم · سیگنال · لایه به‌صورت زنده روی دادهٔ نمونه.

---

## ۷) قاعدهٔ سند فنی هر چارت/کامپوننت (اجباری)

هر چارت یا کامپوننتی که با هم تکمیل می‌کنیم، **در پایان کار** (وقتی نواقص رفع و نسخهٔ بهینه
تثبیت شد) یک سند فنی فارسی می‌گیرد که **هم‌نام خودِ کامپوننت** و **کنار همان فایل** است:

```
frontend/components/domain/<domain>/<ComponentName>.tsx
frontend/components/domain/<domain>/<ComponentName>.md    ← سند فنی
```

سند باید این‌ها را پوشش دهد:

1. **منبع و جریان داده:** اندپوینت‌ها/پارامترها، قواعد انتخاب سری، فراخوانی‌های ادغام‌شده.
2. **نحوهٔ محاسبه:** هر عدد/سیگنال با فرمول و **آستانه‌های دقیق** (نه «تقریباً»).
3. **نام کامل سیگنال‌ها/شاخص‌ها** + متن نمایشی + tooltip.
4. **رنگ‌بندی و منطق پشت هر رنگ** (چرا سبز/زرد/نارنجی/قرمز) + اعداد سنجیده‌شده (کنتراست/ΔE).
5. **گارانتی‌ها (Invariants)** و **محدودیت‌های شناخته‌شده** (صادقانه).
6. **قلاب‌های تنظیم:** «برای تغییر X کجا را دست بزنم؟».
7. **نشانگرهای دیباگ/DOM** و دستورهای بررسی سریع.
8. **تاریخچهٔ تصمیم‌ها** — به‌خصوص تجربه‌های منفی («این کار را نکنید چون…»).

نمونهٔ مرجع: `frontend/components/domain/macro/CpiYoyChart.md` (چارت تورم با قالب شهریور).

---

## ۸) باگ‌های رفع‌شدهٔ مهم (مراقب بازگشتشان باشید)

| تاریخ | باگ | ریشه و راه‌حل |
|---|---|---|
| 2026-09-22 | **tooltip همهٔ خطوط یک مقدار نشان می‌داد** | در هندلر crosshair مقدار از `seriesMapRef` (نقشهٔ «مقیاس قیمت → **اولین** سری») خوانده می‌شد ⇒ همهٔ خطوط مقدار سری اول را می‌گرفتند. حالا با `seriesByIdRef.get(s.id)` **از خودِ سری** خوانده می‌شود. |
| 2026-09-22 | **جای نادرست خطوط نسبت به محور Y** (ادراک کاربر) | نتیجهٔ همان باگ tooltip بود: مقدار نمایش‌داده‌شده با ارتفاع خط نمی‌خواند. `priceScale.mode` و `priceFormat` بررسی و سالم بودند. |
| 2026-09-22 | **رنگ متن سیگنال‌های چهارسطحی (PAS) سفید می‌شد** | نگاشت `valueTone → slots` فقط سه حالت (pos/neg/neutral) را می‌پوشاند ⇒ `warn/risk` به `valueFlat` می‌افتادند. حالا `VALUE_SLOT` چهارسطحی است (`signalWarn/signalRisk` هم نگاشت دارند). |
| 2026-09-22 | **باند هدف بیرون از مقیاس دیده نمی‌شد** | `expandRangeForTarget()` + `autoscaleInfoProvider` روی سری‌های مقیاس راست. |
| 2026-09-22 | **صفحه ۵۰۰ شد: `Cannot read properties of undefined (reading 'zoom')`** | `getThemePreset()` یک تم **resolve‌شده** برمی‌گرداند و `layout` در ران‌تایم روی آن نیست (تایپ اجازه می‌داد ⇒ `tsc` پاس شد ولی رندر شکست) ⇒ قاعده: **چیدمان را از تم نخوانید**؛ کامپوننت مقادیر لازمش را صریح به `BaseChart.layout` بدهد (الگو: `GROWTH_CHART_LAYOUT` در `GrowthChart`). |
| 2026-09-22 | **`futureMargin` میله‌محور است، نه زمان‌محور** | `timeScale().scrollToPosition(n)` روی **تعداد میله** کار می‌کند ⇒ ۱۲ برا ی دادهٔ **فصلی** = ۳ سال فضای خالی (نه یک سال). برای چارت فصلی `4` و برای ماهانه `12` (الگو: `CpiYoyChart` روی `effectiveFreq`، و `GrowthChart` مقدار ثابت ۴). |
| 2026-09-23 | **صفحه ۵۰۰ + کرش Turbopack: پاس‌دادن تابع به Client Component** | طبق Next نمی‌توان **تابع** را از Server Component به Client Component پاس داد (`Functions cannot be passed directly to Client Components`) ⇒ اولین نسخهٔ v3 که `hintText` (تابع i18n) را پاس می‌داد صفحه را ۵۰۰ کرد و خطای نمایش‌داده‌شده (متن فارسی) هایلایتر Rust توربوپک را روی مرز کاراکتر چندبایتی پنیک کرد و سرور dev را کشت. راه‌حل نهایی: پاس‌دادن **دادهٔ سریالایزپذیر** (`signalHints` = قالب‌های `messages.macro.signals`) و جای‌گذاری پارامتر روی کلاینت با `resolveHint()` در `lib/chart/spec/hints.ts`. |
---

## ۹) قاعدهٔ رنگ سری‌ها (سیاست ثابت · 2026-09-22)

**زبان رنگی:** در هر چارت، **سری اصلی** رنگ یکتا و اشباع می‌گیرد و **سری‌های کمکی**
آبی / خاکستری نقطه‌چین / رنگ‌های خنثی‌اند تا «در فرع کار» بمانند. رنگ‌ها **فقط** در
`colors.ts` تم تعریف می‌شوند؛ هیچ رنگی در کامپوننت هاردکد نمی‌شود (سری‌ها `colorKey`
صدا می‌زنند).

| چارت | سری اصلی (یکتا) | سری کمکی |
|---|---|---|
| تورم (`shahrivar`) | Headline = **قرمز `#ef4444`** | Core = آبی `#3b82f6` · 3M = خاکستری نقطه‌چین `rgba(148,163,184,0.75)` |
| نرخ بهره vs تورم (`shahrivar_policy`) | Policy Rate = **زرد کهربایی `#facc15`** | Headline CPI = آبی `#3b82f6` |
| رشد اقتصادی (`shahrivar_growth`) | GDP YoY = **سبز فسفری `#a3e635`** | QoQ SAAR = آبی `#3b82f6` · روند ۴فصلی = خاکستری نقطه‌چین |
| شرایط مالی (`shahrivar_financial`) | FCI = **آبی درخشان `#38bdf8`** | 10Y کشوری = آبی `#3b82f6` (مقیاس کمکی مخفی) |
| هر چهار | به‌ترتیب بالا | سیگنال‌ها = نردبان وضعیت/جهت `signal*` و `valueUp/Down/Flat` |

- **قرمز = زبان مشترک تورم کل (Headline CPI)** در چارت تورمی (سری اصلی آن چارت).
- در چارت نرخ بهره، CPI **سری کمکی** است ⇒ آبی (عیناً درخواست کاربر).
- هیچ رنگ سری، همرنگ بج‌های سیگنال نیست ⇒ سیگنال‌ها همیشه خوانا می‌مانند.
- آمبر `#facc15` روی کارت تیره `#111826` کنتراست ≈ ۱۱:۱ ⇒ کاملاً خوانا.

---

## ۱۰) سیگنال‌های چندسری چارت‌های دامنه (الگوی `custom`)

سیگنال‌هایی که **سری‌شان داخل همان چارت رسم نمی‌شود** (مثل «نرخ بهرهٔ واقعی» =
نرخ سیاستی − تورم کل، یا «بازدهی ۱۰ساله») در کتابخانهٔ موتور ساخته نمی‌شوند؛
**در دامنه** ساخته و با `signals.custom` تزریق می‌شوند.

| نمونه | محل ساخت | چارت |
|---|---|---|
| `Pas` · `Real` · `Yld` · `Rmi` · `Im` · `Gap` · `Prf` | `lib/macro/policy.ts` + `lib/macro/macroSignals.ts` | Policy Rate vs CPI |
| `Gas` · `GMI` · `OGI` · `GSI` · `PMI` · `NOW` · `GAPg` | `lib/macro/growth.ts` | GDP Growth |
| `Fas` · `Y10` · `Credit` · `DXY` · `Equity` · `Liquidity` · `Vol` | `lib/macro/financial.ts` | Financial Conditions |

**قواعد ثابت (تجربهٔ 2026-09-22):**

- **ترتیب نمایش** = ترتیب آرایهٔ `custom`؛ `signals.max` در تم باید ≥ تعداد سیگنال‌ها باشد.
- **ترتیب آرایهٔ `ids` تم** = ترتیب سیگنال‌های کتابخانه (`shahrivar`: ISS اول).
- **آستانه/تُن رنگ** یک منبع مشترک: `lib/chart/signals.ts`
  (`REAL_RATE_BANDS` · `YIELD_10Y_BANDS` · `realRateTone` · `yield10yTone`).
- **بدون داده ⇒ بدون بج:** سیگنالِ `null` حذف می‌شود؛ **مقدار ساختگی/صفر ممنوع**.
- **نمایش «بدون داده» استاندارد شد** (`noDataSignal`): مقدار `—` · رنگ سفید خنثی ·
  بدون فلش · بدون شدت · برچسب بسته به زمینه (`Yld` ⇒ `N/A` طبق درخواست کاربر؛
  `PMI`/`NOW` ⇒ برچسب خودشان می‌ماند تا جای سیگنال در سطر مشخص باشد).
- ⚠️ **canon سری در `indicator.code` است، نه در `id`** — مثال واقعی:
  `FRED_USA_DGS10_M` با canon=`YIELD_10Y`. تطبیق روی `id` سری را پیدا نمی‌کند.
- ⚠️ **کد provider هم لازم است:** تطبیقِ سری باید با **هر سه هویت** انجام شود
  (`indicator.code` · `indicator.provider_code` · `id`)؛ مثال واقعی:
  `FRED_USA_VIXCLS_M` که canonش `MARKET_GLOBAL` است ⇒ تطبیق فقط با canon،
  سیگنال `Vol` را بی‌داده (`N/A`) نشان می‌داد.
- ⚠️ **گارد کهنگی:** سری‌ای که آخرین نقطه‌اش > ۱۸ ماه عقب‌تر از مرجع است
  «دادهٔ مُرده» است (`latestOfCanon`) و رسم نمی‌شود.
- ظاهر سیگنال‌های کمکی: **بدون پس‌زمینه، بدون فلش، بدون شدت** ⇒ `fill`/`weight`
  تنظیم نمی‌شود و رنگ متن از `valueTone` (نردبان چهارسطحی) می‌آید.
