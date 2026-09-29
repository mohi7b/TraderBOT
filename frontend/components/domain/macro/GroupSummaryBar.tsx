import { getTranslations } from "next-intl/server";
import { Card } from "@/components/base/Card";
import { StatTile, type DeltaTone } from "@/components/base/StatTile";
import { formatPercent, formatSeriesDate } from "@/lib/format";
import type { GlobalTrend, GroupSummary } from "@/lib/types/series";

/**
 * GroupSummaryBar — نوار خلاصهٔ یک گروه ماکرو (از فیلد `summary` بکاند).
 * Domain Macro است (نه Base)، چون معنای «خوب/بد» برای تورم/رشد را می‌داند.
 *
 * رنگ روند کلی:
 *  - heating  → وابسته به دامنه (تورم = بد، رشد = خوب)
 *  - cooling  → برعکس
 *  - stable/neutral → خنثی
 * برای همین یک prop اختیاری `trendTone` گرفته می‌شود؛ پیش‌فرض خنثی.
 */
const TREND_TONE: Record<
  GlobalTrend,
  "rising" | "falling" | "neutral"
> = {
  heating: "rising",
  cooling: "falling",
  stable: "neutral",
  mixed: "neutral",
};

export async function GroupSummaryBar({
  summary,
  locale,
  title,
  /**
   * تعیین معنا: آیا heating «خوب» است؟
   * پیش‌فرض: خنثی (هیچ‌کدام). صفحهٔ ماکرو بر اساس گروه تصمیم می‌گیرد.
   */
  heatingIsGood,
}: {
  summary: GroupSummary;
  locale: string;
  title?: string;
  heatingIsGood?: boolean;
}) {
  const t = await getTranslations("macro");

  const trendLabel = t(`summary.trend.${summary.global_trend}` as const);

  // رنگ با توجه به معنای دامنه
  let tone: DeltaTone = "neutral";
  const dir = TREND_TONE[summary.global_trend];
  if (dir === "rising" && heatingIsGood !== undefined) {
    tone = heatingIsGood ? "pos" : "neg";
  } else if (dir === "falling" && heatingIsGood !== undefined) {
    tone = heatingIsGood ? "neg" : "pos";
  }

  const toneClass =
    tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-muted";

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {title ? (
            <span className="text-sm font-semibold">{title}</span>
          ) : null}
          <span className="text-xs text-muted">{t("summary.title")}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted">{t("summary.global_trend")}</span>
          <span className={`text-sm font-semibold ${toneClass}`}>
            {trendLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label={t("summary.rising")}
          value={summary.rising}
          deltaTone="pos"
        />
        <StatTile
          label={t("summary.falling")}
          value={summary.falling}
          deltaTone="neg"
        />
        <StatTile
          label={t("summary.flat")}
          value={summary.flat}
          deltaTone="neutral"
        />
        <StatTile
          label={t("summary.avg_yoy")}
          value={formatPercent(summary.avg_yoy, locale, 1)}
        />
        <StatTile
          label={t("summary.avg_mom")}
          value={formatPercent(summary.avg_mom, locale, 1)}
        />
        <StatTile
          label={t("summary.series_count")}
          value={summary.coverage.series}
          footer={`${t("summary.as_of")}: ${
            summary.coverage.as_of
              ? formatSeriesDate(summary.coverage.as_of, undefined, locale)
              : "—"
          }`}
        />
      </div>
    </Card>
  );
}
