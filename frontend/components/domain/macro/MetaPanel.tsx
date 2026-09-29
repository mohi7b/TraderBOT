"use client";

import type { CountryMeta } from "@/lib/types/series";
import { formatTarget } from "@/lib/macro/targets";

/**
 * MetaPanel — نوار بالای چارت: هدف تورمی کشور (chart02).
 * ❗ هدف روی چارت رسم نمی‌شود؛ فقط اینجا نمایش داده می‌شود.
 */
export function MetaPanel({
  countryName,
  meta,
  labels,
}: {
  countryName?: string;
  meta: CountryMeta | null;
  labels?: { target?: string; country?: string };
}) {
  const tgt = formatTarget(
    meta?.inflation_target_low ?? null,
    meta?.inflation_target_high ?? null,
  );
  const isRange =
    meta?.inflation_target_low != null &&
    meta?.inflation_target_high != null &&
    meta.inflation_target_low !== meta.inflation_target_high;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
      {countryName ? (
        <span className="text-muted">
          {labels?.country ?? "Country"}:{" "}
          <span className="font-medium text-foreground">
            {countryName} ({meta?.country ?? ""})
          </span>
        </span>
      ) : null}
      <span className="text-muted">
        {labels?.target ?? "Inflation Target"}:{" "}
        <span className="font-medium text-foreground">{tgt}</span>
        {isRange ? (
          <span className="ms-1 text-muted">(band)</span>
        ) : null}
      </span>
    </div>
  );
}
