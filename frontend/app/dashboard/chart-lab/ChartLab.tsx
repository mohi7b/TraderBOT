"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BaseChart } from "@/components/base/BaseChart";
import { ChartFrame } from "@/components/base/ChartFrame";
import { CHART_THEME_NAMES, getThemeSpec } from "@/lib/chart/themePresets";
import { ZOOM_PRESETS } from "@/lib/chart/layout";
import { SIGNAL_IDS, DEFAULT_INFLATION_SIGNALS } from "@/lib/chart/signals";
import { LAYER_IDS } from "@/lib/chart/layers";
import { makeSeries } from "@/lib/chart/adapters";
import { macroLayers } from "@/lib/chart/presets/macro";
import type { ChartLayer, ChartPoint, ZoomPreset } from "@/lib/chart/types";

/**
 * ============================================================
 * ChartLab — آزمایشگاه چشمی «چارت مرجع ماژولار»
 * frontend/app/dashboard/chart-lab/ChartLab.tsx
 * ============================================================
 * فقط برای **دیدن** اثر تزریق‌های مختلف:
 *   · تعویض تم (light/dark/terminal/print) بدون تغییر کد چارت
 *   · تعویض زوم (1Y/2Y/3Y/5Y/MAX)
 *   · روشن/خاموش‌کردن هر لایه (هدف · رکود · رویداد · پیش‌بینی · شوک)
 *   · انتخاب سیگنال‌ها از کتابخانه
 * دادهٔ نمونه به‌صورت محلی تولید می‌شود (بدون وابستگی به API).
 * ============================================================
 */

const MONTHS = 96;
const START_YEAR = 2019;

function monthPoint(i: number): number {
  const y = START_YEAR + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return Math.floor(Date.UTC(y, m - 1, 1) / 1000);
}

/** تورم کل نمونه (ماهانه). */
function sampleHeadline(): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = 0; i < MONTHS; i++) {
    const wave = Math.sin(i / 6) * 1.4 + Math.cos(i / 11) * 0.7;
    out.push({ t: monthPoint(i), value: Number(Math.max(0.2, 2.5 + wave + (i > 60 ? 1.6 : 0)).toFixed(2)) });
  }
  return out;
}

/** هستهٔ نمونه (ماهانه). */
function sampleCore(): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = 0; i < MONTHS; i++) {
    out.push({
      t: monthPoint(i),
      value: Number((2.1 + Math.sin(i / 8) * 0.9 + (i > 60 ? 0.6 : 0)).toFixed(2)),
    });
  }
  return out;
}

