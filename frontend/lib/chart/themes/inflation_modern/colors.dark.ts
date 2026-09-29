export default {
  // --- پایه (ارث از تم dark در registry) ---
  background: "#0f0f0f",
  surface: "#1a1a1a",
  text: "#e5e5e5",
  textMuted: "#9ca3af",
  grid: "#2a2a2a",
  axis: "#cfcfcf",
  border: "#333333",
  crosshair: "#888888",

  tooltipBg: "#1f1f1f",
  tooltipBorder: "#333333",
  tooltipText: "#ffffff",

  // --- چندسری (آرایه) ---
  series: ["#3b82f6", "#facc15", "#4ade80", "#f472b6", "#22d3ee", "#fb923c"],

  // --- معنایی (semantic) → به اسلات‌های تم گسترش می‌یابد ---
  headline: "#3b82f6",
  core: "#facc15",
  annualized3m: "rgba(100,255,100,0.4)",
  targetBand: "rgba(74,222,128,0.14)",
  target: "#6b7280",
  recession: "rgba(156,163,175,0.10)",
  projection: "#a78bfa",
  shock: "#ef4444",
  eventHigh: "#ef4444",
  eventMedium: "#f97316",
  eventLow: "#22d3ee",

  pos: "#22c55e",
  neg: "#ef4444",
  warn: "#f97316",
  neutral: "#9ca3af",
  signalPos: "#22c55e",
  signalNeg: "#ef4444",
  signalWarn: "#f97316",
  signalInfo: "#22d3ee",
  signalNeutral: "#9ca3af",

  // --- اسلات‌های بج سیگنال (مصرف‌شده توسط signals.style: "slot:badgeBg") ---
  badgeBg: "rgba(255,255,255,0.08)",
  badgeBorder: "rgba(255,255,255,0.15)",
} satisfies import("../../types").ChartThemePaletteInput;
