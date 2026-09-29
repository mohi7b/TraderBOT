/**
 * themeCompleteness — گارانتی سختِ کاملیت تم‌ها (بازبینی هفدهم)
 * frontend/lib/chart/themeCompleteness.ts
 * ============================================================
 * ولیدیتور موجود فقط در dev و فقط بخشی از کلیدها را هشدار می‌دهد ✗. این ماژول
 * برای ۷ تم خانوادهٔ شهریور (base · default · ۵ نسخه) همهٔ اجزای ضروری چارت را
 * بررسی می‌کند ✓ و نتیجه در SSR منتشر می‌شود ⇒ تم ناقص فوراً در CI دیده می‌شود.
 */
import { getThemePreset, getThemeSpec, THEME_REGISTRY } from "./themePresets";

const IDS = [
  "shahrivar_base",
  "shahrivar_default",
  "shahrivar_mobile",
  "shahrivar_tablet",
  "shahrivar_desktop",
  "shahrivar_ultrawide",
  "shahrivar_tv",
] as const;

const PALETTE_KEYS = [
  "background", "surface", "text", "textMuted", "grid", "axis", "border", "crosshair",
  "tooltipBg", "tooltipBorder", "tooltipText", "pos", "neg", "warn", "neutral",
] as const;

const SLOT_KEYS = [
  "candleUp", "candleDown", "wickUp", "wickDown", "volumeUp", "volumeDown",
  "emaFast", "smaSlow", "signalPos", "signalNeg", "signalWarn", "signalInfo", "signalNeutral",
] as const;

const BANNED = ["anchorRatio", "rightOffsetBase", "chartViewportRatio", "heightRule"];

/** بررسی کاملیت — خالی = سالم. */
export function themeCompletenessSelfTest(): string[] {
  const errs: string[] = [];
  for (const id of IDS) {
    if (!THEME_REGISTRY[id]) {
      errs.push(`تم «${id}» در رجیستری نیست ✗`);
      continue;
    }
    const resolved = getThemePreset(id);
    const spec = getThemeSpec(id);
    for (const k of PALETTE_KEYS) {
      if (!resolved.palette[k]) errs.push(`«${id}»: palette.${k} خالی است ✗`);
    }
    if (!resolved.palette.series?.length || resolved.palette.series.length < 2) {
      errs.push(`«${id}»: palette.series باید ≥ ۲ رنگ باشد ✗`);
    }
    for (const k of SLOT_KEYS) {
      if (!resolved.palette.slots[k]) errs.push(`«${id}»: slots.${k} تعریف نشده ✗`);
    }
    if (!(resolved.fontSize > 0) || !resolved.fontFamily) errs.push(`«${id}»: typography ناقص ✗`);
    const ly = spec?.layout;
    if (!ly) {
      errs.push(`«${id}»: layout ندارد ✗`);
      continue;
    }
    if (!ly.zoom) errs.push(`«${id}»: zoom ندارد ✗`);
    if (typeof ly.futureMargin !== "number") errs.push(`«${id}»: futureMargin ندارد ✗`);
    if (!ly.grid) errs.push(`«${id}»: grid ندارد ✗`);
    if (!ly.panes?.volume || ly.panes.volume <= 0 || ly.panes.volume > 0.5) {
      errs.push(`«${id}»: panes.volume نامعتبر ✗`);
    }
    if (!ly.scaleMargins) errs.push(`«${id}»: scaleMargins ندارد ✗`);
    /**
     * این ۴ مورد **اسکرینی**اند (از `screenLayoutOf(cls)` می‌آیند ✓) پس فقط برای
     * ۵ تمِ اسکرینی الزامی‌اند ✓ — تم پایه/default طبیعتاً ندارندشان ✓.
     */
    const screenScoped = !(id === "shahrivar_base" || id === "shahrivar_default");
    if (screenScoped) {
      if (!ly.timeScale?.barSpacing || !ly.timeScale?.minBarSpacing) {
        errs.push(`«${id}»: timeScale/barSpacing ندارد ✗`);
      }
      if (!ly.series?.thickness) errs.push(`«${id}»: series.thickness ندارد ✗`);
      if (typeof ly.legendRows !== "number" || !ly.header) {
        errs.push(`«${id}»: legend/header ناقص ✗`);
      }
      if (!ly.dprCap) errs.push(`«${id}»: dprCap ندارد ✗`);
    }
    const raw = JSON.stringify(spec);
    for (const b of BANNED) {
      if (raw.includes(b)) errs.push(`«${id}»: پارامتر ممنوع «${b}» ✗`);
    }
  }
  return errs;
}
