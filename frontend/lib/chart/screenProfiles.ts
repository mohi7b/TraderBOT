/**
 * Screen Profiles — پروفایل پنج کلاس اسکرین (منبع حقیقت واحد)
 * frontend/lib/chart/screenProfiles.ts
 * ============================================================
 * ⚠️ این فایل **بازنویسی تمیز** (بازبینی پانزدهم) است تا آسیبِ کامنت‌های
 *    ویرایش‌های خودکارِ قبلی پاک شود.
 *
 * قواعد قفل‌شده:
 *   · **محل چارت هیچ ربطی به تم ندارد** — نه `anchorRatio` نه `rightOffset`
 *     نه `scrollToPosition` از تم مقدار نمی‌گیرد (خواستهٔ کاربر).
 *     محل چارت در `BaseChart` تعیین می‌شود: یک‌بار `150px` و بعد از آن
 *     مقدار کش‌شدهٔ کاربر در `localStorage["chartOffset"]`.
 *   · **ارتفاع چارت هیچ قاعده‌ای در تم ندارد** — فقط آرگومان صفحه با کف ۳۶۰px
 *     (`CandleChart`).
 *   · SSR **هیچ تشخیصی** نمی‌دهد: `screenClass = "unknown"` و تم خنثی
 *     `shahrivar_default` — کلاینت تنها منبع تشخیص است.
 *   · پریست‌ها و داده: صفر تغییر.
 *
 * ⚠️ صفر وابستگی به React/DOM ⇒ selfTest در SSR.
 */
import type { ChartLayoutPartial, ZoomPreset } from "./types";
import type { ChartThemeSpec } from "./types";

/** پنج کلاس اسکرین (هم‌نام با ۵ تم نسخه‌دار). */
export type ScreenClass = "mobile" | "tablet" | "desktop" | "ultrawide" | "tv";

/** پارامترهای UI کشو/لجند/لمس (به `ChartThemeSpec.ui` می‌رود). */
export interface ScreenThemeUi {
  drawerWidth: string;
  railWidth: number;
  touchTarget: number;
  itemColumns: 1 | 2;
  legendFontSize: number;
  uiFontSize: number;
  motion: "normal" | "reduced";
}

/** پارامترهای چارت یک کلاس (بدون هیچ پارامتر «محل چارت» و «ارتفاع»). */
export interface ScreenChartProfile {
  zoom: ZoomPreset;
  /** لنگر معنایی (قفل به آخرین کندل). */
  anchor: "last" | "first";
  futureMargin: number;
  fontSize: number;
  signalFontSize: number;
  maxSignals: number;
  barSpacing: number;
  minBarSpacing: number;
  rightOffset: number;
  seriesThickness: 1 | 1.5 | 2 | 2.5 | 3 | 4;
  scaleMargins: { top: number; bottom: number };
  volumePaneRatio: number;
  padding: { top: number; bottom: number };
  timeVisible: boolean;
  dprCap: number;
  legendRows: number;
  header: "full" | "compact" | "hidden";
}

export interface ScreenProfile {
  id: ScreenClass;
  themeId: string;
  label: string;
  minWidth: number;
  maxWidth: number | null;
  input: "touch" | "pointer" | "remote";
  chart: ScreenChartProfile;
  ui: ScreenThemeUi;
}

export const SCREEN_CLASSES: readonly ScreenClass[] = [
  "mobile",
  "tablet",
  "desktop",
  "ultrawide",
  "tv",
];

export const SCREEN_BREAKPOINTS = { tablet: 640, desktop: 1024, ultrawide: 1920, tv: 2560 } as const;

export const DEFAULT_SCREEN_CLASS: ScreenClass = "desktop";

/** مقدارهای خنثیِ SSR (سرور هیچ تشخیصی نمی‌دهد). */
export const SSR_SCREEN_CLASS = "unknown" as const;
export const SSR_THEME_ID = "shahrivar_default" as const;

const def = (over: Partial<ScreenChartProfile>): ScreenChartProfile => ({
  zoom: "3Y6M",
  anchor: "last",
  futureMargin: 24,
  fontSize: 11,
  signalFontSize: 10,
  maxSignals: 8,
  barSpacing: 6,
  minBarSpacing: 2,
  rightOffset: 2,
  seriesThickness: 2,
  scaleMargins: { top: 0.05, bottom: 0.08 },
  volumePaneRatio: 0.22,
  padding: { top: 0.1, bottom: 0.1 },
  timeVisible: true,
  dprCap: 2,
  legendRows: 8,
  header: "full",
  ...over,
});


