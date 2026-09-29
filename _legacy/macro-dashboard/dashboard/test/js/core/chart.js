"use strict";
/* Macro Backend — test UI basis : tiny pure-SVG sparkline renderer. */
(function (g) {
  const NS = (g.Macro = g.Macro || {});

  function colorOf(dir) {
    if (dir === "up") return "#34c98a";
    if (dir === "down") return "#ff6d6a";
    return "#8b98b5";
  }

  /**
   * spark(points, dir)
   *   points : [{date, value}, ...]  (history.display)
   *   dir    : trend direction for stroke colour.
   * Returns an inline SVG string fitted to its container (polymorphic area
   * underneath + stroked line + last-point dot).
   */
  function spark(points, dir) {
    const col = colorOf(dir);
    const arr = (points || []).map((p) => Number(p.value)).filter((n) => Number.isFinite(n));
    if (arr.length < 2) return '<div class="muted">no history</div>';

    const W = 176;
    const H = 34;
    let min = Infinity;
    let max = -Infinity;
    for (const n of arr) {
      if (n < min) min = n;
      if (n > max) max = n;
    }
    const range = max - min || 1;
    const step = (W - 4) / (arr.length - 1);

    const xy = arr.map((v, i) => [
      2 + i * step,
      H - 2 - ((v - min) / range) * (H - 4),
    ]);

    const poly = xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const last = xy[xy.length - 1];
    const areaPts = `${poly} ${last[0].toFixed(1)},${H - 1} 2,${H - 1}`;

    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" width="100%" height="' + H + '">' +
      '<polygon points="' + areaPts + '" fill="' + col + '" fill-opacity="0.09"/>' +
      '<polyline points="' + poly + '" fill="none" stroke="' + col +
        '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.1" fill="' + col + '"/>' +
      "</svg>"
    );
  }

  NS.colorOf = colorOf;
  NS.spark = spark;
})(window);
