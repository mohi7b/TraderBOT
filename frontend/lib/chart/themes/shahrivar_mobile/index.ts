/**
 * shahrivar_mobile — قالب «شهریور — موبایل» (ShahrivarMobile)
 * frontend/lib/chart/themes/shahrivar_mobile/index.ts
 * ============================================================
 * ارث‌بری صریح از `shahrivar_base`: این فایل فقط تفاوت‌های نمایشیِ همین نسخه را
 * override می‌کند (هیچ پالت/چیدمانی از صفر ساخته نمی‌شود).
 * اعداد از `screenProfiles.ts` (تک‌منبع).
 * محل چارت/ارتفاع در تم نیستند (معماری دروازه + آرگومان صفحه).
 */
import { screenThemeOf } from "../../screenProfiles";
import { shahrivar_base } from "../shahrivar_base";

const CLS = "mobile" as const;

export const shahrivar_mobile = screenThemeOf(CLS, shahrivar_base);
