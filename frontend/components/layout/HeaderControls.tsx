"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

export function HeaderControls() {
  const t = useTranslations("common.actions");
  const { theme, toggle } = useTheme();
  const locale = useLocale();
  const [pending, start] = useTransition();

  function switchLocale() {
    const next = locale === "fa" ? "en" : "fa";
    document.cookie = `locale=${next}; path=/; max-age=31536000`;
    start(() => window.location.reload());
  }

  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-2 transition-colors";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={switchLocale}
        disabled={pending}
        aria-label={t("toggleLanguage")}
        title={t("toggleLanguage")}
      >
        <Languages className="h-4 w-4" />
        <span className="sr-only">{t("toggleLanguage")}</span>
      </button>
      <button
        type="button"
        className={cn(btn)}
        onClick={toggle}
        aria-label={t("toggleTheme")}
        title={t("toggleTheme")}
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span className="sr-only">{t("toggleTheme")}</span>
      </button>
    </div>
  );
}
