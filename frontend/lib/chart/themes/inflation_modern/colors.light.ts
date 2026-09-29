export default {
  // --- پایه (ارث از تم light در registry) ---
  background: "#ffffff",
  surface: "#f8fafc",
  text: "#0f172a",
  textMuted: "#64748b",
  grid: "#eef2f7",
  axis: "#cbd5e1",
  border: "#dbe3ec",
  crosshair: "#94a3b8",

  tooltipBg: "#ffffff",
  tooltipBorder: "#dbe3ec",
  tooltipText: "#0f172a",

  series: ["#2563eb", "#ca8a04", "#16a34a", "#7c3aed", "#0891b2", "#ea580c"],

  headline: "#2563eb",
  core: "#ca8a04",
  annualized3m: "rgba(22,163,74,0.55)",
  targetBand: "rgba(22,163,74,0.12)",
  target: "#64748b",
  recession: "rgba(100,116,139,0.10)",
  projection: "#7c3aed",
  shock: "#dc2626",
  eventHigh: "#dc2626",
  eventMedium: "#ea580c",
  eventLow: "#0891b2",

  pos: "#16a34a",
  neg: "#dc2626",
  warn: "#ea580c",
  neutral: "#64748b",
  signalPos: "#16a34a",
  signalNeg: "#dc2626",
  signalWarn: "#ea580c",
  signalInfo: "#0891b2",
  signalNeutral: "#64748b",

  badgeBg: "rgba(15,23,42,0.05)",
  badgeBorder: "rgba(15,23,42,0.12)",
} satisfies import("../../types").ChartThemePaletteInput;
