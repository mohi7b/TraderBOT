import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/constants";

/**
 * next-intl request config (App Router / RSC).
 * زبان از کوکی خوانده می‌شود (بدون prefix در URL — ساده و تمیز).
 */
export default getRequestConfig(async () => {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const raw = store.get("locale")?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw ?? "")
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  const [common, macro, themeNames] = await Promise.all([
    import(`../messages/common.${locale}.json`).then((m) => m.default),
    import(`../messages/macro.${locale}.json`).then((m) => m.default),
    import(`../messages/themeNames.${locale}.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: {
      common,
      macro,
      themeNames,
    },
  };
});
