"use client";

import { useMemo } from "react";
import { ChartFrame, type ChartFrameState } from "@/components/base/ChartFrame";
import { BaseChart } from "@/components/base/BaseChart";
import { getThemePreset, resolveSlot } from "@/lib/chart/themePresets";
import {
  MACRO_CHART_HEIGHT,
  MACRO_TEMPLATE_THEME,
  macroLayers,
} from "@/lib/chart/presets/macro";
import { getCpiTarget, formatTarget, type CpiTarget } from "@/lib/macro/targets";
import { CHART_SPEC_VERSION, MATH_VERSIONS } from "@/lib/chart/spec/version";
import { formatSeriesDate, parseSeriesDate } from "@/lib/format";
import { fromDatedPoints, makeSeries } from "@/lib/chart/adapters";
import {
  collapsePaddedRows,
  dateRankOf,
  detectRateLike,
  resolveYoySource,
  seriesAnnualized3m,
  seriesAnnualizedQuarterly,
  seriesYoyPoints,
} from "@/lib/macro/cpi";
import type { ChartLayoutPartial } from "@/lib/chart/types";
import type { KnownGap, Series } from "@/lib/types/series";

/**
 * ============================================================
 * CpiYoyChart — چارت «CPI YoY — Headline vs Core»
 * frontend/components/domain/macro/CpiYoyChart.tsx
 * ============================================================
 * ⭐ این چارت روی **موتور مرجع ماژولار `BaseChart`** اجرا می‌شود:
 *      data + theme + layout + signals + layers
 *    ⇒ هیچ ظاهر/زوم/سیگنال/لایه‌ای در این فایل هاردکد نیست و برای
 *      تعویض تم کافی است `themeName` (light/dark/terminal/print) عوض شود.
 *
 * قواعد بدون تغییر نسبت به نسخهٔ قبلی:
 *  ۱) همهٔ تبدیل‌های YoY از `seriesYoyPoints`/`seriesAnnualized3m` (Type Guard).
 *  ۲) Core شرطی: سری با <۲ نقطهٔ معتبر رسم نمی‌شود (نه خط، نه لجند، نه Tooltip).
 *  ۳) زمان‌ها با `parseSeriesDate` (cadence-aware: M/Q/A).
 *  ۴) as-of سرتیتر از آخرین تاریخ سری‌ها.
 *  ۵) لایه‌ها (باند هدف/رویداد/رکود/پیش‌بینی) از `macroLayers()` تزریق می‌شوند.
 * ============================================================
 */

const YOY_GUARD = "cpi" as const;
const MIN_POINTS = 2;

/** متن‌ها (از i18n صفحه؛ پیش‌فرض انگلیسی). */
export interface CpiYoyChartLabels {
  title?: string;
  asOf?: string;
  coreAsOf?: string;
  yoyAxis?: string;
  source?: string;
  frequency?: string;
  headline?: string;
  core?: string;
  annualized3m?: string;
  empty?: string;
  error?: string;
  target?: string;
  modeRaw?: string;
  modeComputed?: string;
  signals?: string;
  /** برچسب «منبع فصلی/تجمیع‌شده» وقتی کادنس واقعی سری فصلی است (P3) */
  cadencePadded?: string;
  /** v3: قالب‌های ترجمهٔ tooltipها (دادهٔ سریالایزپذیر از سرور) */
  signalHints?: Record<string, unknown>;
}

/** آخرین تاریخ موجود یک سری از payload (full → latest). */
function lastDateOf(s: Series): string {
  const h = s.history?.full ?? [];
  const last = h.length ? h[h.length - 1] : undefined;
  return String(last?.date ?? s.latest?.date ?? "");
}

/**
 * کلاس فرکانس (۰ = ریزترین). برای ترجیح «کادنس واقعی» در انتخاب سری.
 */
const FREQ_CLASS: Record<string, number> = { D: 0, W: 0, M: 0, Q: 1, S: 2, A: 3 };

