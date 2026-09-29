# 🎨 THEME_AUTHORING — استاندارد ساخت تم چارت

> راهنمای یک‌صفحه‌ای برای افزودن تم جدید به موتور چارت (`BaseChart`).
> قراردادها در `lib/chart/types.ts` · نرمال‌سازی/اعتبارسنجی در `lib/chart/themeSpec.ts`
> · رجیستری در `lib/chart/themePresets.ts`.

## ۱) قانون طلایی
هیچ رنگ/فونت/زوم/سیگنال/متنی داخل چارت یا داخل پوشهٔ تم **هاردکد** نمی‌شود:
- **رنگ/فونت** → `palette`
- **چینش/زوم** → `layout`
- **سیگنال** → `signals` (`ids` + `style`)
- **متن کاربری** → **فقط** کلید i18n (در `messages/themeNames.<locale>.json`)
- **نسخه/نویسنده** → `manifest.json`

## ۲) ساختار پوشه
```
lib/chart/themes/<family>/
  ├── index.ts        # spec(s): base/palette/layout/signals/meta
  ├── colors.dark.ts  # ChartThemePaletteInput
  ├── colors.light.ts # ChartThemePaletteInput
  ├── layout.ts       # ChartLayoutSpec
  ├── signals.ts      # ChartSignalsSpec (ids + style)
  └── manifest.json   # version/author/created/description_key
```
سریع‌ترین راه: پوشهٔ `lib/chart/themes/_template/` را کپی کنید.

## ۳) نام‌گذاری
- نام تم: `<family>_<mode>` → `inflation_modern_dark` · `inflation_modern_light`
- `family` و `mode` را در spec بدهید (انتخاب‌گر خانواده/حالت در آینده + `themeName="auto"`).
- نام با `-` یا CamelCase ممنوع (اعتبارسنج هشدار می‌دهد).

## ۴) قالب رنگ (`ChartThemePaletteInput`)
همه‌چیز اختیاری است و از `base` ارث می‌رسد؛ فقط چیزهایی که فرق دارد بنویسید.
```ts
export default {
  // معنایی (به اسلات‌های تم گسترش می‌یابد)
  headline: "#3b82f6", core: "#facc15", annualized3m: "rgba(100,255,100,0.4)",
  targetBand: "rgba(74,222,128,0.14)", projection: "#a78bfa",
  signalPos: "#22c55e", signalWarn: "#eab308", signalRisk: "#fb923c", signalNeg: "#ef4444",
  badgeBg: "rgba(255,255,255,0.08)", badgeBorder: "rgba(255,255,255,0.15)",
  // چندسری
  series: ["#3b82f6", "#facc15", "#4ade80"],
} satisfies import("../../types").ChartThemePaletteInput;
```
نگاشت خودکار (`themeSpec.normalizePaletteInput`):
| ورودی | نتیجه |
|---|---|
| کلیدهای پالت (`background`/`text`/`grid`/`pos`/…) | `palette.*` |
| `series: string[]` | `palette.series` |
| `series: { headline, core, … }` | `slots.headline/core/…` |
| `targetBand` و هر کلید معنایی | `slots.<key>` |
| `slots: {...}` | `slots` (اولویت نهایی) |

⚠️ رنگ معنایی **جدید** = افزودن یک کلید اختیاری به `ChartThemePaletteInput`
(تا خطای کامپایل جای خرابیِ بی‌صدای «اسلات تعریف‌نشده» را بگیرد).

## ۵) چینش (`ChartLayoutSpec`)
Partial است و روی `DEFAULT_LAYOUT` می‌نشیند. میانبر `scaleMargins` (۰..۰٫۵) به
`priceScale.top/bottom` نگاشت می‌شود:
```ts
export default {
  zoom: "2Y", signals: "bottom-right", legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
  grid: { vert: false, horz: true },
} satisfies import("../../types").ChartLayoutSpec;
```
> `padding` **منسوخ** است (در LWC اثری ندارد) — از `scaleMargins` استفاده کنید.
> تقدم نهایی: `DEFAULT_LAYOUT` → `layout تم` → `layout دامنه (props)`.

## ۶) سیگنال‌ها
شناسه‌های مجاز (`SIGNAL_LIBRARY`): `trend · momentum · deviation · volatility ·
pressure · divergence · reversal · stability · iss`. شناسهٔ ناموجود **بی‌صدا حذف می‌شود**،
پس اعتبارسنج dev هشدار می‌دهد.
```ts
export default {
  ids: ["trend", "pressure", "divergence", "stability"],
  max: 4,
  style: { transparent: true, uniform: true, fontSize: 10,
           background: "slot:badgeBg", border: "slot:badgeBorder" },
} satisfies import("../../types").ChartSignalsSpec;
```
- `background`/`border` رنگ صریح یا ارجاع اسلات می‌پذیرند: `"slot:badgeBg"`.
- `transparent` → پنل بدون پس‌زمینه · `uniform` → بج‌های هم‌اندازه/تراز مقدارها.
- props دامنه (`signals={{…}}`) همیشه بر تم اولویت دارد.

