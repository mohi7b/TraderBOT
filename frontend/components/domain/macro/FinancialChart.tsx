/**
 * FinancialChart — چارت «شرایط مالی» (Financial Conditions) با سیگنال اصلی FAS.
 * frontend/components/domain/macro/FinancialChart.tsx
 * ============================================================
 * ساختار **عیناً** مثل سه چارت قبلی (تورم · سیاست پولی · رشد):
 *   ChartFrame (عنوان + ردیف توضیحات + لجند + کنترل راست) → BaseChart
 *   با تم `shahrivar_financial`، سطر سیگنال یک‌خطی و نام کشور داخل چارت.
 *
 * **خطوط (بدون نقطه):**
 *   · FCI (شاخص شرایط مالی، سری **اصلی**، آبی درخشان) — مقیاس راست
 *   · بازدهی ۱۰سالهٔ کشوری (سری دوم، آبی استاندارد) — مقیاس کمکی مخفی `fin`
 *     (واحدشان یکی نیست؛ روی یک محور FCI صاف می‌شد)
 * **سیگنال‌ها (یک خط):** `Fas` → `Y10 · Credit · DXY · Equity · Liquidity · Vol`
 * **داده:** `YIELD_10Y` (کشوری) + پنج شاخص بازار جهانی از گروه `1F_market`
 *   (VIX · DXY · S&P500 · اسپرد اعتباری · M2). هر ورودی ناموجود/کهنه ⇒ بج
 *   `N/A` سفید بدون فلش (سیگنال حذف نمی‌شود).
 * ============================================================
 */
import { useMemo, type ReactNode } from "react";
import { BaseChart } from "@/components/base/BaseChart";
import { ChartFrame } from "@/components/base/ChartFrame";
import { fromDatedPoints, makeSeries } from "@/lib/chart/adapters";
import { MACRO_CHART_HEIGHT } from "@/lib/chart/presets/macro";
import { getThemePreset, resolveSlot } from "@/lib/chart/themePresets";
import type { ChartSignal } from "@/lib/chart/types";
import { formatSeriesDate, parseSeriesDate } from "@/lib/format";
import { CHART_SPEC_VERSION, MATH_VERSIONS } from "@/lib/chart/spec/version";
import { resolveHint } from "@/lib/chart/spec/hints";
import {
  buildFas,
  fciSeries,
  financialSignals,
  pickFinancialSeries,
  y10Series,
} from "@/lib/macro/financial";
import type { Series } from "@/lib/types/series";

/** تم رسمی این چارت (هم‌خانوادهٔ سه چارت قبلی). */
export const FINANCIAL_TEMPLATE_THEME = "shahrivar_financial";
const CADENCE = "M";
/** تعداد ماه‌های سری FCI برای رسم (۴۸ > زوم ۳٫۵ سال ⇒ لبه‌ها بی‌خطرند) */
const FCI_MONTHS = 48;

/** متن‌های چارت شرایط مالی (از i18n صفحه تزریق می‌شوند). */
export interface FinancialChartLabels {
  title?: string;
  asOf?: string;
  unit?: string;
  frequency?: string;
  source?: string;
  legendFci?: string;
  legendYield?: string;
  empty?: string;
  error?: string;
  modeRaw?: string;
  modeComputed?: string;
  /**
   * v3: قالب‌های ترجمهٔ tooltipها (`messages.macro.signals`) — **دادهٔ
   * سریالایزپذیر** است، چون تابع را نمی‌توان به Client Component پاس داد.
   */
  signalHints?: Record<string, unknown>;
}

