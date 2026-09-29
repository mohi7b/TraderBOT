"use strict";
// Macro Backend — Growth module
// Builds the "1B_growth" dashboard group (GDP / Industrial Production /
// Retail Sales). RETAIL_SALES is in the canonical list as a future hook;
// if no provider yet feeds the core DB it simply contributes no rows —
// GDP + IND_PROD still populate the group.
const { buildGroup } = require("../picker.cjs");

module.exports = function buildGrowthJSON() {
  return buildGroup("1B_growth", ["GDP", "IND_PROD", "RETAIL_SALES"], {
    title: "Growth",
  });
};