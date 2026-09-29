/**
 * ============================================================
 * Theme Presets — تم‌های آمادهٔ موتور چارت
 * frontend/lib/chart/themePresets.ts
 * ============================================================
 * هدف: اثبات «ظاهر کاملاً قابل‌تعویض» — یک چارت، چند تم، بدون
 * هیچ تغییری در کد چارت. همهٔ رنگ‌ها فقط داده‌اند.
 *
 * اسلات‌های نام‌دار (`palette.slots`) همان چیزی است که دامنه با
 * `colorKey` صدا می‌زند؛ مثال: headline · core · annualized3m ·
 * target · recession · projection · shock · signalPos · signalNeg
 * ============================================================
 */
import type {
  ChartPalette,
  ChartTheme,
  ChartThemeOverride,
  ChartThemeSpec,
} from "./types";
import { INFLATION_MODERN_DARK, INFLATION_MODERN_LIGHT } from "./themes/inflation_modern";
import { shahrivar } from "./themes/shahrivar";
import { default_chart } from "./themes/default_chart";
import { normalizePaletteInput, warnThemeSpec } from "./themeSpec";

const FONT =
  "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

const SEMANTIC_LIGHT = { pos: "#16a34a", neg: "#dc2626", warn: "#d97706", neutral: "#64748b" };
const SEMANTIC_DARK = { pos: "#34d399", neg: "#f87171", warn: "#fbbf24", neutral: "#94a3b8" };

// ------------------------------------------------------------------
// تم روشن
// ------------------------------------------------------------------
export const LIGHT_PALETTE: ChartPalette = {
  background: "#ffffff",
  surface: "#ffffff",
  text: "#0b1220",
  textMuted: "#6b7488",
  grid: "#eef1f6",
  axis: "#e2e6ee",
  border: "#e2e6ee",
  crosshair: "#94a3b8",

  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e6ee",
  tooltipText: "#0b1220",

  series: ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#0891b2", "#be123c"],

  ...SEMANTIC_LIGHT,

  slots: {
    headline: "#2563eb",
    core: "#d97706",
    annualized3m: "#16a34a",
    target: "#64748b",
    targetBand: "rgba(100,116,139,0.14)",
    recession: "rgba(107,116,136,0.12)",
    projection: "#9333ea",
    shock: "#dc2626",
    eventHigh: "#dc2626",
    eventMedium: "#d97706",
    eventLow: "#0891b2",
    signalPos: "#16a34a",
    signalNeg: "#dc2626",
    signalWarn: "#d97706",
    signalRisk: "#ea580c",
    signalInfo: "#0891b2",
    signalNeutral: "#64748b",
    /** رنگ متن مقدار بر پایهٔ جهت (سه حالت) — در تم روشن: تُن‌های تیره */
    valueUp: "#15803d",
    valueDown: "#dc2626",
    valueFlat: "#475569",
    badgeBg: "rgba(15,23,42,0.05)",
    badgeBorder: "rgba(15,23,42,0.12)",
  },
};

// ------------------------------------------------------------------
// تم تیره
// ------------------------------------------------------------------
export const DARK_PALETTE: ChartPalette = {
  background: "#111826",
  surface: "#111826",
  text: "#e7ecf5",
  textMuted: "#94a3b8",
  grid: "#1c2637",
  axis: "#253046",
  border: "#253046",
  crosshair: "#64748b",

  tooltipBg: "#161f31",
  tooltipBorder: "#253046",
  tooltipText: "#e7ecf5",

  series: ["#60a5fa", "#fbbf24", "#34d399", "#c084fc", "#22d3ee", "#fb7185"],

  ...SEMANTIC_DARK,

  slots: {
    headline: "#60a5fa",
    core: "#fbbf24",
    annualized3m: "#34d399",
    target: "#94a3b8",
    targetBand: "rgba(148,163,184,0.14)",
    recession: "rgba(148,163,184,0.10)",
    projection: "#c084fc",
    shock: "#f87171",
    eventHigh: "#f87171",
    eventMedium: "#fbbf24",
    eventLow: "#22d3ee",
    signalPos: "#34d399",
    signalNeg: "#f87171",
    signalWarn: "#fbbf24",
    signalRisk: "#fb923c",
    signalInfo: "#22d3ee",
    signalNeutral: "#94a3b8",
    /** رنگ متن مقدار بر پایهٔ جهت (سه حالت) — سبز/قرمز/سفیدِ خالص */
    valueUp: "#22c55e",
    valueDown: "#ff3b30",
    valueFlat: "#e2e8f0",
    badgeBg: "rgba(226,232,240,0.08)",
    badgeBorder: "rgba(226,232,240,0.16)",
  },
};


