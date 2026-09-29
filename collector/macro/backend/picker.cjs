"use strict";

/**
 * ============================================================
 * Macro Backend — Series Picker (public facade)
 * ============================================================
 * Thin facade kept for backward compatibility. All logic now lives in
 * `./core/picker_lib.cjs` (the professional, dashboard-ready builder).
 *
 * Public API stays identical for existing modules/server/test.html:
 *   const { buildGroup } = require("./picker.cjs");
 *   buildGroup("1A_inflation", ["CPI","CORE_CPI","PPI"], opts);
 * ============================================================
 */

module.exports = require("./core/picker_lib.cjs");

