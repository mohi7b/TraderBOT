import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DEFAULT_LOCALE, getRoadmap, isLocale } from "@/utils/roadmap-data";
import type { Direction, Locale, RoadmapContent } from "@/utils/roadmap-data";

interface LocaleContextValue {
  /** Active locale code. */
  locale: Locale;
  /** Fully localized, validated roadmap content for the active locale. */
  content: RoadmapContent;
  /** Text direction of the active locale. */
  dir: Direction;
  /** Switch the active locale. */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const content = useMemo(() => getRoadmap(locale), [locale]);

  // <html lang> follows the active locale. The text direction is applied to the
  // content wrapper (<main dir=...>) rather than to <html>, so the sticky header
  // and its navigation stay LTR and left aligned even in RTL languages (fa, ar).
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(isLocale(next) ? next : DEFAULT_LOCALE);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, content, dir: content.dir, setLocale }),
    [locale, content, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return context;
}
