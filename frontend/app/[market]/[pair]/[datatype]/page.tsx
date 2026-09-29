/**
 * Market Chart — چارت‌های چندبازاری (ساختار استاندارد و آینده‌پذیر ✓)
 * frontend/app/[market]/[pair]/[datatype]/page.tsx
 * ============================================================
 * **مسیر:** `/{market}/{pair}/{datatype}`
 *   · سطح ۱ `market`  = یکی از `MARKETS` ✓: crypto · macro · forex · commodities · indices
 *   · سطح ۲ `pair`    = نماد ✓: BTCUSDT · XAUUSD · SPX · EURUSD · USOIL …
 *   · سطح ۳ `datatype`= نوع داده ✓: candles · heatmap · liquidations · depth · delta ·
 *                        oi · trades · orderbook · realtime · simulated · aggregated
 * مثال‌ها: `/crypto/BTCUSDT/candles` (فعال ✓) · `/crypto/BTCUSDT/heatmap` (به‌زودی ✓) ·
 *          `/macro/XAUUSD/candles` · `/indices/SPX/candles` · `/forex/EURUSD/candles` ✓
 * ⛔ رفتار چارت دست‌نخورده: پریست/داده/تم/دروازهٔ چارت/کش نما همه همان است ✓.
 * سازگاری: `/dashboard/historical/crypto` ⇒ ریدایرکت به `/crypto/<pair>/candles` ✓
 * (و `/crypto/{pair}/chart/{type}` فقط یک گذرِ کوتاه بود و حذف شد ✗).
 */
import { notFound } from "next/navigation";
import { getTranslations, getLocale, getMessages } from "next-intl/server";
import { CandleChart, HIST_TEMPLATE_THEME, type CandleWarning } from "@/components/domain/historical/CandleChart";
import { fetchHistoricalCandles } from "@/lib/server/historical";
import { alSelfTestSummary } from "@/lib/analysis/indicators/selftest";
import {
  HISTORICAL_API_PORT,
  HISTORICAL_ASSETS,
  HISTORICAL_DEFAULTS,
  HISTORICAL_TIMEFRAMES,
  HISTORICAL_VENUES,
} from "@/lib/historical/services";
/** C3 — تازه‌سازی زندهٔ diff (Client Component سبک؛ بدون DOM) */
import { HistoricalLivePoller } from "@/components/domain/historical/HistoricalLivePoller";
/** P3-b — پروفایل‌ها (منبع حقیقت واحد هستهٔ V2 ✓) */
import { ControlCenter } from "@/components/domain/historical/ControlCenter";
import { MODULE_IDS, applyProfile, decodeState } from "@/components/base/engine/core/profiles";
/**
 * **P5/4-UI:** کتابخانهٔ آیتم‌ها (منبع حقیقت واحد ✓) + حل رنگ از **تم چارت** ✓
 * ⇒ رنگ پارامترها در کشو **عیناً** رنگ همان سری روی چارت است ✓ (مورد ۵ ✓).
 * ⚠️ هر دو ماژول **خالص**اند (بدون DOM/شبکه ✓) ⇒ در Server Component بی‌خطر ✓.
 */
import { itemsOf, readInstances } from "@/components/base/engine/core/library";
import { assignInstanceColors } from "@/components/base/engine/core/instanceColors";
import { getThemePreset, getThemeSpec, resolveSlot } from "@/lib/chart/themePresets";
/**
 * 🆕 **بازبینی ششم** — پنج نسخهٔ نمایشی خانوادهٔ شهریور ✓
 * (انتخاب تم از `?theme=` یا نشانه‌های سرور ✓ · همگام‌سازی دقیق در کلاینت ✓)
 */
import {
  SSR_SCREEN_CLASS,
  SSR_THEME_ID,
  classOfTheme,
  screenThemeIds,
  type ScreenClass,
} from "@/lib/chart/screenProfiles";
import { ScreenThemeSync } from "@/components/domain/historical/ScreenThemeSync";
/** TEMP-DEBUG: برچسب تشخیص اسکرین (بالای چارت ✓ — موقت ✓) */
import { ScreenBadge } from "@/components/domain/historical/ScreenBadge";

