/**
 * قالب تم — این پوشه را کپی کنید و <family> را عوض کنید.
 * راهنمای کامل: lib/chart/THEME_AUTHORING.md
 *
 * ساختار:
 *   index.ts        ← spec (base/palette/layout/signals/meta)
 *   colors.dark.ts  ← رنگ‌های حالت تیره (ChartThemePaletteInput)
 *   colors.light.ts ← رنگ‌های حالت روشن
 *   layout.ts       ← ChartLayoutSpec (Partial + scaleMargins)
 *   signals.ts      ← ids + style
 *   manifest.json   ← نسخه/نویسنده + description_key (i18n)
 *
 * سپس در `themePresets.ts`:
 *   import { MY_THEME_DARK, MY_THEME_LIGHT } from "./themes/my_theme";
 *   export const THEME_REGISTRY = { ..., my_theme_dark: MY_THEME_DARK, ... };
 */
import type { ChartThemeSpec } from "../../types";
import darkColors from "./colors.dark";
import lightColors from "./colors.light";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const TEMPLATE_THEME_DARK: ChartThemeSpec = {
  name: "template_theme_dark",
  family: "template_theme",
  mode: "dark",
  base: "dark",
  palette: darkColors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

export const TEMPLATE_THEME_LIGHT: ChartThemeSpec = {
  name: "template_theme_light",
  family: "template_theme",
  mode: "light",
  base: "light",
  palette: lightColors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "light" } },
};