/** رتبهٔ ماه جاری (UTC) — برای رد کردن نقاط **آیندهٔ** پروژه‌ها (IMF/WB). */
function nowRank(): number {
  const d = new Date();
  return d.getUTCFullYear() * 12 + (d.getUTCMonth() + 1);
}

/** حداکثر عقب‌ماندگی مجاز یک سری ریزتر نسبت به بهترین تازگی (ماه). */
const PICK_TOLERANCE_MONTHS = 6;

/**
 * P2: رتبهٔ کیفیت منبع (۰ = بهتر) — همان ترتیب picker بک‌اند.
 * برای سری‌هایی که payload رتبه را ندهد، محلی محاسبه می‌شود.
 */
function qualityRankOf(s: Series): number {
  if (typeof s.quality_rank === "number") return s.quality_rank;
  const ds = s.dataset;
  const ind = s.indicator?.provider_code ?? s.indicator?.code ?? "";
  if (ds === "EUROSTAT" && ind.startsWith("HICP_ANR")) return 0;
  if (ds === "EUROSTAT") return 1;
  if (ds === "FRED") return 2;
  if (ds === "OECD" && ind === "CPI_IDX_TXCP01_NRG") return 3;
  if (ds === "DERIVED") return 9;
  return 5;
}

/**
 * انتخاب سری از payload بک‌اند.
 * P5 (2026-09-20): پیش از این «اولین تطابق» برداشته می‌شد و می‌توانست سری
 * **کهنه** باشد (مثال واقعی: Core ژاپن تا 2021-06). قواعد جدید:
 *   ۱) در هر ردهٔ تطبیق (canonical → provider-code → dataset) تازه‌ترین as-of برنده است
 *   ۲) نقاط **آینده** (پیش‌بینی سالانهٔ IMF/WB مثل 2031) نادیده گرفته می‌شوند
 *   ۳) داخل باند ۶ ماه: برای CORE_CPI **کیفیت منبع** حاکم است (P2)، وگرنه
 *      سری ریزتر (M در برابر Q/A) ترجیح دارد (P3)
 *   ۴) در تساوی، سری رسمی (non-DERIVED) مقدم است
 */
function pickSeries(series: Series[], code: string, country?: string): Series | undefined {
  const pool = country
    ? series.filter((s) => s.country.code.toUpperCase() === country.toUpperCase())
    : series;
  const src = pool.length ? pool : series;

  const tiers: Series[][] = [
    src.filter((s) => s.indicator.code === code),
    src.filter((s) => s.indicator.code.includes(`_${code}_`)),
    src.filter((s) => s.dataset_meta?.code === code),
  ];
  const now = nowRank();
  const byFreshness = (a: Series, b: Series) => {
    const da = dateRankOf(lastDateOf(a));
    const db = dateRankOf(lastDateOf(b));
    if (da !== db) return db - da; // تازه‌تر اول
    const ad = a.dataset === "DERIVED" ? 1 : 0;
    const bd = b.dataset === "DERIVED" ? 1 : 0;
    return ad - bd; // رسمی مقدم
  };
  const byQuality = (a: Series, b: Series) => qualityRankOf(a) - qualityRankOf(b) || byFreshness(a, b);

  for (const tier of tiers) {
    if (!tier.length) continue;
    const observed = tier.filter((s) => dateRankOf(lastDateOf(s)) <= now);
    const ranked = [...(observed.length ? observed : tier)].sort(byFreshness);
    const best = ranked[0];
    if (!best) continue;
    const bestRank = dateRankOf(lastDateOf(best));
    const withinBand = ranked.filter(
      (s) => bestRank - dateRankOf(lastDateOf(s)) <= PICK_TOLERANCE_MONTHS,
    );
    // P2: برای Core، کیفیت منبع حاکم است (داخل باند تازگی)
    if (code === "CORE_CPI" && withinBand.length > 1) {
      return [...withinBand].sort(byQuality)[0] ?? best;
    }
    // P3: در غیر این صورت، کادنس ریزتر ترجیح دارد
    const bestClass = FREQ_CLASS[best.frequency] ?? 9;
    const finer = withinBand.find((s) => (FREQ_CLASS[s.frequency] ?? 9) < bestClass);
    return finer ?? best;
  }
  return undefined;
}