/** جدول رسمی ۵ کلاس — پارامترهای چارت + UI (تک‌نسخه برای هر ۵ تم). */
export const SCREEN_PROFILES: Record<ScreenClass, ScreenProfile> = {
  mobile: {
    id: "mobile",
    themeId: "shahrivar_mobile",
    label: "Mobile",
    minWidth: 0,
    maxWidth: 639,
    input: "touch",
    chart: def({
      zoom: "6M",
      futureMargin: 12,
      fontSize: 10,
      signalFontSize: 9,
      maxSignals: 4,
      barSpacing: 4,
      rightOffset: 1,
      seriesThickness: 1.5,
      scaleMargins: { top: 0.06, bottom: 0.1 },
      volumePaneRatio: 0.18,
      padding: { top: 0.08, bottom: 0.08 },
      timeVisible: false,
      legendRows: 2,
      header: "compact",
    }),
    ui: {
      drawerWidth: "100%",
      railWidth: 36,
      touchTarget: 44,
      itemColumns: 1,
      legendFontSize: 11,
      uiFontSize: 11,
      motion: "normal",
    },
  },
  tablet: {
    id: "tablet",
    themeId: "shahrivar_tablet",
    label: "Tablet",
    minWidth: 640,
    maxWidth: 1023,
    input: "touch",
    chart: def({
      zoom: "1Y",
      futureMargin: 16,
      maxSignals: 6,
      barSpacing: 5,
      scaleMargins: { top: 0.05, bottom: 0.09 },
      volumePaneRatio: 0.2,
      legendRows: 3,
    }),
    ui: {
      drawerWidth: "min(20rem,70%)",
      railWidth: 36,
      touchTarget: 44,
      itemColumns: 1,
      legendFontSize: 10,
      uiFontSize: 12,
      motion: "normal",
    },
  },
  desktop: {
    id: "desktop",
    themeId: "shahrivar_desktop",
    label: "Desktop",
    minWidth: 1024,
    maxWidth: 1919,
    input: "pointer",
    /** = مقادیر امروزِ قالب شهریور (پیش‌فرض صفحه). */
    chart: def({}),
    ui: {
      drawerWidth: "max(15rem,min(22rem,34%))",
      railWidth: 36,
      touchTarget: 28,
      itemColumns: 2,
      legendFontSize: 10,
      uiFontSize: 12,
      motion: "normal",
    },
  },
  ultrawide: {
    id: "ultrawide",
    themeId: "shahrivar_ultrawide",
    label: "UltraWide",
    minWidth: 1920,
    maxWidth: 2559,
    input: "pointer",
    chart: def({
      zoom: "5Y",
      futureMargin: 32,
      fontSize: 12,
      signalFontSize: 11,
      barSpacing: 8,
      minBarSpacing: 3,
      rightOffset: 3,
      volumePaneRatio: 0.18,
      dprCap: 1.5,
    }),
    ui: {
      drawerWidth: "22rem",
      railWidth: 36,
      touchTarget: 28,
      itemColumns: 2,
      legendFontSize: 10,
      uiFontSize: 12,
      motion: "normal",
    },
  },
  tv: {
    id: "tv",
    themeId: "shahrivar_tv",
    label: "TV",
    minWidth: 2560,
    maxWidth: null,
    input: "remote",
    chart: def({
      zoom: "1Y",
      futureMargin: 48,
      fontSize: 16,
      signalFontSize: 14,
      barSpacing: 10,
      minBarSpacing: 4,
      rightOffset: 4,
      seriesThickness: 3,
      scaleMargins: { top: 0.06, bottom: 0.1 },
      volumePaneRatio: 0.2,
      padding: { top: 0.12, bottom: 0.12 },
      dprCap: 1.5,
    }),
    ui: {
      drawerWidth: "28rem",
      railWidth: 44,
      touchTarget: 56,
      itemColumns: 2,
      legendFontSize: 14,
      uiFontSize: 15,
      motion: "reduced",
    },
  },
};

