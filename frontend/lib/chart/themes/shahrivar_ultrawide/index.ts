/**
 * shahrivar_ultrawide — قالب «شهریور — اولتراواید» (ShahrivarUltraWide)
 * frontend/lib/chart/themes/shahrivar_ultrawide/index.ts
 * ============================================================
 * ارث‌بری صریح از `shahrivar_base`: این فایل فقط تفاوت‌های نمایشیِ همین نسخه را
 * override می‌کند (هیچ پالت/چیدمانی از صفر ساخته نمی‌شود).
 * اعداد از `screenProfiles.ts` (تک‌منبع).
 * محل چارت/ارتفاع در تم نیستند (معماری دروازه + آرگومان صفحه).
 */
import { screenThemeOf } from "../../screenProfiles";
import { shahrivar_base } from "../shahrivar_base";

const CLS = "ultrawide" as const;

export const shahrivar_ultrawide = screenThemeOf(CLS, shahrivar_base);