export function CpiYoyChart({
  series,
  country,
  countryCode,
  gapEvents,
  target: targetProp,
  targetNote,
  height = MACRO_CHART_HEIGHT,
  locale = "en",
  labels,
  right,
  subtitle,
  className,
}: {
  series: Series[];
  country?: string;
  countryCode?: string;
  /** بریدگی‌های شناخته‌شدهٔ منبع (P4) — از meta.known_gaps بک‌اند */
  gapEvents?: KnownGap[];
  /**
   * هدف تورمی از **منبع حقیقت** (API `/api/country/<ISO3>` → صفحه).
   * اگر ندهید، fallback استاتیک (`CPI_TARGETS`) استفاده می‌شود — که فقط
   * ۱۰ کشور را پوشش می‌داد و باعث می‌شد بعضی چارت‌ها هدف نداشته باشند.
   */
  target?: CpiTarget;
  /** توضیح هدف وقتی مقدار عددی ندارد (مثل «PBoC (no official point target)») */
  targetNote?: string;
  height?: number;
  locale?: string;
  labels?: CpiYoyChartLabels;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  /**
   * تم **واقعی** چارت = قالب رسمی (شهریور).
   * ⚠️ لجند بیرونی قبلاً رنگ را از «تم سایت» می‌گرفت و با خطوط چارت
   * هم‌خوانی نداشت (شاهد کاربر 2026-09-21) — حالا از همین تم می‌آید.
   */
  const templateTheme = useMemo(() => getThemePreset(MACRO_TEMPLATE_THEME), []);

  const headline = useMemo(() => pickSeries(series, "CPI", country), [series, country]);
  const core = useMemo(() => pickSeries(series, "CORE_CPI", country), [series, country]);

  const resolvedCountry = countryCode ?? country ?? headline?.country.code ?? "";
  // هدف تورمی: prop (از API) → fallback استاتیک
  const target = useMemo(
    () => targetProp ?? getCpiTarget(resolvedCountry),
    [targetProp, resolvedCountry],
  );

  // ---- تبدیل YoY (فقط از توابع Type-Guarded) ----
  // P3: اگر منبع، دادهٔ فصلی را روی کلیدهای ماهانه تکرار کرده باشد
  // (`cadence.padded`)، سری به دوره‌های واقعی تجمیع می‌شود (بدون اختراع داده)
  // و «۳ماههٔ annualized» رسم نمی‌شود (روی دادهٔ تکراری بی‌معناست).
  const headlineCadence = headline?.cadence;
  const coreCadence = core?.cadence;
  const effectiveFreq = headlineCadence?.effective ?? headline?.frequency ?? "M";
  const headlinePadded = Boolean(headlineCadence?.padded);

  const headlineRows = useMemo(() => {
    const rows = seriesYoyPoints(headline, { guard: YOY_GUARD });
    return headlinePadded ? collapsePaddedRows(rows, effectiveFreq) : rows;
  }, [headline, headlinePadded, effectiveFreq]);
  const coreRows = useMemo(() => {
    const rows = seriesYoyPoints(core, { guard: YOY_GUARD });
    return coreCadence?.padded ? collapsePaddedRows(rows, coreCadence.effective) : rows;
  }, [core, coreCadence]);
  const ann3mRows = useMemo(
    () =>
      headlinePadded || effectiveFreq === "Q"
        ? seriesAnnualizedQuarterly(headline, { guard: YOY_GUARD, padded: headlinePadded })
        : seriesAnnualized3m(headline, { guard: YOY_GUARD }),
    [headline, headlinePadded, effectiveFreq],
  );

  const headlineSource = resolveYoySource(headline, { guard: YOY_GUARD });
  const headlineDetect = useMemo(() => detectRateLike(headline?.history?.full), [headline]);
  const frequency = effectiveFreq;

  const headlineLabel = labels?.headline ?? headline?.indicator.label ?? "Headline";
  const coreLabel = labels?.core ?? core?.indicator.label ?? "Core";


  // ---- دادهٔ چارت (داده‌محور؛ رنگ با colorKey از تم تزریق‌شده) ----
  const chartData = useMemo(() => {
    const out = [
      ...(headlineRows.length >= MIN_POINTS
        ? [
            makeSeries(
              fromDatedPoints(
                headlineRows.map((r) => ({ date: r.date, value: r.yoy })),
                parseSeriesDate,
              ),
              { id: "headline", label: headlineLabel, colorKey: "headline", lineWidth: 2 },
            ),
          ]
        : []),
      ...(coreRows.length >= MIN_POINTS
        ? [
            makeSeries(
              fromDatedPoints(
                coreRows.map((r) => ({ date: r.date, value: r.yoy })),
                parseSeriesDate,
              ),
              { id: "core", label: coreLabel, colorKey: "core", lineWidth: 2 },
            ),
          ]
        : []),
      ...(ann3mRows.length >= MIN_POINTS
        ? [
            makeSeries(
              fromDatedPoints(
                ann3mRows.map((r) => ({ date: r.date, value: r.yoy })),
                parseSeriesDate,
              ),
              {
                id: "annualized3m",
                label: labels?.annualized3m ?? "3M Annualized",
                colorKey: "annualized3m",
                lineWidth: 1,
                dashed: true,
              },
            ),
          ]
        : []),
    ];
    return out;
  }, [headlineRows, coreRows, ann3mRows, headlineLabel, coreLabel, labels?.annualized3m]);

  const asOf = headlineRows.length ? headlineRows[headlineRows.length - 1]!.date : null;
  const coreAsOf = coreRows.length ? coreRows[coreRows.length - 1]!.date : null;

  /**
   * هدف تورمی + قرارداد جهت برای سیگنال‌ها:
   * - `target` ⇒ «فاصله از هدف» معیار ISS می‌شود.
   * - `bias: "up-is-bad"` ⇒ برای تورم، **صعود = نامطلوب** (قرمز) و نزول = مطلوب
   *   (سبز) — بدون آن، رنگ سیگنال‌های «روند/مومنتوم/انحراف» برعکس خوانده می‌شود.
   * فقط این کلیدها پاس می‌شوند؛ ids/استایل از تم می‌آید.
   */
  const signalsForChart = useMemo(
    () => ({
      bias: "up-is-bad" as const,
      target:
        target && (target.low !== null || target.high !== null)
          ? { low: target.low, high: target.high }
          : null,
    }),
    [target],
  );

  /**
   * P3 (تکمیل): برای سری‌های **فصلی**، برچسب محور زمان باید ماه/سال نشان دهد
   * (مثل «Apr 2026»)؛ در غیر این صورت کاربر فکر می‌کند «دادهٔ سه‌ماهه نمایش
   * داده نمی‌شود». تنها override دامنه است؛ بقیهٔ چینش از **تم** می‌آید.
   */
  const layoutOverride = useMemo<ChartLayoutPartial | undefined>(
    () => ({
      ...(effectiveFreq === "Q" ? { timeScale: { timeVisible: true } } : {}),
      /**
       * فضای آیندهٔ سمت راست = **یک سال** (نمودار کمی به چپ شیفت می‌کند تا
       * برچسب‌ها خوانا باشند و جای پیش‌بینی/فرافکنی بماند).
       * ماهانه: ۱۲ ماه · فصلی: ۴ فصل (هر دو ≈ یک سال).
       */
      futureMargin: effectiveFreq === "Q" ? 4 : 12,
    }),
    [effectiveFreq],
  );

  /**
   * رویدادهای چارت (لایهٔ event-markers).
   * P4: بریدگی‌های «منبع منتشر نکرده» (known_gaps از بک‌اند) این‌جا به
   * علامت عمودی + برچسب تبدیل می‌شوند تا چارت جای «دادهٔ اختراعی» توضیح بدهد.
   */
  const events = useMemo(
    () =>
      (gapEvents ?? [])
        .filter((g) => !resolvedCountry || g.country.toUpperCase() === resolvedCountry.toUpperCase())
        .map((g) => ({
          date: `${g.date}-01`,
          label: g.label ?? "no release",
          importance: "high" as const,
        })),
    [gapEvents, resolvedCountry],
  );

  // ---- لایه‌های بصری: باند هدف + رویدادها (رکود/پیش‌بینی آمادهٔ تزریق) ----
  const layers = useMemo(
    () =>
      macroLayers({
        target: target
          ? {
              low: target.low,
              high: target.high,
              label: labels?.target ?? target.label ?? "Target",
              enabled: true,
            }
          : undefined,
        events: events as unknown as {
          date: string;
          label?: string;
          importance?: "low" | "medium" | "high";
        }[],
      }),
    [target, labels?.target, events],
  );

  const frameState: ChartFrameState = chartData.length === 0 ? "empty" : "ready";

  // ---- نوار متادیتا (as-of · واحد · فرکانس · منبع · هدف · حالت YoY) ----
  const meta = (
    <>
      <span>
        {labels?.asOf ?? "As of"}:{" "}
        <span className="font-medium text-foreground">
          {asOf ? formatSeriesDate(asOf, frequency, locale) : "—"}
        </span>
      </span>
      {coreAsOf && coreAsOf !== asOf ? (
        <span>
          {coreLabel} {labels?.coreAsOf ?? "as of"}:{" "}
          <span className="font-medium text-foreground">
            {formatSeriesDate(coreAsOf, frequency, locale)}
          </span>
        </span>
      ) : null}
      <span>{labels?.yoyAxis ?? "YoY %"}</span>
      <span
        title={
          headlinePadded
            ? `cadence: declared=${headlineCadence?.declared ?? "M"} · effective=${effectiveFreq} · flat_ratio=${
                headlineCadence?.flat_ratio ?? "—"
              }`
            : `effective cadence: ${effectiveFreq}`
        }
      >
        {labels?.frequency ?? "Freq"}: {effectiveFreq}
        {headlinePadded ? (
          <span className="ms-1 rounded bg-surface-2 px-1 py-0.5 text-[10px]">
            {labels?.cadencePadded ?? "quarterly source"}
          </span>
        ) : null}
      </span>
      {headline?.dataset ? (
        <span>
          {labels?.source ?? "Source"}: {headline.dataset}
        </span>
      ) : null}
      
      <span
        className="rounded bg-surface-2 px-1.5 py-0.5"
        title={
          `declared series_kind: ${headline?.series_kind ?? "-"}` +
          ` · detected: ${headlineDetect.isRate ? "rate" : "level"}` +
          ` (${headlineDetect.reason}, med12=${headlineDetect.last12Median ?? "-"})`
        }
      >
        {headlineSource === "raw"
          ? (labels?.modeRaw ?? "precomputed (raw)")
          : (labels?.modeComputed ?? "computed")}
      </span>
    </>
  );

  // ---- لجند (فقط سری‌های واقعاً رسم‌شده؛ رنگ از تم) ----
  /**
   * ---- لجند (خارج از چارت) ----
   * رنگ‌ها از **همان تم چارت** می‌آید (نه تم سایت) تا با خطوط هم‌خوان باشد،
   * و آیتم «هدف تورمی» هم به همین ردیف منتقل شده است (درخواست کاربر:
   * هدف نباید بیرون/در خط توضیحات باشد).
   */
  const targetHasNumbers = Boolean(target && (target.low !== null || target.high !== null));
  const targetIsPoint = Boolean(target && target.low !== null && target.low === target.high);
  const bandColor = resolveSlot(templateTheme, "targetBand");
  const lineColor = templateTheme.palette.slots["targetLine"] ?? resolveSlot(templateTheme, "target");

  const legend = [
    ...chartData.map((s, i) => {
      const color = resolveSlot(templateTheme, s.colorKey, i);
      return (
        <span key={s.id} className="inline-flex items-center gap-1.5 text-muted">
          <span
            className="inline-block h-0.5 w-4"
            style={{
              background: s.dashed
                ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 8px)`
                : color,
            }}
          />
          {s.label}
        </span>
      );
    }),
    targetHasNumbers && target ? (
      <span
        key="target"
        className="inline-flex items-center gap-1.5 text-muted"
        title={targetNote ?? target.label ?? undefined}
      >
        {/* هدف باند: مستطیل کم‌رنگ · هدف ثابت: خط ضخیم هم‌رنگ */}
        <span
          className="inline-block"
          style={{
            width: 16,
            height: targetIsPoint ? 3 : 8,
            borderRadius: 2,
            background: targetIsPoint ? lineColor : bandColor,
            ...(targetIsPoint ? {} : { border: `1px solid ${lineColor}` }),
          }}
        />
        {labels?.target ?? "Target"}: {formatTarget(target.low, target.high)}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div
      data-yoy-source={headlineSource}
      /* v3: نسخهٔ قرارداد/ریاضی/سیاست «بدون داده» — قابل‌بازرسی در SSR */
      data-spec-version={CHART_SPEC_VERSION}
      data-math-version={MATH_VERSIONS.cpi}
      data-missing-policy="hide"
      data-gaps={events.length}
      data-cadence={effectiveFreq}
      data-time-visible={effectiveFreq === "Q" ? "1" : "0"}
      data-headline-id={headline?.id ?? ""}
      data-core-id={core?.id ?? ""}
      data-target={
        target && (target.low !== null || target.high !== null) ? `${target.low}-${target.high}` : "none"
      }
      data-zoom={typeof layoutOverride?.zoom === "string" ? layoutOverride.zoom : "theme"}
      /* سنجش‌پذیری: تعداد نقاط هر سری که واقعاً به چارت داده شده */
      data-points={chartData.map((s) => `${s.id}:${s.points?.length ?? 0}`).join(",")}
    >
      <ChartFrame
        title={labels?.title ?? "CPI YoY — Headline vs Core"}
        meta={meta}
        right={right}
        legend={legend}
        state={frameState}
        height={height}
        emptyText={labels?.empty ?? "No CPI data for this country"}
        errorText={labels?.error ?? "Failed to load"}
        className={className}
      >
        <BaseChart
          data={chartData}
          /* قالب رسمی «شهریور»: ظاهر/چینش/۶ سیگنال از خود تم می‌آید
             (سوئیچ ظاهر = تغییر همین نام؛ آرشیو: themeName="default_chart") */
          themeName={MACRO_TEMPLATE_THEME}
          layout={layoutOverride}
          /* فقط «هدف» پاس می‌شود (برای ISS)؛ ids/استایل از تم می‌آید */
          signals={signalsForChart}
          layers={layers}
          height={height}
          locale={locale}
          priceFormat="percent"
          labels={{
            empty: labels?.empty ?? "—",
            error: labels?.error ?? "chart error",
          }}
          /* v3: قالب‌های ترجمهٔ tooltipها (دادهٔ سریالایزپذیر از سرور) */
          signalHints={labels?.signalHints}
          deps={[headline?.id ?? "", core?.id ?? "", frequency, headlineSource]}
        >
          {/* نام کشور **داخل** چارت (به‌جای هدر بیرونی) */}
          {subtitle ? (
            <div
              className="absolute top-2 left-2 text-[11px] font-medium"
              style={{ color: templateTheme.palette.textMuted }}
            >
              {subtitle}
            </div>
          ) : null}
        </BaseChart>
      </ChartFrame>
    </div>
  );
}