// ------------------------------------------------------------------
// تم Terminal — کنتراست بالا برای میز معاملات
// ------------------------------------------------------------------
export const TERMINAL_PALETTE: ChartPalette = {
  background: "#000000",
  surface: "#050505",
  text: "#d6ffe0",
  textMuted: "#5f8f6f",
  grid: "#0d1a10",
  axis: "#123018",
  border: "#1a3a22",
  crosshair: "#39ff6a",

  tooltipBg: "#04120a",
  tooltipBorder: "#1a3a22",
  tooltipText: "#d6ffe0",

  series: ["#39ff6a", "#ffd166", "#4cc9f0", "#ff6b6b", "#c77dff", "#f8f9fa"],

  pos: "#39ff6a",
  neg: "#ff5c5c",
  warn: "#ffd166",
  neutral: "#7a9b84",

  slots: {
    headline: "#39ff6a",
    core: "#ffd166",
    annualized3m: "#4cc9f0",
    target: "#7a9b84",
    targetBand: "rgba(122,155,132,0.16)",
    recession: "rgba(255,92,92,0.10)",
    projection: "#c77dff",
    shock: "#ff5c5c",
    eventHigh: "#ff5c5c",
    eventMedium: "#ffd166",
    eventLow: "#4cc9f0",
    signalPos: "#39ff6a",
    signalNeg: "#ff5c5c",
    signalWarn: "#ffd166",
    signalRisk: "#ff9f1c",
    signalInfo: "#4cc9f0",
    signalNeutral: "#7a9b84",
    /** رنگ متن مقدار بر پایهٔ جهت (سه حالت) — پالت ترمینال */
    valueUp: "#39ff6a",
    valueDown: "#ff5c5c",
    valueFlat: "#d1fae5",
    badgeBg: "rgba(57,255,106,0.08)",
    badgeBorder: "rgba(57,255,106,0.22)",
  },
};

// ------------------------------------------------------------------
// تم Print — تک‌رنگ/چاپی (Proof: ظاهر بدون تغییر داده عوض می‌شود)
// ------------------------------------------------------------------
export const PRINT_PALETTE: ChartPalette = {
  background: "#ffffff",
  surface: "#ffffff",
  text: "#111111",
  textMuted: "#555555",
  grid: "#e5e5e5",
  axis: "#cccccc",
  border: "#cccccc",
  crosshair: "#999999",

  tooltipBg: "#ffffff",
  tooltipBorder: "#cccccc",
  tooltipText: "#111111",

  series: ["#111111", "#666666", "#999999", "#333333"],

  pos: "#111111",
  neg: "#666666",
  warn: "#333333",
  neutral: "#888888",

  slots: {
    headline: "#111111",
    core: "#777777",
    annualized3m: "#aaaaaa",
    target: "#bbbbbb",
    targetBand: "rgba(0,0,0,0.06)",
    recession: "rgba(0,0,0,0.05)",
    projection: "#555555",
    shock: "#000000",
    eventHigh: "#000000",
    eventMedium: "#555555",
    eventLow: "#999999",
    signalPos: "#111111",
    signalNeg: "#666666",
    signalWarn: "#333333",
    signalRisk: "#444444",
    signalInfo: "#777777",
    signalNeutral: "#888888",
    /** رنگ متن مقدار بر پایهٔ جهت (سه حالت) — چاپ سیاه‌وسفید */
    valueUp: "#1f6f3f",
    valueDown: "#8a1f1f",
    valueFlat: "#555555",
    badgeBg: "rgba(0,0,0,0.04)",
    badgeBorder: "rgba(0,0,0,0.15)",
  },
};

// ------------------------------------------------------------------
// رجیستری تم‌ها + ابزارها
// ------------------------------------------------------------------
/**
 * تم‌های پایهٔ تک‌متغیره (کامل) — منبع ارث‌بری تم‌های خانواده‌ای.
 * ⚠️ عمداً جدا از `CHART_THEME_PRESETS` است تا resolve تم‌های جدید
 *    به رجیستریِ در حال ساخت وابسته نشود (ضد دور/ترتیب مقداردهی).
 */
const BASE_THEMES: Record<string, ChartTheme> = {
  light: { name: "light", fontFamily: FONT, fontSize: 11, palette: LIGHT_PALETTE },
  dark: { name: "dark", fontFamily: FONT, fontSize: 11, palette: DARK_PALETTE },
  terminal: {
    name: "terminal",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    palette: TERMINAL_PALETTE,
  },
  print: {
    name: "print",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 11,
    palette: PRINT_PALETTE,
  },
};

