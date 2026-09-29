/**
 * ============================================================
 * Macro Chart Preset — پیکربندی چارت‌های دامنهٔ ماکرو
 * frontend/lib/chart/presets/macro.ts
 * ============================================================
 * این فایل «نمونهٔ مرجع» یک دامنه است و نشان می‌دهد دامنه‌ها چطور
 * بدون دست‌زدن به موتور چارت، ظاهر/زوم/سیگنال/لایهٔ خود را تزریق می‌کنند:
 *
 *   <BaseChart data={...}
 *              theme={MACRO_THEME_OVERRIDE}
 *              layout={MACRO_LAYOUT}
 *              signals={MACRO_SIGNALS}
 *              layers={macroLayers({ target, events, recessions, projection })} />
 * ============================================================
 */
import type {
  ChartLayer,
  ChartLayout,
  ChartSignalsConfig,
  ChartThemeOverride,
  ProjectionLayer,
  ShockIndicatorsLayer,
} from "../types";
import { DEFAULT_INFLATION_SIGNALS } from "../signals";

/**
 * ارتفاع استاندارد چارت‌های ماکرو (پیکسل).
 *
 * چرا یکجا تعریف می‌شود: هر دو چارت صفحه (`CpiYoyChart` و `PolicyRateChart`)
 * باید **هم‌ارتفاع** باشند تا قابل مقایسه بمانند و برای «چند چارت در یک صفحه»
 * فقط همین یک عدد تغییر کند.
 *
 * محاسبهٔ ظرفیت صفحه (برای آینده):
 *   هر قاب چارت ≈ ۷۴px اضافه دارد (عنوان + ردیف توضیحات + لجند + فاصلهٔ داخلی)
 *   هدر سایت ≈ ۶۴px · هدر صفحه ≈ ۴۴px · فاصلهٔ بین کارت‌ها = 16px (`space-y-4`)
 *
 *   نمایشگر 1080p  : بودجه ≈ 1080−64−44−24 = 948 ⇒ سه چارت ⇒ ارتفاع ≈ ۲۳۱px
 *   نمایشگر 1440p  : بودجه ≈ 1440−64−44−24 = 1308 ⇒ سه چارت ⇒ ارتفاع ≈ ۳۵۱px
 *
 *   ⚠️ نتیجه: با 312px (کاهش ۱۳٪ از 360) سه چارت ≈ ۱۱۷۰px ارتفاع می‌خواهند
 *      (نیازمند نمایشگر ≥1200px یا هدر جمع‌شده)؛ برای 1080p خالص باید به
 *      ≈231px برسیم (کاهش ≈۳۶٪) یا چارت‌ها را در دو ستون بچینیم.
 */
export const MACRO_CHART_HEIGHT = 312;

/**
 * پالت اختصاصی ماکرو — فقط override روی تم پایه (light/dark/terminal/print).
 * اسلات‌های headline/core/annualized3m در همهٔ تم‌ها تعریف شده‌اند؛
 * این‌جا می‌توان برای دامنه مقدار متفاوتی تزریق کرد.
 */
export const MACRO_THEME_OVERRIDE: ChartThemeOverride = {
  slots: {
    // باند هدف کمی نرم‌تر از خط هدف تا خطوط سری دیده شوند
    targetBand: "rgba(100,116,139,0.12)",
  },
};

/** چینش پیش‌فرض چارت‌های ماکرو (تورم/رشد/کار). */
export const MACRO_LAYOUT: Partial<ChartLayout> = {
  zoom: "5Y",
  legend: "none", // لجند در ChartFrame بیرونی (سراسری)
  signals: "bottom-right",
  tooltip: "crosshair",
  grid: { vert: false, horz: true },
  padding: { top: 0.12, bottom: 0.12 },
  priceScale: { visible: true, top: 0.12, bottom: 0.12, mode: "normal" },
  timeScale: {
    visible: true,
    timeVisible: false,
    secondsVisible: false,
    rightOffset: 3,
    barSpacing: 6,
    minBarSpacing: 2,
  },
  crosshair: { mode: "normal", dashed: true },
  watermark: { visible: false },
};

