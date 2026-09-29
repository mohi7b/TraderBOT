"use client";

/**
 * ============================================================
 * PolicyRateChart — «نرخ بهرهٔ رسمی در برابر تورم کل»
 * frontend/components/domain/macro/PolicyRateChart.tsx
 * ============================================================
 * چارت مستقل با قالب **shahrivar_policy** (هم‌ساختار چارت تورمی شهریور):
 *   · خط نرخ سیاستی (آبی ملایم) + خط تورم کل (قرمز ملایم) + نقطه‌های داده
 *   · ناحیهٔ آیندهٔ یک‌ساله (Forecast Zone) کم‌رنگ — بدون دادهٔ ساختگی
 *   · سیگنال اصلی **PAS** (پس‌زمینه از EFT + فلش جهت/زاویه/تعداد + رنگ متن
 *     از فشار) و چهار سیگنال فرعی Rmi / Im / Gap / Prf (فقط نماد + رنگ متن)
 *
 * داده: نرخ از گروه `1D_monetary` (`canon=POLICY_RATE` — BIS WS_CBPOL) و
 * تورم از همان مسیر چارت تورمی (`seriesYoyPoints`). برای کشورهای منطقهٔ
 * یورو که سری ملی‌شان در ۱۹۹۸ متوقف شده، نرخ ECB (`XM`) استفاده می‌شود.
 * ============================================================
 */
import { useMemo, type ReactNode } from "react";
import { BaseChart } from "@/components/base/BaseChart";
import { ChartFrame } from "@/components/base/ChartFrame";
import { fromDatedPoints, makeSeries } from "@/lib/chart/adapters";
import { MACRO_CHART_HEIGHT, macroLayers } from "@/lib/chart/presets/macro";
import { CHART_SPEC_VERSION, MATH_VERSIONS } from "@/lib/chart/spec/version";
import { realRateSignal, yield10ySignal } from "@/lib/macro/macroSignals";
import { getThemePreset, resolveSlot } from "@/lib/chart/themePresets";
import type { ChartLayer, ChartSignal, SignalTone } from "@/lib/chart/types";
import { dateRankOf, seriesYoyPoints } from "@/lib/macro/cpi";
import { buildPas, pickPolicyRate, pointsOfSeries, POLICY_SCALES } from "@/lib/macro/policy";
import { formatTarget, type CpiTarget } from "@/lib/macro/targets";
import { formatSeriesDate, parseSeriesDate } from "@/lib/format";
import type { Series } from "@/lib/types/series";

const TEMPLATE_THEME = "shahrivar_policy";
/** فرکانس رسم هر دو سری در این چارت (ماهانه — همانند چارت تورمی) */
const CADENCE = "M";

/** رنگ پس‌زمینهٔ PAS از EFT (۴ سطح): 🟥 قرمز · 🟨 زرد · ⚪️ سفید · 🟩 سبز */
const EFT_TONE: SignalTone[] = ["neg", "warn", "neutral", "pos"];
/** رنگ متن PAS از فشار بر بازارهای ریسکی (۴ سطح) */
const PRESSURE_TONE: SignalTone[] = ["neg", "warn", "neutral", "pos"];

export interface PolicyRateLabels {
  title?: string;
  legendRate?: string;
  legendInflation?: string;
  target?: string;
  empty?: string;
  error?: string;
  /** برچسب وقتی نرخ از منطقهٔ یورو گرفته شده است */
  euroPolicy?: string;
  /** ردیف توضیحات (متناسب با چارت تورمی) */
  asOf?: string;
  unit?: string;
  frequency?: string;
  source?: string;
  modeRaw?: string;
  modeComputed?: string;
  /**
   * v3: قالب‌های ترجمهٔ tooltipها (`messages.macro.signals`) — **دادهٔ
   * سریالایزپذیر** است، چون تابع را نمی‌توان به Client Component پاس داد.
   */
  signalHints?: Record<string, unknown>;
}

/** آخرین تاریخ یک سری (از payload). */
function lastDateOf(s: Series): string {
  const h = s.history?.full ?? [];
  const last = h.length ? h[h.length - 1] : undefined;
  return String(last?.date ?? s.latest?.date ?? "");
}

/**
 * انتخاب سری تورم کل برای کشور — «تازه‌ترین بدون نقطهٔ آینده»
 * (همان قاعدهٔ headline در چارت تورمی؛ پیش‌بینی سالانهٔ IMF/WB رد می‌شود).
 */
function pickInflation(series: Series[], country?: string): Series | undefined {
  const all = series.filter((s) => s.indicator.code === "CPI");
  const pool = country
    ? all.filter((s) => s.country.code.toUpperCase() === country.toUpperCase())
    : all;
  const src = pool.length ? pool : all;
  const now = new Date().getUTCFullYear() * 12 + (new Date().getUTCMonth() + 1);
  const observed = src.filter((s) => dateRankOf(lastDateOf(s)) <= now);
  const list = [...(observed.length ? observed : src)].sort(
    (a, b) => dateRankOf(lastDateOf(b)) - dateRankOf(lastDateOf(a)),
  );
  return list[0];
}

