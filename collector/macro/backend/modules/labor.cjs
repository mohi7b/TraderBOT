"use strict";
// Macro Backend — Labor module
// Builds the "1C_labor" dashboard group (Unemployment / Employment).
const { buildGroup } = require("../picker.cjs");

module.exports = function buildLaborJSON() {
  return buildGroup("1C_labor", ["UNEMP", "EMP"], {
    title: "Labor",
  });
};