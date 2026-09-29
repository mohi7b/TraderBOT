"use strict";
/* Macro Backend — Row 1 demo view.
   Renders the INFLATION group as a per-country panel.
   Each metric card = one inflation series (CPI / CORE_CPI / PPI / GDP_DEFL):
     latest value (big), yoy% signed colour, mom%, as-of, unit/freq,
     trend direction+strength, 3y sparkline, amber border if risk flag.
   Pure data-consumer: reads only the group JSON object handed by app.js. */
(function (g) {
  const NS = (g.Macro = g.Macro || {});
  const F = g.Macro; // same namespace provides num/signClass/pct/arrow/shortUnit/spark

  function esc(v) {
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function chip(value, extra) {
    const cls = extra || "";
    return '<span class="chip ' + cls + '">' + value + "</span>";
  }

  /* ---- one series -> one metric card ---- */
  function metricHTML(s) {
    const L = s.latest || {};
    const t = s.trend || {};
    const dir = t.direction || "flat";
    const yoy = Number(L.yoy);
    const risk = s.risk_flags || {};
    const riskCls = risk.has_risk ? " has-risk" : "";
    const ind = s.indicator || {};

    const bad = [];
    const keys = ["high_volatility", "sharp_reversal", "abnormal_momentum"];
    for (const k of keys) if (risk[k]) bad.push(esc(k.replace(/_/g, " ")));
    const badges = bad.length
      ? '<div class="m-line">' + bad.map((b) => chip(b, "")) + "</div>"
      : "";

    const value = Number(L.value);
    const spark = F.spark((s.history && s.history.display) || [], dir);

    return (
      '<article class="metric' + riskCls + '">' +
        '<div class="m-top">' +
          '<span class="m-title">' + esc(ind.code || s.indicator_code || "?") + "</span>" +
          (ind.label ? '<span class="m-sub">' + esc(ind.label) + "</span>" : "") +
        "</div>" +
        '<div class="m-num">' + F.num(value) +
          (s.unit ? '<span class="acc"> ' + esc(F.shortUnit(s.unit)) + "</span>" : "") +
        "</div>" +
        '<div class="m-line">' +
          '<span class="' + F.signClass(yoy) + '">y/y ' + F.pct(yoy) + "</span>" +
          '<span>m/m ' + F.pct(Number(L.mom)) + "</span>" +
          '<span>as-of ' + esc(L.date || "—") + "</span>" +
          '<span class="quiet">' + esc((s.frequency || "?").toUpperCase()) + "</span>" +
        "</div>" +
        badges +
        '<div class="spark">' + spark + "</div>" +
      "</article>"
    );
  }

  /* ---- one country -> one <details> panel with its metrics grid ---- */
  function panelHTML(code, rows) {
    const name = rows[0].country && rows[0].country.name ? rows[0].country.name : "";
    const codes = rows
      .map((r) => (r.indicator ? r.indicator.code : "?"))
      .sort();
    const grid = rows.map(metricHTML).join("");
    return (
      '<details class="country-panel" open>' +
        "<summary>" +
          '<span class="cp-code">' + esc(code) + "</span>" +
          '<span class="cp-name">' + esc(name) + "</span>" +
          codes.map((c) => chip(esc(c))).join("") +
          '<span class="cp-score quiet">' + rows.length + " series</span>" +
        "</summary>" +
        '<div class="metrics">' + grid + "</div>" +
      "</details>"
    );
  }

  /* ---- entry: whole group -> document-ready HTML for main #view ---- */
  function render(group) {
    if (!group || !group.series) return '<p class="muted">empty / unparsed group payload</p>';

    const sum = group.summary || {};
    const series = group.series;

    const trendCls =
      sum.global_trend === "heating" ? " dir-up" :
      sum.global_trend === "cooling" ? " dir-down" : "";
    const trendTxt =
      (sum.global_trend || "n/a") + "  ·  avg_yoy " + F.pct(sum.avg_yoy) +
      "  ·  avg_mom " + F.pct(sum.avg_mom);

    // group by ISO3
    const byCountry = {};
    const order = [];
    for (const s of series) {
      const cc = s.country && s.country.code;
      if (!cc || !byCountry[cc]) {
        if (cc) {
          byCountry[cc] = [];
          order.push(cc);
        }
      }
      if (cc) byCountry[cc].push(s);
    }
    const countryCount = order.length;
    const panels = order
      .sort()
      .map((cc) => panelHTML(cc, byCountry[cc].sort((a, b) => {
        const c = (a.indicator && a.indicator.code) || "";
        const d = (b.indicator && b.indicator.code) || "";
        return c < d ? -1 : c > d ? 1 : 0;
      })))
      .join("");

    return (
      '<section class="g-head">' +
        '<h2>1A_inflation · Inflation <span class="muted">(n=' + series.length + ", countries=" + countryCount + ")</span></h2>" +
        '<div class="sum">' +
          '<span class="pill ' + trendCls + '">global ' + esc(trendTxt) + "</span>" +
        "</div>" +
      "</section>" +
      panels
    );
  }

  NS.renderInflation = render;
})(window);
