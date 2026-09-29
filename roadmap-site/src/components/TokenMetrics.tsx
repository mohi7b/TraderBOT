import BrandMark from "@/components/BrandMark";
import TokenIcon from "@/components/TokenIcon";
import { siteConfig } from "@/config/site";
import type { TokenMetricsContent } from "@/utils/roadmap-data";

interface TokenMetricsProps {
  metrics: TokenMetricsContent;
  /** Localized "planned" marker, shown so figures are not read as live data. */
  plannedLabel?: string;
}

/**
 * Supply metrics for the token summary: a two-row table (the pre-supply row gets
 * the gold + glow emphasis), the 1 → 10 conversion graphic, the current-stage
 * block and the neon purchase call to action.
 */
export default function TokenMetrics({ metrics, plannedLabel }: TokenMetricsProps) {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-950/60 p-4 md:p-5">
      {plannedLabel ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/5 px-3 py-1 text-[0.7rem] font-semibold tracking-wide text-amber-200/90 uppercase">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
          {plannedLabel}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-xs">
            <thead className="text-[0.68rem] tracking-wide text-gray-400 uppercase">
              <tr>
                <th scope="col" className="px-2.5 py-2 text-start font-semibold">
                  {metrics.columnLabels.label}
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-semibold">
                  {metrics.columnLabels.total}
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-semibold">
                  {metrics.columnLabels.released}
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-semibold">
                  {metrics.columnLabels.percent}
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-semibold">
                  {metrics.columnLabels.multiplier}
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.highlight
                      ? "border-t border-amber-400/25 bg-amber-400/5"
                      : "border-t border-gray-800"
                  }
                >
                  <th scope="row" className="px-2.5 py-2.5 text-start font-medium text-white">
                    {row.label}
                  </th>
                  <td dir="ltr" className="px-2.5 py-2.5 tabular-nums text-gray-300">
                    {row.total}
                  </td>
                  <td dir="ltr" className="px-2.5 py-2.5 tabular-nums text-gray-300">
                    {row.released}
                  </td>
                  <td dir="ltr" className="px-2.5 py-2.5 tabular-nums text-gray-300">
                    {row.percent}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span
                      dir="ltr"
                      className={
                        row.highlight
                          ? "inline-flex rounded-md border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
                          : "text-gray-300"
                      }
                    >
                      {row.multiplier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-4">
          <div dir="ltr" className="flex items-center gap-3">
            <span className="flex flex-col items-center gap-1.5 text-cyan-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
                <TokenIcon name="seed" className="h-5 w-5" />
              </span>
              <span className="text-base font-bold tabular-nums">{metrics.conversion.fromValue}</span>
            </span>

            <span aria-hidden className="text-xl text-cyan-300/70">
              =
            </span>

            <span className="flex flex-col items-center gap-1.5 text-cyan-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
                <TokenIcon name="coins" className="h-5 w-5" />
              </span>
              <span className="text-base font-bold tabular-nums">{metrics.conversion.toValue}</span>
            </span>
          </div>

          <p className="text-center text-[0.8rem] font-medium text-cyan-200">{metrics.conversion.caption}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[0.68rem] font-semibold tracking-wide text-gray-400 uppercase">
            {metrics.stage.title}
          </p>
          <p className="text-xs font-semibold text-cyan-200">{metrics.stage.value}</p>
        </div>

        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {metrics.stage.items.map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-800/70 bg-gray-950/60 px-3 py-2">
              <dt className="text-[0.68rem] text-gray-500">{item.label}</dt>
              <dd dir="ltr" className="mt-0.5 text-base font-semibold tabular-nums text-white">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <BrandMark
          size={112}
          decorative
          className="h-20 w-20 drop-shadow-[0_0_30px_rgba(34,211,238,0.3)] md:h-24 md:w-24"
        />
        <a
          href={siteConfig.buyTokenUrl}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-base font-bold text-white ring-1 ring-blue-400/50 shadow-[0_0_30px_rgba(37,99,235,0.55)] transition hover:bg-blue-500 hover:shadow-[0_0_48px_rgba(59,130,246,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          {metrics.cta.label}
        </a>
        <p className="max-w-md text-[0.7rem] text-gray-500">{metrics.cta.note}</p>
      </div>
    </div>
  );
}