/** سیگنال‌های پیشنهادی ماکرو (۶ مورد در پنل پایین-راست). */
export const MACRO_SIGNALS: ChartSignalsConfig = {
  ids: DEFAULT_INFLATION_SIGNALS,
  max: 6,
};

export interface MacroLayersInput {
  /** باند هدف تورمی بانک مرکزی */
  target?: { low?: number | null; high?: number | null; label?: string; enabled?: boolean };
  /** رویدادهای تقویم (FOMC/CPI/...) */
  events?: { date: string; label?: string; importance?: "low" | "medium" | "high" }[];
  /** بازه‌های رکود (سایه) */
  recessions?: { from: string; to: string; label?: string; enabled?: boolean }[];
  /** ناحیهٔ پیش‌بینی/فرافکنی */
  projection?: { from: string; to?: string; value?: number; points?: { t: number; value: number }[]; label?: string; enabled?: boolean };
  /** نقاط شوک (انحراف شدید) */
  shocks?: { t: string; value: number; tone?: "pos" | "neg" | "warn"; label?: string; enabled?: boolean };
}

/**
 * ساخت لایه‌های ماکرو از دادهٔ دامنه.
 * هر لایه مستقل قابل خاموش‌کردن است (`enabled: false`).
 */
export function macroLayers(input: MacroLayersInput = {}): ChartLayer[] {
  const layers: ChartLayer[] = [];

  if (input.target) {
    layers.push({
      id: "target-band",
      enabled: input.target.enabled !== false,
      low: input.target.low ?? null,
      high: input.target.high ?? null,
      label: input.target.label,
      colorKey: "targetBand",
      drawLines: true,
      fill: true,
    });
  }

  if (input.recessions?.length) {
    layers.push({
      id: "recession",
      enabled: input.recessions.some((r) => r.enabled !== false),
      ranges: input.recessions
        .filter((r) => r.enabled !== false)
        .map((r) => ({ from: r.from, to: r.to })),
      colorKey: "recession",
    });
  }

  if (input.events?.length) {
    layers.push({
      id: "event-markers",
      enabled: true,
      events: input.events.map((e) => ({ t: e.date, label: e.label, importance: e.importance })),
      position: "aboveBar",
      paintVerticalLines: true,
    });
  }

  if (input.projection && input.projection.enabled !== false) {
    const proj: ProjectionLayer = {
      id: "projection",
      enabled: true,
      from: input.projection.from,
      to: input.projection.to,
      value: input.projection.value,
      points: input.projection.points,
      label: input.projection.label,
      colorKey: "projection",
      dashed: true,
      fill: true,
    };
    layers.push(proj);
  }

  if (input.shocks && input.shocks.enabled !== false) {
    const shock: ShockIndicatorsLayer = {
      id: "shock-indicators",
      enabled: true,
      points: [{ t: input.shocks.t, value: input.shocks.value, tone: input.shocks.tone, label: input.shocks.label }],
      colorKey: undefined,
      radius: 5,
    };
    layers.push(shock);
  }

  return layers;
}

/**
 * قالب رسمی چارت تورم (2026-09-21).
 * چارت ماکرو ظاهر/چینش/سیگنال‌هایش را از این تم می‌گیرد:
 *   `themeName={MACRO_TEMPLATE_THEME}`
 * ⇒ سوئیچ ظاهر فقط با تغییر همین ثابت (یا prop `themeName`) انجام می‌شود.
 * آرشیو ظاهر پیشین: `themeName="default_chart"`.
 */
export const MACRO_TEMPLATE_THEME = "shahrivar";

/** آرشیو ظاهر پیشین چارت تورم (برای مقایسه/بازگشت). */
export const MACRO_ARCHIVED_THEME = "default_chart";

/** زوم‌های استاندارد ماکرو برای UI (چیپ‌های انتخاب زوم). */
export const MACRO_ZOOM_CHIPS = ["1Y", "2Y", "3Y", "5Y", "MAX"] as const;
