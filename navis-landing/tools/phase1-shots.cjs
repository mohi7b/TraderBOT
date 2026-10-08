/* Capture the phase-1 sections that the stock script does not know about. */
"use strict";
const path = require("node:path");
const puppeteer = require("puppeteer");

const ROOT = "/home/mohsen/TraderBOT/navis-landing";
const OUT = path.join(ROOT, "preview");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage();
  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`file://${path.join(ROOT, "index.html")}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await sleep(900);
    for (const id of ["trust", "presale", "treasury", "genesis"]) {
      await page.evaluate((t) => document.getElementById(t).scrollIntoView({ block: "start" }), id);
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-p1-${id}.png`) });
      console.log(`[ok] ${vp.name} #${id}`);
    }
  }
  await browser.close();
})().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(1);
});
