/**
 * GrowthChart — چارت «رشد اقتصادی» (GDP Growth) با سیگنال اصلی GAS.
 * frontend/components/domain/macro/GrowthChart.tsx
 * ============================================================
 * ساختار **عیناً** مثل دو چارت قبلی (CpiYoyChart و PolicyRateChart):
 *   ChartFrame (عنوان + ردیف توضیحات + لجند + کنترل راست) → BaseChart
 *   با تم `shahrivar_growth`، سطر سیگنال یک‌خطی و نام کشور داخل چارت.
 *
 * **خطوط:** رشد سالانهٔ GDP (سری اصلی، سبز فسفری) · رشد فصلی سالانه‌شده
 *   (SAAR، آبی) · روند ۴فصلی رشد (کمکی، خاکستری نقطه‌چین).
 * **سیگنال‌ها (یک خط، بدون شکست):** `Gas` (پس‌زمینه = GFT · فلش/شدت از GMI+OGI ·
 *   متن = اثر بر بازار · مقدار = پایداری٪) سپس `GMI · OGI · GSI · PMI · NOW · GAPg`.
 * **داده:** canon اختصاصی `GDP_GROWTH` (OECD `GDP_VPV_*` / Eurostat
 *   `GDP_CLV_PCH_SM` / FRED `GDPC1`) با مشتق‌گیری مستند در `lib/macro/growth.ts`.
 *   سیگنال‌های `PMI` و `NOW` منبع داده ندارند ⇒ بج `—` سفید (بدون مقدار ساختگی).
 *
 * **چیدمان (صریح در همین فایل — نه خوانده‌شده از تم):** `3Y6M` (۳٫۵ سال،
 *   زمان‌محور) · `futureMargin: 4` میلهٔ فصلی = یک سال فضای خالی سمت راست ·
 *   `timeVisible: true` · **بدون نقطهٔ داده** (`markers` ندارد).
 *   ⚠️ `getThemePreset()` در ران‌تایم `layout` ندارد؛ خواندنش صفحه را ۵۰۰ می‌کند.
 * ============================================================
 */
import { useMemo, type ReactNode } from "react";
import { BaseChart } from "@/components/base/BaseChart";
import { ChartFrame } from "@/components/base/ChartFrame";
import { fromDatedPoints, makeSeries } from "@/lib/chart/adapters";
import { MACRO_CHART_HEIGHT } from "@/lib/chart/presets/macro";
import { getThemePreset, resolveSlot } from "@/lib/chart/themePresets";
import type { ChartSignal } from "@/lib/chart/types";
import { CHART_SPEC_VERSION, MATH_VERSIONS } from "@/lib/chart/spec/version";
import { formatSeriesDate, parseSeriesDate } from "@/lib/format";
import {
  buildGas,
  growthSignals,
  pickGrowthSeries,
  type GrowthPick,
} from "@/lib/macro/growth";
import type { Series } from "@/lib/types/series";

/** تم رسمی این چارت (هم‌خانوادهٔ دو چارت قبلی). */
export const GROWTH_TEMPLATE_THEME = "shahrivar_growth";
const DEFAULT_CADENCE = "Q";

/**
 * چیدمان مخصوص این چارت (صریح و محلی — یک منبع حقیقت برای این سه عدد):
 *   · `zoom: "3Y6M"` = **۳ سال و نیم** (۴۲ ماه) — زوم **زمان‌محور** است
 *     (`resolveZoomRange` از آخرین تاریخ به عقب می‌رود)، پس برای دادهٔ فصلی هم
 *     واقعاً ۳٫۵ سال می‌شود.
 *   · `futureMargin: 4` = **یک سال** فضای خالی سمت راست؛ ⚠️ این مقدار بر حسب
 *     **میله** اعمال می‌شود (`timeScale().scrollToPosition`) و چون این چارت
 *     فصلی است، ۴ میله = یک سال (تم‌های ماهانه ۱۲ می‌گذارند که برای فصلی
 *     ۳ سال خالی می‌شد).
 *   · `timeScale.timeVisible: true` = برچسب تاریخ روی محور برای دادهٔ فصلی.
 */
export const GROWTH_ZOOM = "3Y6M" as const;
/**
 * میله‌های فضای آینده (⚠️ میلهمحور است، نه زمان‌محور):
 *   · `Q` ⇒ ۴ میلهٔ فصلی = **یک سال**
 *   · `A` ⇒ ۱ میلهٔ سالانه = **یک سال**
 */
