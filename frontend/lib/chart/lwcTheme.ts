/**
 * ============================================================
 * LWC Theme adapter — ChartTheme → ChartOptions (lightweight-charts v5)
 * frontend/lib/chart/lwcTheme.ts
 * ============================================================
 */
import type {
  DeepPartial,
  ChartOptions,
} from "lightweight-charts";
import { CrosshairMode } from "lightweight-charts";
import type { ChartTheme } from "./theme";

/**
 * ساخت ChartOptions مخصوص LWC از ChartTheme.
 * (بدون chart instance — فقط آبجکت options قابل‌عبور به createChart.)
 */
export function buildLwcOptions(theme: ChartTheme): DeepPartial<ChartOptions> {
  const p = theme.palette;
  return {
    layout: {
      background: { color: p.background },
      textColor: p.textMuted,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: p.grid },
      horzLines: { color: p.grid },
    },
    rightPriceScale: {
      borderColor: p.border,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderColor: p.border,
      timeVisible: false,
      secondsVisible: false,
      rightOffset: 2,
      barSpacing: 6,
      minBarSpacing: 2,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: p.crosshair,
        width: 1,
        style: 3, // dashed
        labelBackgroundColor: p.text,
      },
      horzLine: {
        color: p.crosshair,
        width: 1,
        style: 3,
        labelBackgroundColor: p.text,
      },
    },
    localization: {
      locale: "en-US",
      priceFormatter: (price: number) => `${price.toFixed(2)}%`,
    },
    autoSize: true,
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  };
}
