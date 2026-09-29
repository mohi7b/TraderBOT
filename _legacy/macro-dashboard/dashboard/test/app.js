"use strict";
/* Macro Backend — Test dashboard loader.
   Pure vanilla JS, no deps. Consumes the Bloomberg-style group JSON that
   collector/macro/backend serves at /api/groups and /api/inflation|growth|labor. */

const $ = (s) => document.querySelector(s);

const FA = { Inflation: "تورم", Growth: "رشد", Labor: "بازار کار" };
const PERSIAN_DIR = { Inflation: "تورم", Growth: "رشد", Labor: "بازار کار" };

const num = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

function svcSpark(points, dir) {
  const color =
    dir === "up" ? "#34c98a" : dir === "down" ? "#ff6d6a" : "#8b98b5";
  const val = points.map((p) => Number(p.value));
  const min = Math.min(...val), max = Math.max(...val);
  const span = max - min || 1;
  const W = 180, H = 46, pad = 2;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const pts = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (Number(p.value) - min) / span) * (H - pad * 2);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="g${Math.floor(Math.random()*1e6)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#g${'gid'})" opacity="0.0"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6"/>
  </svg>`;
}

function riskBadges(r) {
  const keys = ["high_volatility", "sharp_reversal", "abnormal_momentum", "vol_spike", "near_peak", "near_trough"];
  return keys
    .filter((k) => r[k] === true)
    .map((k) => `<span class="risk" title="${k}">${k.replace(/_/g, " ")}</span>`)
    .join("");
}

function trendArrow(d) {
  return d === "up" ? "▲" : d === "down" ? "▼" : "▶";
}

function cardHTML(s) {
  const dir = s.trend && s.trend.direction;
  const spark = svcSpark((s.history && s.history.display) || [], dir);
  const risk = s.risk_flags || {};
  const label = (s.indicator && s.indicator.label) || s.indicator.code;
  const cat = (s.indicator && s.indicator.category) || s.indicator.code;
  const cc = (s.country && s.country.code) || "?";
  const cname = (s.country && s.country.name) || "";
  const unitTag = s.unit ? `<span class="muted">${s.unit}</span>` : "";
  const hasRisk = risk.has_risk ? ' class="has-risk"' : "";
  return `
  <section class="card"${hasRisk}>
    <div class="c-head">
      <span class="flag">${(s.dataset || "").toLowerCase()}</span>
      <div class="c-titles">
        <div class="co">${cc}${cname ? ` <span class="muted">· ${cname}</span>` : ""}</div>
        <div class="ind">${label} <span class="muted">/ ${cat}</span></div>
      </div>
      ${riskBadges(risk)}
    </div>
    <div class="c-main">
      <div class="big">
        <span class="val">${num(s.latest && s.latest.value)}</span>
        <span class="yoy ${(s.latest && s.latest.yoy || 0) >= 0 ? "pos" : "neg"}">${num(s.latest && s.latest.yoy)}% y/y</span>
      </div>
      <div class="meta muted">
        mom ${num(s.latest && s.latest.mom)}% · as-of <b>${(s.latest && s.latest.date) || "—"}</b> · ${(s.frequency || "").toUpperCase()}${unitTag ? " · " + unitTag : ""}
      </div>
      ${spark}
    </div>
    <div class="c-foot">
      <span class="chip dir-${dir}">${trendArrow(dir || "flat")} ${s.trend ? s.trend.direction : "?"}</span>
      <span class="chip">str ${s.trend ? s.trend.strength : "?"}</span>
      <span class="muted">slope3 ${num(s.trend && s.trend.slope_3m)} · momentum ${num(s.trend && s.trend.momentum)} · vol ${num(s.trend && s.trend.volatility)}</span>
    </div>
  </section>`;
}

function renderGroup(g) {
  const sum = g.summary || {};
  const trendTxt =
    sum.global_trend === "heating" ? "heating 🔥" :
    sum.global_trend === "cooling" ? "cooling ❄️" :
    sum.global_trend === "stable" ? "stable ⚖️" : (sum.global_trend || "n/a");

  const head = `
    <div class="g-head">
      <h2>${FA[g.group_title]|| "گروه"} <span class="muted">( ${g.group || g.title || ""} )</span></h2>
      <div class="g-sum">
        <span>global: <b>${trendTxt}</b></span>
        <span>avg_yoy <b>${num(sum.avg_yoy)}%</b></span>
        <span>avg_mom <b>${num(sum.avg_mom)}%</b></span>
        <span class="muted">series ${(g.series||[]).length}</span>
      </div>
    </div>`;

  const cards = (g.series || []).map(cardHTML).join("");
  return `${head}<div class="cards">${cards || '<p class="empty">No series in core.db for this group yet — add data upstream.</p>'}</div>`;
}

let activeKey = null;
function activate(slug, groups) {
  activeKey = slug;
  [...document.querySelectorAll("#tabs button")].forEach((b) =>
    b.classList.toggle("on", b.dataset.slug === slug)
  );
  const g = groups.find((x) => x.slug === slug);
  const view = $("#view");
  view.textContent = "";
  if (!g) { view.textContent = "no group"; return; }
  $("#meta").textContent = g.title + " → " + g.endpoint + "  ·  " + (g.canonical_indicators||[]).join(" / ");
  fetch(g.endpoint)
    .then((r) => r.json())
    .then((data) => { view.innerHTML = renderGroup(data); })
    .catch((e) => { view.innerHTML = "error: " + e.message; });
}

async function boot() {
  try {
    const res = await fetch("/api/groups");
    const groups = (await res.json()).groups.map((g) => ({
      ...g,
      slug: g.key.split("_")[1] || g.key, // 1A_inflation -> inflation
    }));
    const tabs = $("#tabs");
    tabs.innerHTML = "";
    groups.forEach((g) => {
      const b = document.createElement("button");
      b.textContent = `${FA[g.title] || g.title} · ${g.title}`;
      b.dataset.slug = g.slug;
      b.onclick = () => activate(g.slug, groups);
      tabs.appendChild(b);
    });
    $("#meta").textContent = groups.map((g) => g.title).join(" / ") + " — ready";
    let start = groups.find((g) => g.title === "Inflation") || groups[0];
    if (start) activate(start.slug, groups);
  } catch (e) {
    $("#meta").textContent = "Cannot reach /api/groups — is backend running on this origin? " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", boot);
