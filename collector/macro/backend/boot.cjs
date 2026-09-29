"use strict";
/* Macro Backend — boot entry (single runtime source)
 * `node backend/boot.cjs` -> starts canonical http layer (http.cjs).
 * Anything (CLI/D2, dashboard preview) may `require('./http.cjs').start()`.
 */
const { start } = require("./http.cjs");
const PORT = Number(process.env.MACRO_BACKEND_PORT) || 4001;
module.exports = start(PORT);
if (require.main === module) {
  // listen is already called above; keep a clean message via http.cjs.
}
