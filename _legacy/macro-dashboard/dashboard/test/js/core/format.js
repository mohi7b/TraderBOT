"use strict";
/* Macro Backend — test UI basis : number / colour helpers (no state). */
(function (g) {
  const NS = (g.Macro = g.Macro || {});

  /** Number with — for null/NaN (max 2 fraction digits by default). */
  function num(v, d) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
    return Number(v).toLocaleString("en-US", {
      maximumFractionDigits: d == null ? 2 : d,
    });
  }
  /** Class for +/--signed numbers (pos/neg), neutral on 0. */
  function signClass(v) {
    if (!v || Number.isNaN(Number(v))) return "";
    return Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "";
  }
  /** Format a value that stands for a percentage. */
  function pct(v) {
    return num(v) + "%";
  }
  /** Small arrow glyph for a trend direction. */
  function arrow(d) {
    return d === "up" ? "▲" : d === "down" ? "▼" : "▶";
  }
  /* Drop verbose parenthetical (units like "Index (CPI)" -> "Index"). */
  function shortUnit(u) {
    if (!u) return "";
    const s = String(u).replace(/\s*\([^)]*\)\s*/g, "").trim();
    return s.length <= 14 ? s : s.slice(0, 11) + "…";
  }
  NS.num = num;
  NS.signClass = signClass;
  NS.pct = pct;
  NS.arrow = arrow;
  NS.shortUnit = shortUnit;
})(window);
