"use strict";
/* C-phase smoke: validate index mom/yoy are % and summary filters level.
   Run after unit overrides to confirm no regression. */
const path = require("path");
const P = path.join(__dirname, "..", "backend", "core", "picker_lib.cjs");
const { buildGroup } = require(P);

function show(title, g) {
  console.log("\n##### " + title + " #####");
  console.log("summary:", JSON.stringify(g.summary));
  for (const s of g.series.slice(0, 6)) {
    console.log(JSON.stringify({
      key: s.id,
      unit: s.unit,
      kind: s.series_kind,
      freq: s.frequency,
      value: s.latest.value,
      mom: s.latest.mom,
      yoy: s.latest.yoy,
    }));
  }
}

try {
  const infl = buildGroup("1A_inflation", ["CPI", "CORE_CPI", "PPI"], { title: "Inflation (test)" });
  show("INFLATION", infl);
  const grow = buildGroup("1B_growth", ["GDP", "IND_PRO", "RETAIL_SALES"], { title: "Growth (test)" });
  show("GROWTH", grow);
} catch (e) {
  console.error("SMOKE_FAIL", (e && e.stack) || e);
}