/** spec تم‌های پایه (برای یکدست‌بودن رجیستری: همه‌چیز spec است). */
function baseSpec(name: string, mode: "light" | "dark"): ChartThemeSpec {
  const t = BASE_THEMES[name]!;
  return {
    name: t.name,
    mode,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    palette: t.palette,
  };
}

const BASE_SPECS: Record<string, ChartThemeSpec> = {
  light: baseSpec("light", "light"),
  dark: baseSpec("dark", "dark"),
  terminal: baseSpec("terminal", "dark"),
  print: baseSpec("print", "light"),
};

/**
 * رجیستری مرکزی تم‌ها (منبع حقیقت: spec).
 * افزودن تم جدید = یک ورودی همین‌جا (هیچ‌جای دیگر تغییر نمی‌کند).
 */
// ------------------------------------------------------------------
// ⚠️ P4-GROWTH (2026-09-22): قالب «شهریور — رشد اقتصادی»
//    چارت GDP Growth (رشد سالانه/فصلی + سیگنال GAS)
// ------------------------------------------------------------------
import { shahrivar_policy } from "./themes/shahrivar_policy";
import { shahrivar_growth } from "./themes/shahrivar_growth";
import { shahrivar_financial } from "./themes/shahrivar_financial";
import { shahrivar_hist } from "./themes/shahrivar_hist";
/**
 * 🆕 **بازبینی ششم (2026-09-25)** — ۵ نسخهٔ نمایشی خانوادهٔ شهریور ✓
 * (`ShahrivarMobile/Tablet/Desktop/UltraWide/TV` — پارامترها از
 *  `lib/chart/screenProfiles.ts` ✓ · پالت مشترک با `shahrivar_hist` ✓)
 */
import { shahrivar_mobile } from "./themes/shahrivar_mobile";
import { shahrivar_tablet } from "./themes/shahrivar_tablet";
import { shahrivar_desktop } from "./themes/shahrivar_desktop";
import { shahrivar_ultrawide } from "./themes/shahrivar_ultrawide";
import { shahrivar_tv } from "./themes/shahrivar_tv";
/** تم پایهٔ مشترک خانواده (بازبینی هفدهم) */
import { shahrivar_base } from "./themes/shahrivar_base";

/**
 * 🆕 **قالب خنثیِ SSR** (بازبینی سیزدهم ✓): همان قالب پایهٔ شهریور با نام خنثی ✓
 * ⇒ سرور هیچ تنظیم اسکرینی نمی‌دهد ✗ و کلاینت بعد از hydration یک‌بار تم واقعی را می‌گذارد ✓.
 */
export const shahrivar_default: ChartThemeSpec = {
  /** خنثیِ SSR = همان تم پایه (ارث‌بری صریح) */
  ...shahrivar_base,
  name: "shahrivar_default",
  meta: {
    ...shahrivar_base.meta,
    manifest: {
      name: "shahrivar_default",
      family: "shahrivar",
      mode: "dark",
      version: "2.0.0-alpha",
      author: "TraderBOT · ChartEngine V2",
      created: "2026-09-25",
      description_key: "themeNames.shahrivar_default.description",
    },
  },
};

export const THEME_REGISTRY: Record<string, ChartThemeSpec> = {
  ...BASE_SPECS,
  shahrivar_hist: shahrivar_hist,
  /** تم پایهٔ مشترک (مرجع کاملیت) */
  shahrivar_base,
  /** 🆕 خنثیِ SSR ✓ */
  shahrivar_default,
  // 🌐 نسخه‌های نمایشی پنج‌گانه (منبع اعداد: screenProfiles.ts ✓)
  shahrivar_mobile,
  shahrivar_tablet,
  shahrivar_desktop,
  shahrivar_ultrawide,
  shahrivar_tv,
  inflation_modern_dark: INFLATION_MODERN_DARK,
  inflation_modern_light: INFLATION_MODERN_LIGHT,
  // قالب رسمی چارت تورم (2026-09-21)
  shahrivar,
  // قالب چارت «Policy Rate vs CPI» (2026-09-22) — همان ساختار شهریور، پس‌زمینهٔ روشن
  shahrivar_policy,
  // قالب چارت «GDP Growth» (2026-09-22) — همان ساختار، سری اصلی سبز فسفری
  shahrivar_growth,
  // قالب چارت «Financial Conditions» (2026-09-23) — سری اصلی آبی درخشان
  shahrivar_financial,
  // آرشیو ظاهر پیشین چارت تورم — با themeName="default_chart" قابل بازگشت
  default_chart,
};