/** تغییر علامت‌دار برای نمایش (مثال: `+0.25`). */
const signed = (v: number | null, digits = 2) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 10 ** digits) / 10 ** digits}`;

/** رنگ متن سیگنال فرعی از «شدت» (مثبت = فشار، منفی = بهبود). */
function intensityTone(v: number | null, scale: number): SignalTone {
  if (v === null) return "neutral";
  const m = Math.abs(v) / scale;
  if (m < 0.15) return "neutral";
  if (v > 0) return m >= 0.6 ? "neg" : "warn";
  return "pos";
}

export function PolicyRateChart({
  series,
  country,
  target: targetProp,
  height = MACRO_CHART_HEIGHT,
  locale = "en",
  labels,
  right,
  subtitle,
  className,
}: {
  series: Series[];
  country?: string;
  target?: CpiTarget;
  height?: number;
  locale?: string;
  labels?: PolicyRateLabels;
  /** کنترل‌های سمت راست هدر (لیست کشورها) — مثل چارت تورمی */
  right?: ReactNode;
  /** نام کشور که **داخل** چارت نمایش داده می‌شود (مثل چارت تورمی) */
  subtitle?: ReactNode;
  className?: string;
}) {
  const templateTheme = useMemo(() => getThemePreset(TEMPLATE_THEME), []);

  // ---- تورم کل (همان مسیر چارت تورمی) ----
  const cpiSeries = useMemo(() => pickInflation(series, country), [series, country]);
  const cpiRows = useMemo(
    () =>
      seriesYoyPoints(cpiSeries, { guard: "cpi" }).map((r) => ({ date: r.date, value: r.yoy })),
    [cpiSeries],
  );
  const cpiLast = cpiRows.length ? cpiRows[cpiRows.length - 1]!.date : "";

  // ---- نرخ سیاستی (با fallback منطقهٔ یورو برای DEU/FRA/ITA) ----
  const ratePick = useMemo(
    () => pickPolicyRate(series, country ?? "", cpiLast),
    [series, country, cpiLast],
  );
  const rateRows = useMemo(
    () => (ratePick.series ? pointsOfSeries(ratePick.series) : []),
    [ratePick],
  );

  // ---- PAS + سیگنال‌های فرعی (هستهٔ خالص در lib/macro/policy.ts) ----
  const pas = useMemo(
    () =>
      buildPas({
        ratePoints: rateRows,
        cpiPoints: cpiRows,
        target: targetProp ? { low: targetProp.low, high: targetProp.high } : null,
      }),
    [rateRows, cpiRows, targetProp],
  );

  const rateLabel = ratePick.euroAreaFallback
    ? (labels?.euroPolicy ?? "ECB Policy Rate")
    : (labels?.legendRate ?? "Policy Rate");
  const inflationLabel = labels?.legendInflation ?? "Headline CPI";

  // ---- دادهٔ چارت: نرخ + تورم (فقط خطوط؛ بدون نقطهٔ داده) ----
  const chartData = useMemo(() => {
    const out = [];
    if (rateRows.length >= 2) {
      out.push(
        makeSeries(
          fromDatedPoints(
            rateRows.map((p) => ({ date: p.date, value: p.value })),
            parseSeriesDate,
          ),
          {
            id: "rate",
            label: rateLabel,
            colorKey: "rate",
            lineWidth: 2,
          },
        ),
      );
    }
    if (cpiRows.length >= 2) {
      out.push(
        makeSeries(
          fromDatedPoints(
            cpiRows.map((p) => ({ date: p.date, value: p.value })),
            parseSeriesDate,
          ),
          {
            id: "inflation",
            label: inflationLabel,
            colorKey: "inflation",
            lineWidth: 2,
          },
        ),
      );
    }
    return out;
  }, [rateRows, cpiRows, rateLabel, inflationLabel]);

  /**
   * لایه‌ها: فقط باند هدف تورمی (مثل چارت تورمی).
   * ⚠️ ناحیهٔ «پیش‌بینی» حذف شد (2026-09-22): دادهٔ پیش‌بینی نرخ بهره نداریم
   *    و در این مرحله لازم نیست؛ هیچ مقدار/ناحیهٔ ساختگی رسم نمی‌شود.
   */
  const layers = useMemo<ChartLayer[]>(
    () =>
      macroLayers({
        target: targetProp
          ? {
              low: targetProp.low,
              high: targetProp.high,
              label: labels?.target ?? targetProp.label ?? "Target",
              enabled: true,
            }
          : undefined,
      }),
    [targetProp, labels?.target],
  );

  // ---- سیگنال‌ها: PAS (fill) اول، سپس Real/Yld و چهار سیگنال فرعی ----
  /**
   * ⚠️ `pas.current` **بیرون** از `useMemo` خوانده می‌شود: نام `current` برای
   * React Compiler شبیه `ref.current` است و داخل memo باعث
   * `preserve-manual-memoization` می‌شد (خطای lint). این‌جا یک‌بار استخراج و
   * به‌عنوان dep معمولی پاس می‌شود.
   */
  const pasCurrentValue = pas?.current ?? null;
  const pasFutureValue = pas?.future ?? null;
  const signals = useMemo(() => {
    const custom: ChartSignal[] = [];
    if (pas) {
      custom.push({
        id: "pas",
        label: "Pas",
        display: `${pas.glyph} ${pas.eft}%`,
        tone: EFT_TONE[pas.eftLevel] ?? "neutral",
        valueTone: PRESSURE_TONE[pas.pressureLevel] ?? "neutral",
        weight: pas.count,
        fill: true,
        value: pas.eft,
        hintKey: "signals.pas.hint",
        hintParams: {
          eft: pas.eft,
          current: pasCurrentValue ?? "—",
          future: pasFutureValue ?? "—",
          direction: pas.direction,
          count: pas.count,
          rmi: pas.rmi ?? "—",
          im: pas.im ?? "—",
          gap: pas.gap ?? "—",
          prf: pas.prf ?? "—",
        },
      });

      /**
       * **سیگنال دوم و سوم چارت** (بلافاصله بعد از Pas، همان خط، بدون شکست خط):
       *   Real = نرخ بهرهٔ واقعی (نرخ سیاستی − تورم کل)
       *   Yld  = بازدهی اوراق ۱۰ساله (شرایط مالی)
       * هر دو بدون پس‌زمینه/فلش/شدت و با نام کوتاه (مثل Rmi/Im/Gap/Prf)؛
       * رنگ متن = نردبان چهارسطحی وضعیت (`valueTone`).
       * نبودِ داده (مثل BRA/CHN/SAU/TUR که منبع بازدهی ندارند) ⇒ بج رسم نمی‌شود.
       */
      const lastRate = rateRows.length ? rateRows[rateRows.length - 1]!.value : null;
      const lastCpi = cpiRows.length ? cpiRows[cpiRows.length - 1]!.value : null;
      /** هر دو سیگنال همیشه رسم می‌شوند؛ نبودِ داده ⇒ بج `N/A —` سفید و بدون فلش */
      custom.push(realRateSignal(lastRate, lastCpi));
      custom.push(yield10ySignal(series, country ?? "", cpiLast));

      custom.push({
        id: "rmi",
        label: "Rmi",
        display: signed(pas.rmi),
        tone: intensityTone(pas.rmi, POLICY_SCALES.rmi),
        value: pas.rmi,
        hintKey: "signals.rmi.hint",
        hintParams: { value: pas.rmi ?? "—" },
      });
      custom.push({
        id: "im",
        label: "Im",
        display: signed(pas.im),
        tone: intensityTone(pas.im, POLICY_SCALES.im),
        value: pas.im,
        hintKey: "signals.im.hint",
        hintParams: { value: pas.im ?? "—" },
      });
      custom.push({
        id: "gap",
        label: "Gap",
        display: `↔ ${signed(pas.gap)}`,
        tone:
          pas.gap === null || Math.abs(pas.gap) < 0.1 ? "neutral" : pas.gap > 0 ? "pos" : "neg",
        value: pas.gap,
        hintKey: "signals.gap.hint",
        hintParams: { value: pas.gap ?? "—" },
      });
      custom.push({
        id: "prf",
        label: "Prf",
        display: `✔ ${pas.prf === null ? "—" : `${pas.prf}%`}`,
        tone:
          pas.prf === null ? "neutral" : pas.prf >= 70 ? "pos" : pas.prf >= 40 ? "warn" : "neg",
        value: pas.prf,
        hintKey: "signals.prf.hint",
        hintParams: { value: pas.prf ?? "—" },
      });
    }
    return {
      custom,
      bias: "up-is-bad" as const,
      target:
        targetProp && (targetProp.low !== null || targetProp.high !== null)
          ? { low: targetProp.low, high: targetProp.high }
          : null,
    };
  }, [pas, targetProp, rateRows, cpiRows, series, country, cpiLast, pasCurrentValue, pasFutureValue]);

  // ---- لجند (رنگ‌ها از همان تم چارت ⇒ هم‌خوان با خطوط) ----
  const targetIsPoint = Boolean(
    targetProp && targetProp.low !== null && targetProp.low === targetProp.high,
  );
  const legend = [
    ...chartData.map((s, i) => {
      const color = resolveSlot(templateTheme, s.colorKey, i);
      return (
        <span key={s.id} className="inline-flex items-center gap-1.5 text-muted">
          <span className="inline-block h-0.5 w-4" style={{ background: color }} />
          {s.label}
        </span>
      );
    }),
    targetProp && (targetProp.low !== null || targetProp.high !== null) ? (
      <span key="target" className="inline-flex items-center gap-1.5 text-muted">
        <span
          className="inline-block"
          style={{
            width: 16,
            height: targetIsPoint ? 3 : 8,
            borderRadius: 2,
            background: targetIsPoint
              ? resolveSlot(templateTheme, "targetLine")
              : resolveSlot(templateTheme, "targetBand"),
            border: targetIsPoint
              ? undefined
              : `1px solid ${resolveSlot(templateTheme, "targetLine")}`,
          }}
        />
        {labels?.target ?? "Target"}: {formatTarget(targetProp.low, targetProp.high)}
      </span>
    ) : null,
  ].filter(Boolean);

  const hasData = chartData.length > 0;

  /**
   * ردیف توضیحات — **عیناً مثل چارت تورمی** (As of · واحد · Freq · Source · mode).
   * ⚠️ به‌درخواست کاربر (2026-09-22): فقط **تاریخ اخیر نرخ بهره** نمایش داده
   *    می‌شود (as-of تورم حذف شد).
   */
  const rateAsOf = rateRows.length ? rateRows[rateRows.length - 1]!.date : "";
  const meta = (
    <>
      <span>
        {labels?.asOf ?? "As of"}:{" "}
        <span className="font-medium text-foreground">
          {rateAsOf ? formatSeriesDate(rateAsOf, CADENCE, locale) : "—"}
        </span>
      </span>
      <span>{labels?.unit ?? "%"}</span>
      <span title={`effective cadence: ${CADENCE}`}>
        {labels?.frequency ?? "Freq"}: {CADENCE}
      </span>
      {ratePick.series?.dataset ? (
        <span>
          {labels?.source ?? "Source"}: {ratePick.series.dataset}
          {cpiSeries?.dataset && cpiSeries.dataset !== ratePick.series.dataset
            ? ` · ${cpiSeries.dataset} (CPI)`
            : ""}
        </span>
      ) : null}
      <span
        className="rounded bg-surface-2 px-1.5 py-0.5"
        title={`rate series_kind: ${ratePick.series?.series_kind ?? "-"} · CPI: YoY محاسبه‌شده`}
      >
        {labels?.modeRaw ?? "precomputed (raw)"} (rate) · {labels?.modeComputed ?? "computed"} (CPI)
      </span>
    </>
  );

  return (
    <div
      data-policy-rate-id={ratePick.series?.id ?? ""}
      data-policy-euro-fallback={ratePick.euroAreaFallback ? "1" : "0"}
      data-inflation-id={cpiSeries?.id ?? ""}
      data-target={
        targetProp && (targetProp.low !== null || targetProp.high !== null)
          ? `${targetProp.low}-${targetProp.high}`
          : "none"
      }
      data-points={chartData.map((s) => `${s.id}:${s.points?.length ?? 0}`).join(",")}
      data-pas={pas ? `${pas.glyph}|${pas.eft}|${pas.eftLevel}|${pas.pressureLevel}` : "none"}
      /* v3: نسخهٔ قرارداد/ریاضی/سیاست «بدون داده» — قابل‌بازرسی در SSR */
      data-spec-version={CHART_SPEC_VERSION}
      data-math-version={MATH_VERSIONS.policy}
      data-missing-policy="na"
      className={className}
    >
      <ChartFrame
        title={labels?.title ?? "Policy Rate vs Headline CPI"}
        meta={meta}
        right={right}
        legend={legend}
        state={hasData ? "ready" : "empty"}
        height={height}
        emptyText={labels?.empty ?? "No policy-rate data for this country"}
        errorText={labels?.error ?? "Failed to load"}
      >
        <BaseChart
          data={chartData}
          themeName={TEMPLATE_THEME}
          /* فقط بایاس/هدف تزریق می‌شود؛ ids/استایل از تم می‌آید */
          signals={signals}
          layers={layers}
          height={height}
          locale={locale}
          priceFormat="percent"
          labels={{ empty: "—", error: labels?.error ?? "chart error" }}
          /* v3: قالب‌های ترجمهٔ tooltipها (دادهٔ سریالایزپذیر از سرور) */
          signalHints={labels?.signalHints}
          deps={[ratePick.series?.id ?? "", cpiSeries?.id ?? "", country ?? ""]}
        >
          {/* نام کشور **داخل** چارت — عیناً مثل چارت تورمی (همان کلاس/رنگ) */}
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



