/**
 * Chart Engine v3 — ولیدیتور قرارداد
 * frontend/lib/chart/spec/validate.ts
 * ============================================================
 * سبک این ولیدیتور **عیناً** مثل `lib/chart/themeSpec.ts` است: بدون dependency،
 * خروجی `{errors, warnings}` و قابل‌فراخوانی در هر رندر (dev) و در تست SSR.
 *
 * قواعد سخت (error):
 *   ۱. `specVersion` باید با نسخهٔ فعلی یکی باشد
 *   ۲. کلید و تم و `mathVersion` غیرخالی
 *   ۳. حداقل یک سری با `role: "main"`
 *   ۴. شناسهٔ سری‌ها/مقیاس‌ها **یکتا**
 *   ۵. هر `series.scaleId` باید در `scales` تعریف شده باشد
 *   ۶. حداکثر **یک** مقیاس با `visible: true` (قاعدهٔ «دو محور ممنوع»)
 *   ۷. هر سری `role: "derived"` باید `provenance` با `formulaId` و
 *      `sourceSeriesIds` **غیرخالی** داشته باشد (منشأ داده)
 *   ۸. `signals.max` ≥ ۱ و ترتیب `customIds` بدون تکرار
 *
 * قواعد نرم (warning):
 *   · نبود `labelKey` برای سری · نبود `layout.zoom` معتبر · `futureMargin`
 *     صفر · سری بدون `colorKey` (رنگ پیش‌فرض می‌گیرد)
 * ============================================================
 */
import { CHART_SPEC_VERSION, type ChartSpecV3, type SpecValidation } from "./types";
import { ZOOM_PRESETS } from "@/lib/chart/layout";

/** ولیدیشن کامل یک spec. */
export function validateChartSpec(spec: ChartSpecV3): SpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (spec.specVersion !== CHART_SPEC_VERSION) {
    errors.push(`specVersion="${spec.specVersion}" با نسخهٔ جاری (${CHART_SPEC_VERSION}) یکی نیست`);
  }
  if (!spec.key) errors.push("key خالی است");
  if (!spec.theme) errors.push("theme خالی است");
  if (!spec.mathVersion) errors.push("mathVersion خالی است (نسخهٔ ریاضی ثبت نشده)");

  // ---- سری‌ها ----
  const seriesIds = new Set<string>();
  for (const s of spec.series) {
    if (!s.id) errors.push("سری بدون id");
    if (seriesIds.has(s.id)) errors.push(`id سری تکراری: "${s.id}"`);
    seriesIds.add(s.id);
    if (!s.labelKey) warnings.push(`سری "${s.id}" بدون labelKey (برچسب i18n ندارد)`);
    if (!s.colorKey) warnings.push(`سری "${s.id}" بدون colorKey (رنگ پیش‌فرض تم)`);
  }
  const mains = spec.series.filter((s) => s.role === "main");
  if (mains.length === 0) errors.push("هیچ سری با role=main تعریف نشده");
  if (mains.length > 1) warnings.push(`${mains.length} سری main تعریف شده (انتظار: یکی)`);

  // ---- مقیاس‌ها ----
  const scaleIds = new Set<string>();
  for (const sc of spec.scales) {
    if (!sc.id) errors.push("مقیاس بدون id");
    if (scaleIds.has(sc.id)) errors.push(`id مقیاس تکراری: "${sc.id}"`);
    scaleIds.add(sc.id);
    const m = sc.scaleMargins;
    if (m && (m.top < 0 || m.top > 0.5 || m.bottom < 0 || m.bottom > 0.5)) {
      errors.push(`scaleMargins مقیاس "${sc.id}" خارج از بازهٔ ۰..۰٫۵`);
    }
  }
  const visibleScales = spec.scales.filter((s) => s.visible);
  if (visibleScales.length === 0) warnings.push("هیچ مقیاس دیدنی وجود ندارد");
  if (visibleScales.length > 1) {
    errors.push(`بیش از یک مقیاس دیدنی (${visibleScales.map((s) => s.id).join(", ")}) — فقط یک محور مجاز است`);
  }
  for (const s of spec.series) {
    if (s.scaleId && !scaleIds.has(s.scaleId)) {
      errors.push(`سری "${s.id}" به مقیاس تعریف‌نشده "${s.scaleId}" اشاره می‌کند`);
    }
  }

  // ---- منشأ داده ----
  for (const s of spec.series) {
    if (s.role !== "derived") continue;
    const prov = spec.provenance.find((p) => p.sourceSeriesIds.length > 0);
    if (!prov) {
      errors.push(`سری مشتق "${s.id}" بدون provenance (منشأ داده ثبت نشده)`);
    }
  }
  for (const p of spec.provenance) {
    if (!p.formulaId) errors.push("provenance بدون formulaId");
    if (!p.sourceSeriesIds?.length) errors.push(`provenance "${p.formulaId}" بدون sourceSeriesIds`);
  }

  // ---- سیگنال‌ها ----
  if (!Number.isFinite(spec.signals.max) || spec.signals.max < 1) {
    errors.push("signals.max باید عددی ≥ ۱ باشد");
  }
  const sigIds = spec.signals.customIds ?? [];
  if (new Set(sigIds).size !== sigIds.length) errors.push("signals.customIds تکراری دارد");
  for (const id of spec.signals.breakAfter ?? []) {
    if (!sigIds.includes(id) && !(spec.signals.ids ?? []).includes(id)) {
      warnings.push(`breakAfter شامل شناسهٔ ناموجود "${id}" است`);
    }
  }

  // ---- چیدمان ----
  if (!(ZOOM_PRESETS as string[]).includes(spec.layout.zoom)) {
    errors.push(`layout.zoom="${spec.layout.zoom}" در پریست‌های مجاز نیست`);
  }
  if (!Number.isFinite(spec.layout.futureMargin) || spec.layout.futureMargin < 0) {
    errors.push("layout.futureMargin باید عدد ≥ ۰ باشد");
  }
  if (spec.layout.futureMargin === 0) warnings.push("futureMargin=0 (فضای آیندهٔ راست بسته است)");

  return { errors, warnings };
}

/** لاگ هشدارها/خطاها — فقط در توسعه (مثل `warnThemeSpec`). */
export function warnChartSpec(spec: ChartSpecV3, log: Pick<Console, "warn"> = console): void {
  if (process.env.NODE_ENV === "production") return;
  const { errors, warnings } = validateChartSpec(spec);
  for (const w of warnings) log.warn(`[chartSpec:${spec.key}] warning: ${w}`);
  for (const e of errors) log.warn(`[chartSpec:${spec.key}] ERROR: ${e}`);
}
