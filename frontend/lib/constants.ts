/**
 * ثابت‌های سراسری پروژه فرانت‌اند.
 * هیچ آدرس بک‌اندی اینجا hardcode نمی‌شود (فقط سمت سرور، در route handler).
 */

export const LOCALES = ["fa", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const DIR: Record<Locale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
};

/** دامنه‌های ثبت‌شده برای داشبورد (Phase-based). */
export const DOMAINS = [
  "macro",
  "markets",
  "energy",
  "crypto",
  "trading",
  "risk",
] as const;

export type Domain = (typeof DOMAINS)[number];
