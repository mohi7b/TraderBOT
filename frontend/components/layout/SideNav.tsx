"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard/macro", key: "macro" },
  { href: "/dashboard/markets", key: "markets" },
  { href: "/dashboard/energy", key: "energy" },
  { href: "/dashboard/crypto", key: "crypto" },
  { href: "/dashboard/trading", key: "trading" },
  { href: "/dashboard/risk", key: "risk" },
] as const;

export function SideNav() {
  const t = useTranslations("common.nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {ITEMS.map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-surface-2 text-foreground font-medium"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}
