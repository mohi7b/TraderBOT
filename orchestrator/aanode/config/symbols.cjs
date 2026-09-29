/* ============================================================
 * File: symbols.cjs
 * Section: /aanode/config
 * Role:
 *   Active trading symbols
 *   Kept as a thin alias to the central exchange config.
 * ============================================================ */

const { symbols } = require("./exchanges.cjs");

module.exports = { symbols };