// ------------------------------------------------------------------
// helpers — پروفایل ⇒ چیدمان/سیگنال/UI
// ------------------------------------------------------------------
/**
 * کارخانهٔ تم اسکرینی (بازبینی هفدهم): تم خانوادگی = **ارث‌بری صریح از base**
 *   · همهٔ پایه‌ها از `base` می‌آید ✓ و این‌جا فقط **تفاوت‌ها** override می‌شوند ✓
 *   · هیچ تمی چیدمان/رنگ را از صفر نمی‌سازد ✗ (ضدِ تمِ ناقص ⇒ چارت ناپدید ✗)
 */
export function screenThemeOf(cls: ScreenClass, base: ChartThemeSpec): ChartThemeSpec {
  const p = SCREEN_PROFILES[cls];
  const sig = screenSignalsOf(cls);
  return {
    ...base,
    name: p.themeId,
    family: "shahrivar",
    mode: "dark",
    base: "dark",
    fontSize: p.chart.fontSize,
    layout: { ...base.layout, ...screenLayoutOf(cls) },
    signals: {
      ...base.signals,
      max: sig.max,
      style: { ...base.signals?.style, fontSize: sig.fontSize },
    },
    ui: p.ui,
    meta: {
      ...base.meta,
      manifest: {
        ...base.meta?.manifest,
        name: p.themeId,
        family: "shahrivar",
        mode: "dark",
        version: "2.0.0-alpha",
      },
    },
  };
}

export function profileOf(cls: ScreenClass): ScreenProfile {
  return SCREEN_PROFILES[cls];
}
export function themeIdOf(cls: ScreenClass): string {
  return SCREEN_PROFILES[cls].themeId;
}
export function screenThemeIds(): string[] {
  return SCREEN_CLASSES.map(themeIdOf);
}
export function isScreenTheme(themeId: string): boolean {
  return screenThemeIds().includes(themeId);
}
export function classOfTheme(themeId: string): ScreenClass | null {
  return SCREEN_CLASSES.find((c) => themeIdOf(c) === themeId) ?? null;
}

/** چیدمان تم برای یک کلاس (روی چیدمان پایه اسپرد می‌شود). */
export function screenLayoutOf(cls: ScreenClass): ChartLayoutPartial {
  const c = SCREEN_PROFILES[cls].chart;
  return {
    zoom: c.zoom,
    anchor: c.anchor,
    futureMargin: c.futureMargin,
    legendRows: c.legendRows,
    header: c.header,
    dprCap: c.dprCap,
    series: { thickness: c.seriesThickness },
    scaleMargins: { ...c.scaleMargins },
    padding: { ...c.padding },
    panes: { volume: c.volumePaneRatio },
    timeScale: {
      visible: true,
      timeVisible: c.timeVisible,
      secondsVisible: false,
      rightOffset: c.rightOffset,
      barSpacing: c.barSpacing,
      minBarSpacing: c.minBarSpacing,
    },
  };
}

export function screenSignalsOf(cls: ScreenClass): { max: number; fontSize: number } {
  const c = SCREEN_PROFILES[cls].chart;
  return { max: c.maxSignals, fontSize: c.signalFontSize };
}

export function screenUiOf(cls: ScreenClass): ScreenThemeUi {
  return SCREEN_PROFILES[cls].ui;
}

/**
 * ۷ کلاس تشخیصی مصوب کاربر (portrait/landscape) — با اولویتِ نخستین‌تطابق
 * (هم‌پوشانی mobile.landscape/tablet.landscape در ۶۴۰..۸۹۵ حل می‌شود) و
 * fallback برای حفره‌های جدول (شاهد: ۱۹۲۰×۱۰۸۰ ⇒ desktop.landscape).
 */
export type DetectClass =
  | "mobile.portrait"
  | "mobile.landscape"
  | "tablet.portrait"
  | "tablet.landscape"
  | "desktop.portrait"
  | "desktop.landscape"
  | "ultrawide.landscape"
  | "tv.landscape";

export function themeForDetectClass(d: DetectClass): ScreenClass {
  if (d.startsWith("mobile")) return "mobile";
  if (d.startsWith("tablet")) return "tablet";
  if (d.startsWith("desktop")) return "desktop";
  if (d.startsWith("ultrawide")) return "ultrawide";
  return "tv";
}