### سیگنال جامع ISS در تم
ترتیب نمایش = ترتیب `ids`؛ ISS را اول بگذارید تا **سمت چپ** و پیش از بقیه بیاید:
```ts
export default {
  ids: ["iss", "trend", "momentum", "deviation", "volatility", "pressure", "stability"],
  max: 7,
  style: { transparent: true, uniform: true, fontSize: 10, background: "slot:badgeBg" },
} satisfies import("../../types").ChartSignalsSpec;
```
- `weight: 1|2|3` روی سیگنال → ضخامت **مقدار** (وزن فونت ۴۰۰/۶۰۰/۸۰۰)؛ برچسب ثابت می‌ماند.
- `uniform: true` ⇒ همان اندازهٔ باکس بقیهٔ سیگنال‌ها (یک‌خطی، بدون شکستن).
- **بج وضعیت (مثل ISS):** `fill: true` روی سیگنال ⇒ پس‌زمینه از رنگ `tone` ساخته
  می‌شود با آلفای `style.statusTint` (پیش‌فرض ۰٫۳۵) **روی همان `badgeBg` بقیهٔ بج‌ها**؛
  **حلقه** (حاشیه) همان رنگ با آلفای `tint+0.5` است ⇒ رنگ خالص وضعیت در لبه دیده می‌شود
  (تمایز زرد/نارنجی). `valueTone` رنگ متن مقدار را جدا می‌کند (ISS: منطق سه‌حالتهٔ روند).
  متن مقدار با هدف کنتراست **۴٫۵ (AA)** و برچسب ۴٫۰ اصلاح می‌شود؛ به‌علاوه متن روی
  **صفحهٔ زیرین ملایم** (`style.valuePlate`، پیش‌فرض ۰٫۳۵) می‌نشیند تا رنگش با هیوی
  پس‌زمینه مخلوط نشود («جلوتر آوردن متن») + هالهٔ نور هم‌رنگ جهت (`textShadow`).
- **قواعد رنگ** (وابسته به دادهٔ دامنه، نه تم):
  `trend`/`momentum` آگاه به **دامنهٔ هدف** رنگ می‌گیرند (بالای هدف: نزول سبز/صعود قرمز ·
  زیر هدف: صعود سبز/نزول قرمز · داخل هدف: خاکستری)؛ بدون هدف، قرارداد `bias` تعیین می‌کند.
  `stability` بالا = سبز · `pressure` بالا = زرد · `volatility` با ⚠ = زرد · `ISS` ۴ سطح وضعیت.
- رنگ‌های ۴ سطحی وضعیت تورمی از اسلات‌های پالت می‌آید: `signalPos · signalWarn · signalRisk · signalNeg`.
- برای معنای دقیق «مخاطره»، دامنه می‌تواند هدف را تزریق کند: `signals={{ target: { low, high } }}`
  (فاصله از دامنهٔ هدف = معیار اصلی سطح رنگ؛ فشار/بازگشت بالا یک پله ارتقا می‌دهد).

## ۷) ثبت تم (۳ خط)
```ts
// lib/chart/themePresets.ts
import { MY_THEME_DARK, MY_THEME_LIGHT } from "./themes/my_theme";
export const THEME_REGISTRY: Record<string, ChartThemeSpec> = {
  ...BASE_SPECS,
  my_theme_dark: MY_THEME_DARK,
  my_theme_light: MY_THEME_LIGHT,
};
```
- `CHART_THEME_PRESETS` / `CHART_THEME_NAMES` خودکار به‌روز می‌شوند.
- استفاده: `<BaseChart themeName="my_theme_dark" … />` یا `themeName="auto"`.

## ۸) i18n (الزامی)
کلیدها را به **همهٔ** locales اضافه کنید (`LOCALES` در `lib/constants.ts`):
```json
// messages/themeNames.en.json
{ "my_theme_dark": "My Theme — Dark",
  "my_theme": { "description": "…" } }
```
و `manifest.json`: `"description_key": "themeNames.my_theme.description"`.

## ۹) چک‌لیست پیش از commit
1. `npm run typecheck` = 0 خطا · `npm run lint` = 0 خطا
2. کنسول dev هیچ `[chart-theme:<name>]` نشان نمی‌دهد (هشدارهای اعتبارسنج)
3. نام‌گذاری `<family>_<mode>` · `family`/`mode` در spec
4. کلید i18n برای **همهٔ** تم‌ها در **همهٔ** locales
5. رنگ‌های معنایی در `ChartThemePaletteInput` تعریف شده‌اند
6. `manifest.version` و `description_key` پر است
7. تم را در `/dashboard/chart-lab` چشمی بررسی کنید (زوم/سایه/بج/نوار هدف)
8. هیچ متنی داخل فایل‌های تم نیست (فقط رنگ/عدد/شناسه)

## ۱۰) نسخه‌گذاری/آرشیو
- `version` را با هر تغییر ظاهری تم بالا ببرید (SemVer).
- تغییرات شکنندهٔ قرارداد (`ChartThemePaletteInput`/`ChartLayoutSpec`) = تغییر مینور در manifest خودشان.
- آرشیو تم قدیمی: پوشه را به `themes/_archive/<family>/` منتقل کنید و از `THEME_REGISTRY` بردارید
  (کد تم‌های آرشیوی دیگر باندل نمی‌شود).
