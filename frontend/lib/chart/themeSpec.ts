/**
 * ============================================================
 * Theme Spec — نرمال‌سازی و اعتبارسنجی «قالب تم»
 * frontend/lib/chart/themeSpec.ts
 * ============================================================
 * چرا این فایل لازم است؟
 *   نویسندهٔ تم نباید بداند رنگ «نوار هدف» در `slots.targetBand` است،
 *   نه بداند `series` آرایه است نه آبجکت، نه ۲۲ فیلد پالت را دستی پر کند.
 *   او فقط رنگ‌های معنایی را در قالب سبک می‌نویسد؛ این‌جا:
 *
 *     ۱) ChartThemePaletteInput → Partial<ChartPalette> (+ گسترش به slots)
 *     ۲) scaleMargins (۰..۱) → priceScale.top/bottom
 *     ۳) ارجاع رنگ `"slot:<name>"` → رنگ واقعی تم
 *     ۴) validateThemeSpec: هشدار صریح به‌جای «خرابیِ بی‌صدا»
 * ============================================================
 */
import type {
  ChartLayout,
  ChartLayoutPartial,
  ChartPalette,
  ChartTheme,
  ChartThemePaletteInput,
  ChartThemeSpec,
} from "./types";
import { SIGNAL_LIBRARY } from "./signals";

// ------------------------------------------------------------------
// ۱) نرمال‌سازی پالت نویسنده → پالت موتور
// ------------------------------------------------------------------
/** کلیدهایی که «رنگ پالت» هستند؛ بقیهٔ کلیدهای رشته‌ای به اسلات می‌روند. */
const PALETTE_KEYS: ReadonlySet<string> = new Set([
  "background",
  "surface",
  "text",
  "textMuted",
  "grid",
  "axis",
  "border",
  "crosshair",
  "tooltipBg",
  "tooltipBorder",
  "tooltipText",
  "pos",
  "neg",
  "warn",
  "neutral",
]);

export type NormalizedPalette = Partial<Omit<ChartPalette, "slots">> & {
  slots: Record<string, string>;
};

/**
 * قالب سبک → پالت.
 *   · `series` آرایه  → palette.series
 *   · `series` آبجکت  → اسلات‌ها (`{ headline, core, annualized3m }`)
 *   · `targetBand` و هر کلید معنایی دیگر → اسلات
 *   · `slots`         → اسلات‌ها (اولویت نهایی)
 */
export function normalizePaletteInput(input?: ChartThemePaletteInput): NormalizedPalette {
  const palette: Record<string, unknown> = {};
  const slots: Record<string, string> = {};
  if (!input) return { slots };

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;

    if (key === "slots") {
      for (const [k, v] of Object.entries(value as Record<string, string>)) {
        if (typeof v === "string" && v.trim()) slots[k] = v;
      }
      continue;
    }

    if (key === "series") {
      if (Array.isArray(value)) {
        if (value.length) palette.series = value as string[];
      } else if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, string>)) {
          if (typeof v === "string" && v.trim()) slots[k] = v;
        }
      }
      continue;
    }

    if (typeof value !== "string") {
      palette[key] = value;
      continue;
    }
    if (PALETTE_KEYS.has(key)) palette[key] = value;
    else if (value.trim()) slots[key] = value; // targetBand · projection · signalPos · …
  }

  return { ...(palette as Partial<Omit<ChartPalette, "slots">>), slots };
}

// ------------------------------------------------------------------
// ۲) نرمال‌سازی چینش (میانبر scaleMargins → priceScale)
// ------------------------------------------------------------------
const clampMargin = (v: number) => Math.max(0, Math.min(0.5, Number.isFinite(v) ? v : 0));

export function normalizeLayoutSpec(spec?: ChartLayoutPartial): ChartLayoutPartial {
  if (!spec) return {};
  const { scaleMargins, ...rest } = spec;
  if (!scaleMargins) return { ...rest };
  const priceScale: Partial<ChartLayout["priceScale"]> = { ...(rest.priceScale ?? {}) };
  if (scaleMargins.top !== undefined) priceScale.top = clampMargin(scaleMargins.top);
  if (scaleMargins.bottom !== undefined) priceScale.bottom = clampMargin(scaleMargins.bottom);
  return { ...rest, priceScale };
}