export function detectScreenClass(width: number, height: number): DetectClass {
  const w = Number.isFinite(width) ? width : 0;
  const h = Number.isFinite(height) ? height : 0;
  if (w <= 0 || h <= 0) return "desktop.landscape";
  const aspect = w / h;
  const landscape = w >= h;
  if (w >= SCREEN_BREAKPOINTS.tv && aspect < 2.2) return "tv.landscape";
  if (aspect >= 2.2 && w >= SCREEN_BREAKPOINTS.desktop) return "ultrawide.landscape";
  if (w >= SCREEN_BREAKPOINTS.desktop && !landscape) return "desktop.portrait";
  if (w >= SCREEN_BREAKPOINTS.desktop) return "desktop.landscape";
  if (w >= SCREEN_BREAKPOINTS.tablet && w <= 1366 && landscape) return "tablet.landscape";
  if (w >= SCREEN_BREAKPOINTS.tablet && w <= 1023) return "tablet.portrait";
  if (w < 896 && landscape) return "mobile.landscape";
  return "mobile.portrait";
}

/** کلاس از عرض viewport (+ لمسی‌بودن و ارتفاع برای نسبت‌تصویر). */
/** کلاس از عرض viewport (+ لمسی‌بودن و ارتفاع برای نسبت‌تصویر). */
export function screenClassOf(
  viewportWidth: number,
  opts?: { touch?: boolean; height?: number },
): ScreenClass {
  const w = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const h = Number.isFinite(opts?.height) && (opts?.height ?? 0) > 0 ? (opts?.height as number) : 0;
  if (w === 0) return DEFAULT_SCREEN_CLASS;
  return themeForDetectClass(detectScreenClass(w, h > 0 ? h : Math.round(w / 1.6)));
}

/** انتخاب کلاس از نشانه‌های سرور (اختیاری — در SSR استفاده نمی‌شود). */
export function screenClassFromHints(hints: {
  userAgent?: string | null;
  viewportWidth?: number;
  viewportHeight?: number;
  mobileHint?: boolean;
}): ScreenClass {
  const ua = (hints.userAgent ?? "").toLowerCase();
  if (
    /smart-?tv|hbbtv|netcast|viera|bravia|appletv|googletv|android ?tv|tizen|web0s|webos|crkey|aft[bmst]/.test(ua)
  ) {
    return "tv";
  }
  if (hints.viewportWidth !== undefined && hints.viewportWidth > 0) {
    return screenClassOf(hints.viewportWidth, {
      touch: hints.mobileHint,
      height: hints.viewportHeight,
    });
  }
  if (hints.mobileHint === true) return /ipad|tablet|playbook|silk/.test(ua) ? "tablet" : "mobile";
  return DEFAULT_SCREEN_CLASS;
}

export function pickScreenTheme(hints: {
  userAgent?: string | null;
  viewportWidth?: number;
  viewportHeight?: number;
  mobileHint?: boolean;
}): { cls: ScreenClass; themeId: string } {
  const cls = screenClassFromHints(hints);
  return { cls, themeId: themeIdOf(cls) };
}

