/**
 * رنگ‌های قالب «پیش‌فرض» — آرشیو ظاهر **قبل از شهریور**.
 * همان تم تیره + override دامنهٔ ماکرو (باند هدف کمی نرم‌تر) که
 * `CpiYoyChart` پیش‌تر با `MACRO_THEME_OVERRIDE` تزریق می‌کرد.
 */
export default {
  slots: {
    // باند هدف کمی نرم‌تر از خط هدف تا خطوط سری دیده شوند
    targetBand: "rgba(100,116,139,0.12)",
  },
} satisfies import("../../types").ChartThemePaletteInput;
