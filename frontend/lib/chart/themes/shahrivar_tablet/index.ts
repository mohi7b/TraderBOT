/**
 * shahrivar_tablet — قالب «شهریور — تبلت» (ShahrivarTablet)
 * frontend/lib/chart/themes/shahrivar_tablet/index.ts
 * ============================================================
 * ارث‌بری صریح از `shahrivar_base`: این فایل فقط تفاوت‌های نمایشیِ همین نسخه را
 * override می‌کند (هیچ پالت/چیدمانی از صفر ساخته نمی‌شود).
 * اعداد از `screenProfiles.ts` (تک‌منبع).
 * محل چارت/ارتفاع در تم نیستند (معماری دروازه + آرگومان صفحه).
 */
import { screenThemeOf } from "../../screenProfiles";
import { shahrivar_base } from "../shahrivar_base";

const CLS = "tablet" as const;

export const shahrivar_tablet = screenThemeOf(CLS, shahrivar_base);
