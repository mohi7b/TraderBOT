/**
 * ============================================================
 * Macro calendar — ساختار تقویم اقتصادی
 * frontend/lib/macro/calendar.ts
 * ============================================================
 * بک‌اند فعلاً رویداد ندارد؛ این ساختار آماده است تا بعداً پر شود.
 * هیچ‌جای دیگر تعریف تکراری نمی‌شود.
 * ============================================================
 */

export type EventImportance = "low" | "medium" | "high";

export interface MacroEvent {
  /** UTC: "YYYY-MM-DD HH:mm" */
  date: string;
  country: string;
  event: string;
  importance: EventImportance;
  forecast?: number;
  previous?: number;
  actual?: number;
}

/** منبع خالی فعلی — بعداً از API می‌آید. */
export const EMPTY_EVENTS: MacroEvent[] = [];

/**
 * فیلتر رویدادهای یک کشور در بازهٔ زمانی.
 * (خالص؛ ورودی هر آرایهٔ رویدادی می‌دهد.)
 */
export function eventsForCountry(
  events: MacroEvent[],
  country: string,
  fromMs: number,
  toMs: number,
): MacroEvent[] {
  return events.filter((e) => {
    if (country && e.country.toUpperCase() !== country.toUpperCase())
      return false;
    const t = new Date(e.date).getTime();
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });
}