export function ChartLab() {
  const t = useTranslations("themeNames");
  const [themeName, setThemeName] = useState("inflation_modern_dark");
  const [zoom, setZoom] = useState<ZoomPreset>("3Y");
  const [layoutSignals, setLayoutSignals] = useState<"none" | "bottom-right" | "top-right" | "bottom-left">("bottom-right");
  const [layoutLegend, setLayoutLegend] = useState<"none" | "top-left" | "top-right">("top-left");
  const [gridHorz, setGridHorz] = useState(true);
  const [layerState, setLayerState] = useState<Record<string, boolean>>({
    "target-band": true,
    recession: true,
    "event-markers": true,
    projection: true,
    "shock-indicators": false,
  });
  const [signalIds, setSignalIds] = useState<string[]>(DEFAULT_INFLATION_SIGNALS.slice(0, 6));

  /**
   * برچسب تم از i18n می‌آید (هیچ متن ثابتی در کد نیست).
   * اگر کلید i18n جاافتاده باشد، متن خام نمایش داده می‌شود (نه کرش).
   */
  const themeLabel = (name: string): string => {
    if (name === "auto") return t("auto");
    try {
      return t(name);
    } catch {
      return name;
    }
  };
  const activeSpec = themeName === "auto" ? undefined : getThemeSpec(themeName);
  const themeVersion = activeSpec?.meta?.manifest?.version;

  const data = useMemo(() => {
    const headline = sampleHeadline();
    const core = sampleCore();
    const last = headline[headline.length - 1]!;
    const prev3 = headline[headline.length - 4]!;
    return [
      makeSeries(headline, { id: "headline", label: "Headline CPI", colorKey: "headline", lineWidth: 2 }),
      makeSeries(core, { id: "core", label: "Core CPI", colorKey: "core", lineWidth: 2 }),
      makeSeries(
        [
          { t: prev3.t, value: Number(((last.value - prev3.value) * 1.2).toFixed(2)) },
          { t: last.t, value: Number(((last.value - prev3.value) * 1.4).toFixed(2)) },
        ],
        { id: "annualized3m", label: "3M Annualized", colorKey: "annualized3m", lineWidth: 1, dashed: true },
      ),
    ];
  }, []);

  const layers = useMemo<ChartLayer[]>(() => {
    const events = [
      { date: "2021-03", label: "CPI", importance: "medium" as const },
      { date: "2023-06", label: "FOMC", importance: "high" as const },
      { date: "2024-09", label: "Cut", importance: "low" as const },
    ];
    const base = macroLayers({
      target: { low: 1, high: 3, label: "Target", enabled: layerState["target-band"] },
      recessions: [{ from: "2022-01", to: "2022-09", label: "Recession", enabled: layerState.recession }],
      events: layerState["event-markers"] ? events : [],
      projection: {
        from: "2026-07",
        to: "2027-06",
        value: 2.4,
        label: "Projection",
        enabled: layerState.projection,
      },
      shocks: layerState["shock-indicators"]
        ? { t: "2023-02", value: 5.2, tone: "neg", label: "Shock", enabled: true }
        : undefined,
    });
    return base.map((l) => ({ ...l, enabled: layerState[l.id] !== false }));
  }, [layerState]);


  return (
    <div className="space-y-4">
      {/* ---- کنترل‌ها: همه از بیرون تزریق می‌شوند ---- */}
      <div className="rounded-lg border border-border bg-surface p-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-muted">Theme</span>
            <select
              className="rounded border border-border bg-surface-2 px-2 py-1"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
            >
              <option value="auto">{themeLabel("auto")}</option>
              {CHART_THEME_NAMES.map((n) => (
                <option key={n} value={n}>
                  {themeLabel(n)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted">Zoom</span>
            <select
              className="rounded border border-border bg-surface-2 px-2 py-1"
              value={zoom}
              onChange={(e) => setZoom(e.target.value as ZoomPreset)}
            >
              {ZOOM_PRESETS.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted">Signals slot</span>
            <select
              className="rounded border border-border bg-surface-2 px-2 py-1"
              value={layoutSignals}
              onChange={(e) => setLayoutSignals(e.target.value as typeof layoutSignals)}
            >
              <option value="none">none</option>
              <option value="bottom-right">bottom-right</option>
              <option value="top-right">top-right</option>
              <option value="bottom-left">bottom-left</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted">Legend</span>
            <select
              className="rounded border border-border bg-surface-2 px-2 py-1"
              value={layoutLegend}
              onChange={(e) => setLayoutLegend(e.target.value as typeof layoutLegend)}
            >
              <option value="none">none (frame)</option>
              <option value="top-left">top-left</option>
              <option value="top-right">top-right</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={gridHorz} onChange={(e) => setGridHorz(e.target.checked)} />
            <span className="text-muted">Grid (h)</span>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-muted">Layers:</span>
          {LAYER_IDS.map((id) => (
            <label key={id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(layerState[id])}
                onChange={(e) => setLayerState((s) => ({ ...s, [id]: e.target.checked }))}
              />
              <span>{id}</span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-muted">Signal library:</span>
          {SIGNAL_IDS.map((id) => (
            <label key={id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={signalIds.includes(id)}
                onChange={(e) =>
                  setSignalIds((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))
                }
              />
              <span>{id}</span>
            </label>
          ))}
        </div>
      </div>


      {/* ---- چارت: فقط با پراپ‌ها هدایت می‌شود ---- */}
      <ChartFrame
        title={`Chart Lab — ${themeLabel(themeName)} (${themeName}) · zoom: ${zoom}`}
        subtitle={
          activeSpec?.meta?.manifest
            ? `${themeLabel(themeName)} · v${themeVersion ?? "—"} · family=${
                activeSpec.family ?? "—"
              } · mode=${activeSpec.mode ?? "—"}`
            : "موتور واحد · ظاهر/زوم/سیگنال/لایه کاملاً تزریقی"
        }
        meta={
          <>
            <span>theme: {themeName}</span>
            <span>zoom: {zoom}</span>
            <span>signals: {signalIds.length}</span>
            <span>layers: {Object.entries(layerState).filter(([, v]) => v).length}</span>
          </>
        }
        height={380}
      >
        {/* ⚠️ عمداً priceScale/crosshair/watermark تزریق نمی‌شود تا
            layout تم (scaleMargins) دیده شود — تقدم: DEFAULT → تم → دامنه */}
        <BaseChart
          data={data}
          themeName={themeName}
          layout={{
            zoom,
            legend: layoutLegend,
            signals: layoutSignals,
            grid: { vert: false, horz: gridHorz },
          }}
          signals={{ ids: signalIds }}
          layers={layers}
          height={380}
          priceFormat="percent"
          labels={{ signals: "Signals", empty: "no data", error: "chart error" }}
        />
      </ChartFrame>
    </div>
  );
}