// ------------------------------------------------------------------
// ۳) ارجاع رنگ: "#hex" · "slot:<name>" · نام کلید پالت
// ------------------------------------------------------------------
export function resolveColorRef(theme: ChartTheme, ref?: string | null): string | undefined {
  if (!ref) return undefined;
  const v = ref.trim();
  if (v.startsWith("slot:")) {
    const name = v.slice(5).trim();
    if (!name) return undefined;
    if (theme.palette.slots[name]) return theme.palette.slots[name]!;
    const direct = (theme.palette as unknown as Record<string, unknown>)[name];
    return typeof direct === "string" ? direct : undefined;
  }
  return v;
}

// ------------------------------------------------------------------
// ۴) اعتبارسنجی (dev) — «ضدِ خرابیِ بی‌صدا»
// ------------------------------------------------------------------
const REQUIRED_PALETTE_KEYS: readonly (keyof ChartPalette)[] = [
  "background",
  "surface",
  "text",
  "textMuted",
  "grid",
  "axis",
  "border",
  "crosshair",
  "tooltipBg",
  "tooltipBorder",
  "tooltipText",
  "pos",
  "neg",
  "warn",
  "neutral",
];

const SLOTS_EXPECTED = ["headline", "core", "targetBand", "signalPos", "signalNeg"] as const;

/** بررسی قالب تم پس از resolve → فهرست هشدارها (خالی = سالم). */
export function validateThemeSpec(spec: ChartThemeSpec, resolved: ChartTheme): string[] {
  const warnings: string[] = [];

  // نام‌گذاری: <family>_<mode>
  if (spec.name.includes("-")) warnings.push(`نام تم باید snake_case باشد: "${spec.name}"`);
  if (spec.family && spec.mode && spec.mode !== "any" && !spec.name.startsWith(spec.family)) {
    warnings.push(
      `نام "${spec.name}" با family="${spec.family}" هم‌خوان نیست (انتظار: ${spec.family}_${spec.mode})`,
    );
  }

  // پالت پس از ارث‌بری
  for (const key of REQUIRED_PALETTE_KEYS) {
    if (!resolved.palette[key]) warnings.push(`palette.${key} خالی است`);
  }
  if (!resolved.palette.series?.length) warnings.push("palette.series خالی است");
  else if (resolved.palette.series.length < 2) warnings.push("palette.series باید حداقل ۲ رنگ داشته باشد");

  for (const s of SLOTS_EXPECTED) {
    if (!resolved.palette.slots[s]) warnings.push(`slots.${s} تعریف نشده (نقاشی مربوطه بی‌رنگ می‌ماند)`);
  }

  // چینش: scaleMargins خارج از بازهٔ مجاز
  const sm = spec.layout?.scaleMargins;
  if (sm) {
    for (const [k, v] of Object.entries(sm)) {
      if (v !== undefined && (v < 0 || v > 0.5)) {
        warnings.push(`layout.scaleMargins.${k}=${v} خارج از بازهٔ ۰..۰٫۵`);
      }
    }
  }

  // سیگنال‌ها: شناسهٔ ناموجود = حذف بی‌صدا
  for (const id of spec.signals?.ids ?? []) {
    if (!SIGNAL_LIBRARY[id]) warnings.push(`سیگنال ناموجود در SIGNAL_LIBRARY: "${id}"`);
  }

  // متادیتا
  const m = spec.meta?.manifest;
  if (!m) warnings.push("meta.manifest تعریف نشده (نسخه/نویسنده ثبت نمی‌شود)");
  else {
    if (!m.version) warnings.push("manifest.version خالی است");
    if (m.name && spec.name && m.name !== spec.name && m.name !== spec.family) {
      warnings.push(
        `manifest.name="${m.name}" با spec.name="${spec.name}"${spec.family ? ` و family="${spec.family}"` : ""} یکی نیست`,
      );
    }
    if (m.family && spec.family && m.family !== spec.family) {
      warnings.push(`manifest.family="${m.family}" با spec.family="${spec.family}" یکی نیست`);
    }
    if (m.description_key && !m.description_key.includes(".")) {
      warnings.push("manifest.description_key باید کلید i18n باشد (مثل themeNames.<family>.description)");
    }
  }

  return warnings;
}

/** ثبت هشدارها در کنسول — فقط در توسعه (در پروداکشن بی‌صدا). */
export function warnThemeSpec(spec: ChartThemeSpec, resolved: ChartTheme): void {
  if (process.env.NODE_ENV === "production") return;
  // تم‌های پایه/قدیمی (بدون family و بدون meta) اعتبارسنجی نمی‌شوند.
  if (!spec.family && !spec.meta) return;
  for (const w of validateThemeSpec(spec, resolved)) {
    console.warn(`[chart-theme:${spec.name}] ${w}`);
  }
}

