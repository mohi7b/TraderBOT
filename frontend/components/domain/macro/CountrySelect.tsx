"use client";

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CountryOption } from "@/lib/macro/countries";

/**
 * CountrySelect — انتخاب کشور به‌صورت داینامیک (بدون لیست ثابت).
 * با تغییر، پارامتر ?country= را در URL عوض می‌کند تا صفحه (RSC) دوباره fetch کند.
 */
export function CountrySelect({
  countries,
  value,
  includeKey,
}: {
  countries: CountryOption[];
  value: string;
  /** پارامتر گروه را نگه دار (macro) */
  includeKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = new URLSearchParams(params.toString());
      next.set("country", e.target.value);
      if (includeKey) next.set("group", includeKey);
      start(() => router.replace(`${pathname}?${next.toString()}`));
    },
    [router, pathname, params, includeKey, start],
  );

  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted">Country</span>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
      >
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
    </label>
  );
}