export const growthFutureMarginBars = (cadence: "Q" | "A"): number => (cadence === "A" ? 1 : 4);
const GROWTH_CHART_LAYOUT = {
  zoom: GROWTH_ZOOM,
  futureMargin: 4,
  timeScale: { timeVisible: true },
} satisfies import("@/lib/chart/types").ChartLayoutPartial;

/** متن‌های چارت رشد (از i18n صفحه تزریق می‌شوند). */
export interface GrowthChartLabels {
  title?: string;
  asOf?: string;
  unit?: string;
  frequency?: string;
  source?: string;
  legendYoy?: string;
  legendQoq?: string;
  legendTrend?: string;
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

export function GrowthChart({
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
  labels?: GrowthChartLabels;
  /** کنترل سمت راست هدر (لیست کشورها) — مثل دو چارت قبلی */
  right?: ReactNode;
  /** نام کشور که **داخل** چارت نمایش داده می‌شود */
  subtitle?: ReactNode;
  className?: string;
}) {
  const templateTheme = useMemo(() => getThemePreset(GROWTH_TEMPLATE_THEME), []);

  /**
   * تاریخ مرجع برای گارد کهنگی: تازه‌ترین فصل موجود بین سری‌های رشد.
   * (اول بی‌مرجع انتخاب می‌کنیم تا مرجع را از خود داده بگیریم.)
   */
  const refDate = useMemo(() => {
    const probe = pickGrowthSeries(series, country ?? "", "");
    const d = probe.yoy.length
      ? probe.yoy[probe.yoy.length - 1]!.date
      : probe.qoqSaar.length
        ? probe.qoqSaar[probe.qoqSaar.length - 1]!.date
        : "";
    return d;
  }, [series, country]);

  const pick: GrowthPick = useMemo(
    () => pickGrowthSeries(series, country ?? "", refDate),
    [series, country, refDate],
  );

  /** روند ۴فصلی رشد — خط کمکی خاکستری نقطه‌چین (پایهٔ GAPg/OGI را دیدنی می‌کند). */
  const trendRows = useMemo(() => {
    const out: { date: string; value: number }[] = [];
    const ys = pick.yoy;
    for (let i = 3; i < ys.length; i++) {
      const win = ys.slice(i - 3, i + 1).map((p) => p.value);
      out.push({ date: ys[i]!.date, value: win.reduce((a, b) => a + b, 0) / win.length });
    }
    return out;
  }, [pick.yoy]);

  const chartData = useMemo(() => {
    const out = [];
    if (pick.yoy.length >= 2) {
      out.push(
        makeSeries(fromDatedPoints(pick.yoy, parseSeriesDate), {
          id: "gdpYoy",
          label: labels?.legendYoy ?? "GDP YoY",
          colorKey: "gdpYoy",
          lineWidth: 2,
          /** بدون نقطهٔ داده (به‌درخواست کاربر 2026-09-22: فقط خطوط) */
        }),
      );
    }
    if (pick.qoqSaar.length >= 2) {
      out.push(
        makeSeries(fromDatedPoints(pick.qoqSaar, parseSeriesDate), {
          id: "gdpQoq",
          label: labels?.legendQoq ?? "GDP QoQ (SAAR)",
          colorKey: "gdpQoq",
          lineWidth: 2,
          /** بدون نقطهٔ داده (به‌درخواست کاربر 2026-09-22: فقط خطوط) */
        }),
      );
    }
    if (trendRows.length >= 2) {
      out.push(
        makeSeries(fromDatedPoints(trendRows, parseSeriesDate), {
          id: "trend",
          label: labels?.legendTrend ?? "Trend (4Q)",
          colorKey: "trend",
          lineWidth: 1,
          dashed: true,
        }),
      );
    }
    return out;
  }, [
    pick.yoy,
    pick.qoqSaar,
    trendRows,
    labels?.legendYoy,
    labels?.legendQoq,
    labels?.legendTrend,
  ]);

  /** GAS + شش سیگنال رشد (دامنه — مثل PAS در چارت سیاست پولی). */
  const gas = useMemo(
    () => buildGas({ yoy: pick.yoy, qoqSaar: pick.qoqSaar }),
    [pick.yoy, pick.qoqSaar],
  );
  const signals: ChartSignal[] = useMemo(
    () =>
      growthSignals({
        gas,
        yoy: pick.yoy,
        qoqSaar: pick.qoqSaar,
        origin: { yoy: pick.yoyOrigin, qoq: pick.qoqOrigin, sources: pick.sources },
      }),
    [gas, pick.yoy, pick.qoqSaar, pick.yoyOrigin, pick.qoqOrigin, pick.sources],
  );

  const legend = useMemo(
    () =>
      chartData.map((s, i) => {
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
    [chartData, templateTheme],
  );

  /**
   * ردیف توضیحات — **عیناً مثل دو چارت قبلی**:
   * `As of` (تازه‌ترین فصل رشد) · واحد · Freq · Source · mode (raw/computed).
   */
  /** کادنس مؤثر دادهٔ خط اصلی: فصلی (`Q`) یا **سالانه** (`A` — fallback کشوری) */
  const cadence = pick.yoy.length ? pick.cadence : DEFAULT_CADENCE;
  /**
   * چیدمان: زوم ۳٫۵ سالِ **زمان‌محور** + فضای آیندهٔ **میله‌محور**
   * (فصلی ۴ / سالانه ۱ ⇒ هر دو = یک سال) + محور زمانِ دیدنی.
   */
  const chartLayout = useMemo(
    () => ({ ...GROWTH_CHART_LAYOUT, futureMargin: growthFutureMarginBars(cadence) }),
    [cadence],
  );

  const asOf = refDate;
  const meta = (
    <>
      <span>
        {labels?.asOf ?? "As of"}:{" "}
        <span className="font-medium text-foreground">
          {asOf ? formatSeriesDate(asOf, cadence, locale) : "—"}
        </span>
      </span>
      <span>{labels?.unit ?? "%"}</span>
      <span title={`effective cadence: ${cadence}`}>
        {labels?.frequency ?? "Freq"}: {cadence}
      </span>
      <span>{labels?.source ?? "Source"}: OECD · FRED · Eurostat</span>
      <span
        className="rounded bg-surface-2 px-1.5 py-0.5"
        title={
          `yoy=${pick.yoyOrigin} · qoq=${pick.qoqOrigin}` +
          (pick.sources.length ? ` · ${pick.sources.join(" , ")}` : "")
        }
      >
        {pick.yoyOrigin === "derived" || pick.qoqOrigin === "derived"
          ? `${labels?.modeComputed ?? "computed"} (سطح/زنجیرهٔ QoQ)`
          : (labels?.modeRaw ?? "precomputed (raw)")}
      </span>
    </>
  );

  const hasData = chartData.length > 0;

  return (
    <div
      data-growth-yoy={pick.yoyOrigin}
      data-growth-qoq={pick.qoqOrigin}
      data-growth-sources={pick.sources.join(",")}
      /* v3: نسخهٔ قرارداد/ریاضی/سیاست «بدون داده» — قابل‌بازرسی در SSR */
      data-spec-version={CHART_SPEC_VERSION}
      data-math-version={MATH_VERSIONS.growth}
      data-missing-policy="na"
      /* 🔎 نشانگرهای تشخیصی: زوم و فضای آیندهٔ اعمال‌شده (برای تست بدون مرورگر) */
      data-growth-zoom={GROWTH_ZOOM}
      data-growth-future-margin={String(growthFutureMarginBars(cadence))}
      data-growth-cadence={cadence}
      data-growth-annual-fallback={pick.annualFallback ? "1" : "0"}
      data-growth-time-visible="1"
      data-points={chartData.map((s) => `${s.id}:${s.points?.length ?? 0}`).join(",")}
      data-gas={
        gas
          ? `${gas.glyph}|${gas.stability ?? "—"}|${gas.gftLevel}|${gas.count}|${gas.effectTone}`
          : "none"
      }
      className={className}
    >
      <ChartFrame
        title={labels?.title ?? "GDP Growth"}
        meta={meta}
        right={right}
        legend={legend}
        state={hasData ? "ready" : "empty"}
        height={height}
        emptyText={labels?.empty ?? "No GDP growth data for this country"}
        errorText={labels?.error ?? "Failed to load"}
      >
        <BaseChart
          data={chartData}
          themeName={GROWTH_TEMPLATE_THEME}
          /* چیدمان صریح چارت فصلی: زوم ۳٫۵ سال + یک سال فضای خالی + محور زمان */
          layout={chartLayout}
          /* سیگنال‌ها داده‌محور از دامنه (مثل PAS)؛ ids/استایل از تم */
          signals={{ custom: signals }}
          height={height}
          locale={locale}
          priceFormat="percent"
          labels={{ empty: "—", error: labels?.error ?? "chart error" }}
          /* v3: قالب‌های ترجمهٔ tooltipها (دادهٔ سریالایزپذیر از سرور) */
          signalHints={labels?.signalHints}
          deps={[pick.sources.join(","), country ?? "", asOf]}
        >
          {/* نام کشور داخل چارت — عیناً مثل دو چارت قبلی */}
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