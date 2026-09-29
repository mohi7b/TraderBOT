"use strict";
// Macro Backend — Inflation module
// Builds the "1A_inflation" dashboard group (CPI / Core CPI / PPI).
const { buildGroup } = require("../picker.cjs");

module.exports = function buildInflationJSON() {
  // p2 path 1 (data-driven): anchors CPI/CORE_CPI/PPI fixed; breadth canon
  // GDP_DEFL (WB NY.GDP.DEFL.KD.ZG) added — present in core.db.
  // (WAGE/ULC and CPI Food/Energy etc. => ingest-task gap, absent upstream.)
  return buildGroup("1A_inflation", ["CPI", "CORE_CPI", "PPI", "GDP_DEFL"], {
    title: "Inflation",
  });
};