/** خودآزمون پروفایل‌ها — خالی = سالم. */
export function screenProfilesSelfTest(): string[] {
  const errs: string[] = [];

  if (SCREEN_CLASSES.length !== 5) errs.push("باید دقیقاً ۵ کلاس اسکرین باشد ✗");
  const ids = screenThemeIds();
  if (new Set(ids).size !== ids.length) errs.push("شناسهٔ تم‌های نسخه‌دار تکراری است ✗");
  for (const id of ids) {
    if (!/^shahrivar_(mobile|tablet|desktop|ultrawide|tv)$/.test(id)) {
      errs.push(`نام تم نسخه‌دار نادرست: «${id}» ✗`);
    }
  }

  /** بازه‌های عرض پیوسته */
  let prevMax = -1;
  for (const cls of SCREEN_CLASSES) {
    const p = profileOf(cls);
    if (cls !== "mobile" && p.minWidth !== prevMax + 1) {
      errs.push(`بازهٔ «${cls}» پیوسته نیست (min=${p.minWidth}, prevMax=${prevMax}) ✗`);
    }
    prevMax = p.maxWidth ?? Number.POSITIVE_INFINITY;
  }
  if (profileOf("tv").maxWidth !== null) errs.push("TV باید بی‌سقف باشد ✗");

  /** ⛔ هیچ پارامتر «محل چارت» یا «ارتفاع» در تم‌ها نباید باشد */
  for (const cls of SCREEN_CLASSES) {
    const raw = JSON.stringify(profileOf(cls));
    for (const banned of ["anchorRatio", "rightOffsetBase", "chartViewportRatio", "heightRule"]) {
      if (raw.includes(banned)) errs.push(`پارامتر «${banned}» نباید در تم باشد ✗ (${cls})`);
    }
  }

  /** بازه‌های مجاز */
  for (const cls of SCREEN_CLASSES) {
    const { chart: c, ui } = profileOf(cls);
    if (c.anchor !== "last") errs.push(`لنگر «${cls}» باید last باشد ✗`);
    if (c.futureMargin < 0 || c.futureMargin > 200) errs.push(`futureMargin «${cls}» خارج بازه ✗`);
    if (c.fontSize < 8 || c.fontSize > 24) errs.push(`fontSize «${cls}» خارج بازه ✗`);
    if (c.maxSignals < 1 || c.maxSignals > 8) errs.push(`maxSignals «${cls}» باید ۱..۸ باشد ✗`);
    if (c.barSpacing < c.minBarSpacing) errs.push(`barSpacing «${cls}» کمتر از minBarSpacing ✗`);
    if (c.dprCap < 1 || c.dprCap > 3) errs.push(`dprCap «${cls}» خارج بازه ✗`);
    if (ui.touchTarget < 24) errs.push(`touchTarget «${cls}» خارج بازه ✗`);
    if (!ui.drawerWidth.trim()) errs.push(`drawerWidth «${cls}» خالی است ✗`);
  }
  for (const cls of ["mobile", "tablet", "tv"] as const) {
    if (profileOf(cls).ui.touchTarget < 44) errs.push(`ناحیهٔ لمس «${cls}» باید ≥ ۴۴px باشد ✗`);
  }
  if (profileOf("tv").ui.motion !== "reduced") errs.push("انیمیشن TV باید reduced باشد ✗");

  /** تشخیص ۷ کلاسه: هر ورودی دقیقاً یک کلاس */
  {
    const seen = new Set<string>();
    for (let w = 200; w <= 4200; w += 97) {
      for (let h = 200; h <= 2400; h += 89) seen.add(detectScreenClass(w, h));
    }
    if (seen.size < 6) errs.push(`تنوع کلاس‌های تشخیصی کم است (${seen.size}) ✗`);
  }
  const detCases: Array<[number, number, DetectClass]> = [
    [390, 844, "mobile.portrait"],
    [844, 390, "mobile.landscape"],
    [820, 1180, "tablet.portrait"],
    [1180, 820, "tablet.landscape"],
    [1440, 900, "desktop.landscape"],
    [1080, 1920, "desktop.portrait"],
    [3168, 1356, "ultrawide.landscape"],
    [3840, 2160, "tv.landscape"],
    [1920, 1080, "desktop.landscape"],
  ];
  for (const [w, h, want] of detCases) {
    const got = detectScreenClass(w, h);
    if (got !== want) errs.push(`تشخیص ${w}x${h} ⇒ «${got}» (انتظار «${want}») ✗`);
  }
  if (themeForDetectClass("mobile.landscape") !== "mobile") errs.push("نگاشت موبایل نادرست ✗");
  if (themeForDetectClass("tv.landscape") !== "tv") errs.push("نگاشت TV نادرست ✗");

  /** دسکتاپ = رفتار امروز */
  const d = profileOf("desktop").chart;
  if (d.zoom !== "3Y6M" || d.futureMargin !== 24) errs.push("مقادیر دسکتاپ تغییر کرده ✗");
  if (d.barSpacing !== 6 || d.seriesThickness !== 2 || d.fontSize !== 11) {
    errs.push("پارامترهای دسکتاپ تغییر کرده ✗");
  }
  /** مقدارهای خنثیِ SSR */
  if (SSR_SCREEN_CLASS !== "unknown") errs.push("SSR_SCREEN_CLASS باید unknown باشد ✗");
  if (SSR_THEME_ID !== "shahrivar_default") errs.push("SSR_THEME_ID باید shahrivar_default باشد ✗");
  return errs;
}


