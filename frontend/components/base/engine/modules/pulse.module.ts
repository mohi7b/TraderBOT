/**
 * ChartEngine V2 · **P9-الف** — نمونهٔ ماژول جدید: «Volume Pulse»
 * frontend/components/base/engine/modules/pulse.module.ts
 * ============================================================
 * این فایل **الگوی افزودن ماژول** را اثبات می‌کند: «یک فایل + یک ثبت» ✓
 *  ۱) فایل تازه همین‌جاست ✓ (بدون دست‌زدن به هسته ✗)
 *  ۲) ثبت در `registry.ts` ⇒ **خودکار** وارد دروازهٔ CI می‌شود ✓
 *     (`modulesSelfTest` روی هر عضو `MODULES` اجرا می‌شود: semver ✓ · `live` ✓ ·
 *      مرجع AL ✓ · آیتم‌ها ✓ · عبور `spec()` از `SpecGate` ✓)
 *
 * مفهوم: **z-score حجم** روی کندل‌های **بسته** ⇒ جهش‌های حجمی معنادار ✓
 * ⚠️ ناورد D11: **ریاضی این‌جا نیست** ✗ — `computeRef` به AL اشاره می‌کند ✓.
 *    (تابع `volumeZScore` در `lib/analysis/indicators` افزوده می‌شود؛ تا آن زمان
 *     ماژول در وضعیت «ثبت‌شده ولی بدون رندر» است — صادقانه و قابل‌بازرسی ✓)
 * ⚠️ صفر وابستگی به React/DOM ✗.
 */
import type { ChartModuleDef } from "./registry";

export const PULSE_MODULE: ChartModuleDef = {
  id: "pulse",
  version: "1.0.0",
  labelKey: "mod.pulse",
  /** مبنا: کندل بسته ✓ (ساختار/اندیکاتور با کندل نیم‌کاره repaint نمی‌شود ✗) */
  live: "onClosed",
  /** ریاضی در AL ✓ (D11) */
  computeRef: "lib/analysis/indicators/registry#volumeZScore",
  items: [
    /** پنجرهٔ محاسبهٔ z-score (تعداد کندل) */
    { key: "window", label: "Window", default: 96 },
    /** آستانهٔ اعلام «جهش حجم» (انحراف معیار) */
    { key: "threshold", label: "Threshold", default: 2.5 },
  ],
  /**
   * قطعهٔ قرارداد: **پنل** زیرین کوچک ✓ (`heightRatio ≤ 0.6` — قاعدهٔ قرارداد v3.1 ✓)
   * و **بدون مقدار ساختگی** ✓ (`noFabrication` صریح ✓).
   */
  spec: () => ({
    kind: "pane",
    id: "pulse",
    version: "1.0.0",
    heightRatio: 0.18,
    noFabrication: true,
  }),
};

export default PULSE_MODULE;
