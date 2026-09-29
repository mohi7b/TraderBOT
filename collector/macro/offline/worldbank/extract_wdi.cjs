/**
 * Extract the WDI bulk zips and expose the key files individually.
 * - WDI_CSV.zip  -> WDI_CSV/   (WDICSV.csv = data bulk, WDICountry.csv = codes,
 *                              WDISeries.csv = metadata, ...)
 * - WDIEXCEL.zip -> WDIEXCEL/
 * Run:  node collector/macro/offline/worldbank/extract_wdi.cjs
 */
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");

const WB_DIR = __dirname;
const zips = ["WDI_CSV.zip", "WDIEXCEL.zip"];

(async () => {
  for (const z of zips) {
    const zp = path.join(WB_DIR, z);
    if (!fs.existsSync(zp)) { console.log(`skip ${z} (missing)`); continue; }
    const base = z.replace(/\.zip$/i, "");
    const out = path.join(WB_DIR, base);
    fs.mkdirSync(out, { recursive: true });
    await new Promise((resolve) => {
      fs.createReadStream(zp)
        .pipe(unzipper.Extract({ path: out }))
        .on("close", resolve)
        .on("error", (e) => { console.log(`ERR ${z}: ${e.message}`); resolve(); });
    });
    console.log(`✅ extracted ${z} -> ${base}/`);
  }
  // List key files
  console.log("\nKey files in WDI_CSV/:");
  const d = path.join(WB_DIR, "WDI_CSV");
  if (fs.existsSync(d)) fs.readdirSync(d).forEach((f) => console.log("  -", f));
})();