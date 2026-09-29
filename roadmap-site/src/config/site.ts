import { DEFAULT_LOCALE, LOCALE_LIST, type Locale } from "@/utils/roadmap-data";

/**
 * Site-level configuration for the multilingual roadmap / whitepaper site.
 * The roadmap content itself lives in `src/content/roadmap/<locale>.json`
 * and is generated into `ROADMAP.md` by `npm run roadmap:build`.
 */
export const siteConfig = {
  /** Brand name of the platform (never translated). */
  brand: "RADI",
  /** What the brand stands for. */
  brandExpansion: "Real-time Autonomous Data Intelligence",
  /** Third hero headline line; mirrors `hero.pageName` in the content files. */
  pageName: "The Future Architecture of Trading",
  defaultLocale: DEFAULT_LOCALE as Locale,
  locales: LOCALE_LIST,
  /** Path (relative to the project root) of the generated Markdown whitepaper. */
  roadmapMarkdownFile: "ROADMAP.md",
  /** Source of truth for all localized roadmap content. */
  roadmapContentDir: "src/content/roadmap",
  nav: [
    {
      id: "roadmap",
      href: "#roadmap",
      label: { en: "Roadmap", fa: "نقشهٔ راه", ar: "خارطة الطريق", tr: "Yol Haritası", de: "Roadmap" }
    },
    {
      id: "architecture",
      href: "#architecture",
      label: { en: "Architecture", fa: "معماری", ar: "المعمارية", tr: "Mimari", de: "Architektur" }
    },
    {
      id: "token",
      href: "#token",
      label: { en: "Token", fa: "توکن", ar: "الرمز", tr: "Token", de: "Token" }
    },
    {
      id: "contact",
      href: "#contact",
      label: { en: "Contact", fa: "تماس", ar: "التواصل", tr: "İletişim", de: "Kontakt" }
    }
  ],
  contactEmail: "hello@traderbot.example",
  /**
   * Target of the "Buy Samara token" call to action.
   * TODO: replace with the official RADI wallet / partner-exchange purchase URL
   * once it exists; it currently points at the section itself so the button is
   * never a dead link.
   */
  buyTokenUrl: "#token"
} as const;

export type SiteConfig = typeof siteConfig;