/** خانواده‌ای که `themeName="auto"` به حالت سایت نگاشت می‌کند. */
export const AUTO_THEME_FAMILY = "inflation_modern";

/**
 * spec → ChartTheme کامل (قرارداد نهایی موتور).
 * ارث‌بری: base → palette/slots → فونت · سپس اعتبارسنجی dev.
 */
export function resolveThemeSpec(spec: ChartThemeSpec): ChartTheme {
  const baseName = spec.base ?? (BASE_THEMES[spec.name] ? spec.name : "dark");
  const base = BASE_THEMES[baseName] ?? BASE_THEMES.dark!;
  const { slots: inputSlots, ...rest } = normalizePaletteInput(spec.palette);
  const theme: ChartTheme = {
    name: spec.name,
    fontFamily: spec.fontFamily ?? base.fontFamily,
    fontSize: spec.fontSize ?? base.fontSize,
    palette: {
      ...base.palette,
      ...rest,
      slots: { ...base.palette.slots, ...inputSlots },
    } as ChartPalette,
  };
  warnThemeSpec(spec, theme);
  return theme;
}

/** تم‌های آمادهٔ resolveشده (light · dark · terminal · print · inflation_modern_*) */
export const CHART_THEME_PRESETS: Record<string, ChartTheme> = Object.fromEntries(
  Object.entries(THEME_REGISTRY).map(([key, spec]) => [key, resolveThemeSpec(spec)]),
);

export const CHART_THEME_NAMES = Object.keys(CHART_THEME_PRESETS);

/** spec خام یک تم (برای خواندن layout/signals تم در موتور). */
export function getThemeSpec(name: string | undefined): ChartThemeSpec | undefined {
  return name ? THEME_REGISTRY[name] : undefined;
}

export function getThemePreset(name: string): ChartTheme {
  const preset = CHART_THEME_PRESETS[name];
  if (preset) return preset;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[chart-theme] تم ثبت‌نشده: "${name}" → dark`);
  }
  return CHART_THEME_PRESETS.dark!;
}

/**
 * نام درخواستی → نام تم موجود.
 *   · "auto" → `<AUTO_THEME_FAMILY>_<mode>` (اگر ثبت شده) وگرنه خودِ mode
 *   · نام ناشناخته → mode (تم فعال سایت) + هشدار در dev
 */
export function resolveThemeName(requested: string | undefined, mode: "light" | "dark"): string {
  if (!requested) return mode;
  if (requested === "auto") {
    const variant = `${AUTO_THEME_FAMILY}_${mode}`;
    return CHART_THEME_PRESETS[variant] ? variant : mode;
  }
  if (CHART_THEME_PRESETS[requested]) return requested;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[chart-theme] تم "${requested}" ثبت نشده → "${mode}"`);
  }
  return mode;
}

/** ادغام override روی یک تم پایه (تم اصلی تغییر نمی‌کند). */
export function mergeTheme(base: ChartTheme, override?: ChartThemeOverride): ChartTheme {
  if (!override) return base;
  const palette: ChartPalette = {
    ...base.palette,
    ...(override.palette ?? {}),
    slots: {
      ...base.palette.slots,
      ...(override.slots ?? {}),
      ...(override.palette?.slots ?? {}),
    },
  };
  return {
    name: override.name ?? base.name,
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
    palette,
  };
}

/**
 * حل یک رنگ از کلید اسلات یا پالت سری.
 *   resolveSlot(theme, "headline")   → رنگ اسلات تم
 *   resolveSlot(theme, "#ff0000")    → همان رنگ (صریح)
 *   resolveSlot(theme, "series.2")   → پالت سری، اندیس ۲
 *   resolveSlot(theme, undefined, 3) → پالت سری، اندیس ۳
 */
export function resolveSlot(theme: ChartTheme, key?: string, fallbackIndex = 0): string {
  const p = theme.palette;
  if (key) {
    if (p.slots[key]) return p.slots[key]!;
    if (/^#[0-9a-f]{3,8}$/i.test(key) || key.startsWith("rgb")) return key;
    const m = /^series\.(\d+)$/.exec(key);
    if (m) return p.series[Number(m[1]) % p.series.length]!;
  }
  return p.series[fallbackIndex % p.series.length]!;
}