export function FinancialChart({
  series,
  country,
  height = MACRO_CHART_HEIGHT,
  locale = "en",
  labels,
  right,
  subtitle,
  className,
}: {
  series: Series[];
  country?: string;
  height?: number;
  locale?: string;
  labels?: FinancialChartLabels;
  /** کنترل سمت راست هدر (لیست کشورها) — مثل سه چارت قبلی */
  right?: ReactNode;
  /** نام کشور که **داخل** چارت نمایش داده می‌شود */
  subtitle?: ReactNode;
  className?: string;
}) {
  const templateTheme = useMemo(() => getThemePreset(FINANCIAL_TEMPLATE_THEME), []);

  /** تاریخ مرجع = تازه‌ترین ماه موجود در ورودی‌های مالی (مبنای گارد کهنگی). */
  const refDate = useMemo(() => {
    const probe = pickFinancialSeries(series, country ?? "", "");
    const all = [probe.y10, probe.credit, probe.dxy, probe.equity, probe.liquidity, probe.vol]
      .filter((p): p is { date: string; value: number }[] => !!p && p.length > 0)
      .map((p) => p[p.length - 1]!.date)
      .sort();
    return all.length ? all[all.length - 1]! : "";
  }, [series, country]);

  const inputs = useMemo(
    () => pickFinancialSeries(series, country ?? "", refDate),
    [series, country, refDate],
  );
  const fas = useMemo(() => buildFas(inputs), [inputs]);

  const chartData = useMemo(() => {
    const out = [];
    const fci = fciSeries(inputs, FCI_MONTHS);
    const y10 = y10Series(inputs, FCI_MONTHS);
    if (fci.length >= 2) {
      out.push(
        makeSeries(fromDatedPoints(fci, parseSeriesDate), {
          id: "fci",
          label: labels?.legendFci ?? "FCI",
          colorKey: "fci",
          lineWidth: 2,
          /* بدون نقطهٔ داده (طبق پرامپت) */
        }),
      );
    }
    if (y10.length >= 2) {
      out.push(
        makeSeries(fromDatedPoints(y10, parseSeriesDate), {
          id: "y10",
          label: labels?.legendYield ?? "10Y Yield",
          colorKey: "fin2",
          lineWidth: 1,
          /* مقیاس کمکی مخفی: واحد FCI و بازدهی یکی نیست */
          priceScaleId: "fin",
        }),
      );
    }
    return out;
  }, [inputs, labels?.legendFci, labels?.legendYield]);

  const signals: ChartSignal[] = useMemo(() => financialSignals(inputs, fas), [inputs, fas]);

  const legend = useMemo(
    () =>
      chartData.map((s, i) => {
        const color = resolveSlot(templateTheme, s.colorKey, i);
        return (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-muted">
            <span className="inline-block h-0.5 w-4" style={{ background: color }} />
            {s.label}
          </span>
        );
      }),
    [chartData, templateTheme],
  );

  const asOf = refDate;
  const meta = (
    <>
      <span>
        {labels?.asOf ?? "As of"}:{" "}
        <span className="font-medium text-foreground">
          {asOf ? formatSeriesDate(asOf, CADENCE, locale) : "—"}
        </span>
      </span>
      <span>{labels?.unit ?? "Index / %"}</span>
      <span>
        {labels?.frequency ?? "Freq"}: {CADENCE}
      </span>
      <span>{labels?.source ?? "Source"}: FRED · OECD (10Y)</span>
      <span
        className="rounded bg-surface-2 px-1.5 py-0.5"
        title={resolveHint(
          { hintKey: "signals.financial.sourceNote", hintParams: inputs.note },
          labels?.signalHints,
        )}
      >
        {labels?.modeComputed ?? "computed"} (FCI) · {labels?.modeRaw ?? "raw"}
      </span>
    </>
  );

  const hasData = chartData.length > 0;

  return (
    <div
      data-financial-fci={fas ? (fas.fci ?? "none") : "none"}
      data-financial-level={fas ? fas.level : "none"}
      data-financial-glyph={fas ? fas.glyph : "none"}
      data-financial-hardness={fas?.hardness ?? "none"}
      data-financial-inputs={[
        inputs.y10 ? "y10" : "",
        inputs.credit ? "credit" : "",
        inputs.dxy ? "dxy" : "",
        inputs.equity ? "equity" : "",
        inputs.liquidity ? "liquidity" : "",
        inputs.vol ? "vol" : "",
      ]
        .filter(Boolean)
        .join(",")}
      data-points={chartData.map((s) => `${s.id}:${s.points?.length ?? 0}`).join(",")}
      /* v3: نسخهٔ قرارداد/ریاضی/سیاست «بدون داده» — قابل‌بازرسی در SSR */
      data-spec-version={CHART_SPEC_VERSION}
      data-math-version={MATH_VERSIONS.financial}
      data-missing-policy="na"
      className={className}
    >
      <ChartFrame
        title={labels?.title ?? "Financial Conditions"}
        meta={meta}
        right={right}
        legend={legend}
        state={hasData ? "ready" : "empty"}
        height={height}
        emptyText={labels?.empty ?? "No financial-conditions data"}
        errorText={labels?.error ?? "Failed to load"}
      >
        <BaseChart
          data={chartData}
          themeName={FINANCIAL_TEMPLATE_THEME}
          /* سیگنال‌ها داده‌محور از دامنه (مثل PAS/GAS)؛ ids/استایل از تم */
          signals={{ custom: signals }}
          height={height}
          locale={locale}
          labels={{ empty: "—", error: labels?.error ?? "chart error" }}
          /* v3: قالب‌های ترجمهٔ tooltipها (دادهٔ سریالایزپذیر از سرور) */
          signalHints={labels?.signalHints}
          deps={[country ?? "", asOf, String(fas?.fci ?? "none")]}
        >
          {/* نام کشور داخل چارت — عیناً مثل سه چارت قبلی */}
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