export const dynamic = "force-dynamic";

/** زوم رسمی H1: `3Y6M` (۴۲ ماه) — همان زوم چهار چارت ماکرو. */
/** C1: هیچ ثابت پنجره‌ای در کلاینت لازم نیست — سرور پنجره را می‌سازد و `meta.window` می‌دهد. */

/** بازارهای ثبت‌شده ✓ (سطح ۱) — افزودن بازار جدید = یک سطر ✓ */
const MARKETS = ["crypto", "macro", "forex", "commodities", "indices"] as const;
type MarketId = (typeof MARKETS)[number];
/** نوع دادهٔ فعال ✓ (سطح ۳) — بقیه در همین ماژول افزوده می‌شوند ✓ */
const DATATYPE_ACTIVE = "candles" as const;
/** انواع دادهٔ برنامه‌ریزی‌شده ✓ (بدون تغییر معماری ✓) */
const DATATYPES_PLANNED = [
  "heatmap",
  "liquidations",
  "depth",
  "delta",
  "oi",
  "trades",
  "orderbook",
  "realtime",
  "simulated",
  "aggregated",
] as const;

export default async function MarketChartPage({
  params,
  searchParams,
}: {
  /** `/{market}/{pair}/{datatype}` ✓ */
  params: Promise<{ market: string; pair: string; datatype: string }>;
  searchParams: Promise<{ asset?: string; venue?: string; tf?: string; pane?: string; profile?: string; theme?: string }>;
}) {
  const tm = await getTranslations("macro");
  const locale = await getLocale();
  const rawParams = await searchParams;
  const routeParams = await params;
  const marketRaw = decodeURIComponent(String(routeParams?.market ?? "")).trim().toLowerCase();
  const pairRaw = decodeURIComponent(String(routeParams?.pair ?? "")).trim().toUpperCase();
  const datatypeRaw = String(routeParams?.datatype ?? "").trim().toLowerCase();

  /** بازار ناشناخته ⇒ ۴۰۴ تمیز ✓ (مسیر بی‌معنا، نه صفحهٔ ساختگی ✗) */
  if (!MARKETS.includes(marketRaw as MarketId)) notFound();
  const market = marketRaw as MarketId;

  /**
   * **آماده‌بودن داده**: فعلاً فقط `crypto/BTCUSDT/candles` ✓ — هر ترکیب دیگری
   * صفحهٔ «به‌زودی» می‌گیرد ✓ (بدون ۴۰۴ ✗ و بدون دادهٔ ساختگی ✗) و همین صفحه با
   * افزودن بازار/نوع تازه، **بدون تغییر معماری** گسترش می‌یابد ✓.
   */
  const pairKnown = HISTORICAL_ASSETS.some((a) => a.asset.toUpperCase() === pairRaw);
  const ready = market === "crypto" && datatypeRaw === DATATYPE_ACTIVE && pairKnown;

  if (!ready) {
    return (
      <section
        className="mx-auto w-full max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 space-y-3"
        data-market={market}
        data-pair={pairRaw || "?"}
        data-datatype={datatypeRaw || "?"}
        data-market-soon="1"
      >
        <header className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-semibold sm:text-xl">{tm("crypto_soon_title")}</h1>
          <span className="text-xs text-muted">{`${market} · ${pairRaw || "?"} · ${datatypeRaw || "?"}`}</span>
        </header>
        <p className="text-sm text-muted">{tm("crypto_soon_body")}</p>
        <p className="text-xs text-muted">
          <span className="font-medium">{`/crypto/${HISTORICAL_ASSETS[0]?.asset ?? "BTCUSDT"}/${DATATYPE_ACTIVE}`}</span>
        </p>
        <p className="text-xs text-muted">{DATATYPES_PLANNED.join(" · ")}</p>
        <p className="text-xs text-muted">{MARKETS.join(" · ")}</p>
      </section>
    );
  }

  /** pair از path ⇒ همان قرارداد قبلی ✓ (ناشناخته بالا رد شد ✓) */
  const assetParam = pairRaw;
  const { venue: venueParam, tf: tfParam, pane: paneParam, profile: profileParam, theme: themeParam } = rawParams;
  /**
   * 🆕 **وضعیت کامل از URL** (پروفایل + نمونه‌های پارامتری) ⇒ به چارت پاس می‌شود ✓
   * تا **کلید ON/OFF و پارامترها بلافاصله روی سری‌ها اثر بگذارند** ✓ (بازبینی ششم).
   * ⛔ داده را عوض نمی‌کند ✗ — فقط کدام سری با چه پارامتری رسم شود ✓.
   */
  const chartState = decodeState(
    new URLSearchParams(
      Object.entries(rawParams).filter(([, v]) => typeof v === "string") as [string, string][],
    ).toString(),
  );

  /**
   * **P5/4-UI:** پیش‌فرض صفحه **`pro`** ⇒ چارت با **همهٔ ماژول‌ها** بالا می‌آید ✓
   * (خواستهٔ صریح: «چارت را با تمام ماژول‌ها طراحی کن — مدل پرو» ✓).
   * `?profile=` هنوز کار می‌کند ✓ ولی **از داخل UI انتخاب نمی‌شود** ✗
   * (ردیف دکمه‌های پروفایل از Control Center **حذف شد** ✓ — پروفایل = پریستِ کد ✗).
   */
  const profileId = applyProfile(profileParam ?? "pro").profile;

  /**
   * 🆕 **تمِ نسخه‌دار (بازبینی ششم ✓):**
   *   ۱) اگر `?theme=` یکی از ۵ نسخهٔ اسکرینی باشد ⇒ همان ✓ (بازرسی/دیباگ ✓)
   *   ۲) وگرنه از **نشانه‌های سرور** (UA/Client-Hints) انتخاب می‌شود ✓ و اگر هیچ
   *      نشانه‌ای نبود ⇒ **دسکتاپ** = رفتار امروز ✓ (`shahrivar_desktop` ✓).
   *   ۳) در کلاینت، `ScreenThemeSync` با عرض واقعی viewport تم را دقیق می‌کند ✓.
   * ⛔ هیچ اثری بر پریست (`profileId`) یا داده ندارد ✗.
   */
  /**
   * ⛔ **بازبینی سیزدهم — SSR کاملاً خنثی** ✓ (خواستهٔ کاربر ✓):
   * سرور **هیچ** تشخیصی نمی‌دهد ✗ — نه UA ✗ نه aspect/orientation ✗ نه تم ✗ نه
   * anchorRatio/rightOffset ✗. فقط: `screenClass="unknown"` و تمِ خنثی
   * `shahrivar_default` ✓. **کلاینت تنها منبع تشخیص است** ✓ (`ScreenThemeSync` ✓)
   * و تم را **یک‌بار** می‌گذارد ✓ ⇒ رفع mismatchِ SSR/CSR و پنهان‌شدنِ چارت ✗.
   */
  const themeId = themeParam && screenThemeIds().includes(themeParam) ? themeParam : SSR_THEME_ID;
  const screenClass: ScreenClass | "unknown" =
    themeParam ? (classOfTheme(themeId) ?? SSR_SCREEN_CLASS) : SSR_SCREEN_CLASS;
  /** پارامترهای ظاهریِ کشو/لجند از همین تم ✓ */
  const themeUi = getThemeSpec(themeId)?.ui ?? {};

  /** نام کامل ماژول‌ها ⇒ **تول‌تیپ ریل** کشو ✓ (i18n: `cc.module.*` ✓) */
  const moduleLabels = Object.fromEntries(MODULE_IDS.map((m) => [m, tm(`cc.module.${m}`)]));

  /**
   * **نام نمایشی آیتم‌ها** (`cc.item.<module>.<key>` ✓) — از پیام‌های همان
   * درخواست ✓ (بدون `tm()` تا کلید ناموجود، خطا ندهد ✗) و در نبود ترجمه،
   * **برچسب پشتیبان کتابخانه** می‌نشیند ✓ (هیچ متن سخت‌کدی در کامپوننت ✗).
   */
  const allMessages = await getMessages();
  const ccItem =
    ((allMessages as Record<string, unknown>).macro as { cc?: { item?: Record<string, string> } })?.cc
      ?.item ?? {};
  const itemLabels = Object.fromEntries(
    MODULE_IDS.flatMap((m) =>
      itemsOf(m).map((s) => [`${m}.${s.key}`, ccItem[`${m}.${s.key}`] ?? s.fallbackLabel]),
    ),
  );

  /** توضیح کوتاه هر بخش (`cc.desc.*` ✓) ⇒ **فوتر وسط‌چین** پنل ✓ (مورد ۶) */
  const ccDesc =
    ((allMessages as Record<string, unknown>).macro as { cc?: { desc?: Record<string, string> } })?.cc
      ?.desc ?? {};

  /**
   * **رنگ‌های کشو = رنگ‌های چارت** ✓ — همان تم (`HIST_TEMPLATE_THEME`) و همان
   * تابع حل اسلات (`resolveSlot` ✓) که چارت استفاده می‌کند ⇒ دورهٔ EMA که خطش
   * سبز است، در کشو هم سبز است ✓ (مورد ۵ درخواست ✓). هیچ رنگ اختراعی ✗.
   */
  const theme = getThemePreset(HIST_TEMPLATE_THEME);
  const ccColors = Object.fromEntries(
    [...new Set(MODULE_IDS.flatMap((m) => itemsOf(m).map((s) => s.colorKey)))].map((key) => [
      key,
      resolveSlot(theme, key),
    ]),
  );

  /**
   * 🆕 **رنگ هر نمونه** (بازبینی هفتم ✓) — از قالب تم ✓:
   * نمونهٔ اول = رنگ آیتم ✓ · نمونهٔ دوم/سوم = رنگ‌های از پیش تعریف‌شدهٔ قالب
   * **بدون تضاد** ✓ ⇒ دو/سه اندیکاتور همسان هم‌رنگ دیده نمی‌شوند ✓.
   * ⛔ داده/پریست را عوض نمی‌کند ✗ (فقط رنگ ✓).
   */
  const instanceColors = assignInstanceColors(
    itemsOf("indicators").map((sp) => ({ key: sp.key, colorKey: sp.colorKey })),
    (key) => {
      const sp = itemsOf("indicators").find((x) => x.key === key);
      return sp ? readInstances(chartState.modules.indicators.params, sp).length : 0;
    },
    (ref, i) => resolveSlot(theme, ref, i),
  );

  /** متن‌های رابط کشو ✓ (i18n: `cc.*` ✓ — هیچ متن سخت‌کدی در کامپوننت نیست ✓) */
  const ccUi = {
    title: tm("cc.title"),
    open: tm("cc.open"),
    close: tm("cc.close"),
    on: tm("cc.on"),
    off: tm("cc.off"),
    active: tm("cc.active"),
    library: tm("cc.library"),
    add: tm("cc.add"),
    remove: tm("cc.remove"),
    empty: tm("cc.empty"),
    settings: tm("cc.settings"),
    params: tm("cc.params"),
    noParams: tm("cc.noParams"),
    range: tm("cc.range"),
    removeItem: tm("cc.removeItem"),
    instance: tm("cc.instance"),
    clickAway: tm("cc.clickAway"),
  };

  /** پنل AL (A1): `rsi` · `macd` · پیش‌فرض `none` (پنل حجم) */
  const pane: "none" | "rsi" | "macd" =
    paneParam === "rsi" || paneParam === "macd" ? paneParam : "none";

  /** اعتبارسنجی ورودی‌ها با رجیستری (allowlist دامنه، نه رشتهٔ آزاد). */
  const asset = HISTORICAL_ASSETS.find((a) => a.asset === assetParam) ?? HISTORICAL_ASSETS[0]!;
  const venue =
    HISTORICAL_VENUES.find((v) => v.key === venueParam) ??
    HISTORICAL_VENUES.find((v) => v.key === HISTORICAL_DEFAULTS.venue)!;
  const timeframe =
    HISTORICAL_TIMEFRAMES.find((t) => t.key === tfParam)?.key ?? HISTORICAL_DEFAULTS.timeframe;

  /** C1: پنجره/زمان در کلاینت محاسبه نمی‌شود (سرور پنجره را می‌سازد) ⇒ بدون `Date.now()`. */
  /**
   * **C1 — کلاینت پنجره نمی‌سازد:** فقط `tf` (و در صورت نیاز صریح `from`/`to`)
   * فرستاده می‌شود؛ **سرور** پنجرهٔ مجاز را می‌سازد، روی آخرین دادهٔ موجود لنگر
   * می‌کند و در `meta.window`/`meta.anchored`/`latestTimestamp`/`lagSeconds`
   * گزارش می‌دهد. `clampWindow` قدیمی (محاسبهٔ پنجره در کلاینت) از این مسیر حذف
   * شد؛ تابع همچنان در `services.ts` برای سازگاری عقب‌رو باقی است ولی صدا زده
   * نمی‌شود (deprecated).
   */
  const result = await fetchHistoricalCandles({
    asset: asset.asset,
    symbol: asset.symbol,
    venue: venue.key,
    tf: timeframe,
  });

  /**
   * v3: قالب‌های ترجمهٔ tooltipها — **دادهٔ سریالایزپذیر** (نه تابع).
   * کلیدهای سیگنال این دامنه `hist.signals.*` هستند، پس **ریشهٔ** `macro` پاس
   * می‌شود تا `lookupHint()` مسیر را کامل پیدا کند (بالفاصله بعد از همهٔ `hist.*`).
   */
  const messages = await getMessages();
  const signalHints = (messages as { macro?: Record<string, unknown> })?.macro ?? {};

  /** متن‌های چارت — همه از i18n (هیچ متن سخت‌کدی در کامپوننت‌ها نیست). */
  const labels = {
    title: tm("hist.title"),
    asOf: tm("charts.as_of"),
    timeframe: tm("hist.timeframe"),
    venue: tm("hist.venue"),
    source: tm("charts.source"),
    legendCandle: tm("hist.legend_candle"),
    legendEma: tm("hist.legend_ema"),
    legendSma: tm("hist.legend_sma"),
    legendVolume: tm("hist.legend_volume"),
    /** P5/4-UI (مورد ۴): راهنمای کلیک روی ردیف لجند داخل چارت ✓ */
    legendHint: tm("cc.settings"),
    empty: tm("charts.empty_hist"),
    error: tm("series.no_data"),
    sigMain: tm("hist.signals.btc.label"),
    sigTf: tm("hist.signals.tf.label"),
    sigVenue: tm("hist.signals.venue.label"),
    sigCross: tm("hist.signals.cross.label"),
    sigGap: tm("hist.signals.gap.label"),
    sigVol: tm("hist.signals.vol.label"),
    sigSpread: tm("hist.signals.spread.label"),
    sigWarn: tm("hist.signals.warn.label"),
    crossGolden: tm("hist.cross_golden"),
    crossDeath: tm("hist.cross_death"),
    crossNone: tm("hist.cross_none"),
    warnOk: tm("hist.warn_ok"),
    signalHints,
  };

  /**
   * هشدار بیرونی (بج عریض): «پنجره برش خورد» یک واقعیتِ قابل‌گزارش است
   * (سقف‌های D2/D3) ⇒ در بج WARN دیده می‌شود، نه پنهان.
   */
  const warning: CandleWarning | null = result.meta.clamped
    ? { text: tm("charts.hist_clamped_note"), tone: "warn" }
    : null;

  const selectClass =
    "rounded border border-border bg-surface-2 px-2 py-1 text-foreground";

  /**
   * 🟩 **مرحلهٔ ۵ — حفظ پارامترهای URL در Apply** (رفع باگ «زوم متفاوت پس از Apply»):
   * فرم فقط ۴ فیلد دارد (`asset`/`venue`/`tf`/`pane` ✓) و ارسالِ GET، **بقیهٔ**
   * پارامترها را حذف می‌کرد ✗ — از جمله `theme=shahrivar_desktop` ✓ و وضعیت
   * ماژول‌ها (`mod`/`p` ✓). با رفتنِ `theme`، SSR خنثی می‌شد و `ScreenThemeSync`
   * تمِ **واقعیِ اسکرین** را می‌گذاشت ✗؛ و هر تم **زوم خودش** را دارد
   * (`screenLayoutOf`: mobile `6M` · tablet `1Y` · desktop `3Y6M` · ultrawide `5Y`
   * · tv `1Y` ✓) ⇒ «زوم متفاوت» ✗.
   * ⇒ همهٔ پارامترهای دیگر به‌صورت `hidden` همراه می‌شوند ✓ ⇒ **Apply ≡ Ctrl+Shift+R** ✓.
   */
  const keptParams = Object.entries(rawParams).filter(
    ([k, v]) => typeof v === "string" && !["asset", "venue", "tf", "pane"].includes(k),
  ) as [string, string][];

  return (
    <section className="mx-auto w-full max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 space-y-4" data-al-selftest={alSelfTestSummary()}>
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">{tm("hist.title")}</h1>
        <span className="text-xs text-muted">
          {asset.label} · {timeframe} · {venue.label}
        </span>
      </header>

      {/* کنترل‌های سرور-محور (بدون JS کلاینت): دارایی · صرافی · تایم‌فریم */}
      <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-hist-controls="1">
        {/* 🟩 پارامترهای دیگر URL (تم · پروفایل · وضعیت ماژول‌ها · …) حفظ می‌شوند ✓ */}
        {keptParams.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-muted">{tm("hist.asset")}</span>
          <select name="asset" defaultValue={asset.asset} className={selectClass}>
            {HISTORICAL_ASSETS.map((a) => (
              <option key={a.asset} value={a.asset}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{tm("hist.venue")}</span>
          <select name="venue" defaultValue={venue.key} className={selectClass}>
            {HISTORICAL_VENUES.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{tm("hist.timeframe")}</span>
          <select name="tf" defaultValue={timeframe} className={selectClass}>
            {HISTORICAL_TIMEFRAMES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{tm("hist.pane")}</span>
          <select name="pane" defaultValue={pane} className={selectClass}>
            <option value="none">{tm("hist.legend_volume")}</option>
            <option value="rsi">RSI</option>
            <option value="macd">MACD</option>
          </select>
        </label>
        <button type="submit" className={`${selectClass} font-medium`}>
          {tm("hist.apply")}
        </button>
      </form>

      {!result.ok ? (
        /**
         * D4: سرویس تاریخی down است ⇒ **پیام اختصاصی** + راهنمای بالا آوردن.
         * هیچ چارت خالی/ساختگی رسم نمی‌شود و صفحه ۵۰۰ نمی‌دهد.
         */
        <div
          className="rounded-md border border-border bg-surface-2 p-3 text-sm"
          data-hist-error={result.meta.error ?? "unknown"}
          data-hist-service="down"
        >
          <p className="font-medium">{tm("charts.hist_service_title")}</p>
          <p className="mt-1 text-xs text-muted">
            {tm("charts.hist_service_hint", { port: HISTORICAL_API_PORT })}
          </p>
          <p className="tnum mt-1 text-xs text-muted">{result.meta.error}</p>
        </div>
      ) : (
        <>
          {/* C3: تازه‌سازی زنده با diff (۳۰۴ ⇒ صفر بایت · تب مخفی ⇒ بدون درخواست) */}
          <HistoricalLivePoller
            symbol={asset.symbol}
            timeframe={timeframe}
            venue={venue.key}
            latestTimestamp={result.meta.latestTimestamp}
          />
          {/*
           * P5/4-UI — **مرکز فرماندهی داخل محدودهٔ چارت** ✓ (اصلاح موارد ۱ و ۲):
           * میزبانِ `relative` **فقط چارت** را در بر می‌گیرد ⇒ کشو (`absolute`)
           * دقیقاً به محدودهٔ چارت قید می‌شود ✓، فلش وسطِ ارتفاع همان محدوده است ✓،
           * عرض کشو ≈ یک‌سوم عرض چارت ✓ و کلیک روی چارت ⇒ بستن ✓.
           * ④ (بازبینی پنجم) `overflow-hidden` + `rounded-lg`: انیمیشن باز/بستِ کشو
           * **داخل مرزهای چارت کلیپ می‌شود** ✓ ⇒ دیگر «پرش/اسکرول افقی صفحه» ✗ و
           * حرکتِ خروج کشو به سمت چپِ سایت دیده نمی‌شود ✓ (شعاع گوشه = خودِ کارت ✓).
           * ⛔ دیگر `fixed` روی کل صفحه نیست ✗ و ردیف پروفایل‌ها هم حذف است ✗
           * (پروفایل بالا با `applyProfile` تعیین شد ✓).
           */}
          {/* TEMP-DEBUG: برچسب تشخیص اسکرین — با حذف این خط ناپدید می‌شود ✗ */}
          <ScreenBadge hinted={{ cls: screenClass, themeId }} />

          <div className="relative overflow-hidden rounded-lg" data-cc-anchor="chart" data-screen-class={screenClass}>
          <CandleChart
          candles={result.candles}
          timeframe={timeframe}
          /* C2: کندل در حال تشکیل جدا از مبنا (AL روی closed) */
          closed={result.closed}
          forming={result.forming}
          serverMeta={result.meta}
          /* P3-b: پروفایل فعال (قرارداد «پروفایل = پریست، نه چارت جدید» ✗) */
          profile={profileId}
          /* 🆕 تمِ نسخه‌دار نمایشی (پنج نسخهٔ اسکرینی ✓ — فقط ظاهر ✓) */
          theme={themeId}
          /* 🆕 وضعیت URL ⇒ سری‌های واقعی (کلید آن/آف آنی ✓ · بدون تغییر داده ✗) */
          chartState={chartState}
          asset={asset.asset}
          symbol={asset.symbol}
          venueLabel={venue.label}
          locale={locale}
          labels={labels}
          warning={warning}
          pane={pane}
          right={null}
        />
          {/* کشو **بعد از چارت** ولی داخل همان محدوده ✓ (z-index کار را می‌کند ✓) */}
          <ControlCenter
            profile={profileId}
            moduleLabels={moduleLabels}
            itemLabels={itemLabels}
            moduleDesc={ccDesc}
            colors={ccColors}
            /* 🆕 رنگ هر نمونه (نمونهٔ دوم/سوم ≠ اولی ✓ — از قالب تم ✓) */
            instanceColors={instanceColors}
            /* 🆕 UI تمِ نسخه‌دار: عرض کشو · ریل · لمس · ستون‌ها · قلم · انیمیشن ✓ */
            themeUi={themeUi}
            ui={ccUi}
          />
          {/* 🆕 همگام‌سازی تم با عرض واقعی viewport (کلاینت ✓ — بدون پریست/داده ✗) */}
          <ScreenThemeSync current={themeId} />
          </div>
        </>
      )}
    </section>
  );
}
