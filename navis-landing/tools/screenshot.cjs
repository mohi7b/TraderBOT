#!/usr/bin/env node
/*
 * Real-browser screenshots of the landing page (headless Chromium via puppeteer).
 *
 *   node tools/screenshot.cjs                       # file:// over index.html
 *   NAVIS_URL=http://127.0.0.1:8080/ node tools/screenshot.cjs
 *   NAVIS_CHROME=/path/to/chrome node tools/screenshot.cjs
 *
 * Writes <repo>/navis-landing/preview/{desktop,tablet,mobile}-{hero,full}.png
 *
 * On a machine without the browser's system libraries, point LD_LIBRARY_PATH at
 * a local extraction first, e.g.:
 *   LD_LIBRARY_PATH=$HOME/navis-libs/root/usr/lib/x86_64-linux-gnu node tools/screenshot.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "preview");
const TARGET = process.env.NAVIS_URL || `file://${path.join(ROOT, "index.html")}`;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

/* Section anchors captured separately for close inspection. */
const ANCHORS = ["platform", "about", "roadmap", "tokenomics", "presale", "treasury", "community"];

/* NAVIS_VIEWPORTS=desktop,mobile   NAVIS_SECTIONS=none|desktop|all */
const WANTED = (process.env.NAVIS_VIEWPORTS || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const SECTIONS = process.env.NAVIS_SECTIONS || "desktop";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function captureSections(page, prefix) {
  const ids = await page.evaluate(
    (wanted) => wanted.filter((id) => document.getElementById(id)),
    ANCHORS,
  );
  for (const id of ids) {
    await page.evaluate((target) => {
      document.getElementById(target).scrollIntoView({ block: "start" });
    }, id);
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, `${prefix}-${id}.png`) });
    console.log(`[ok] ${prefix.padEnd(7)} #${id}`);
  }
}

/* Walk the whole page so every IntersectionObserver reveal fires, then go home. */
async function settle(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1200);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`[info] target: ${TARGET}`);
  const browser = await puppeteer.launch({
    headless: "shell",
    executablePath: process.env.NAVIS_CHROME || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
  });

  try {
    for (const vp of VIEWPORTS) {
      if (WANTED.length && !WANTED.includes(vp.name)) continue;
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.goto(TARGET, { waitUntil: "networkidle2", timeout: 60000 });
      await settle(page);

      const hero = path.join(OUT, `${vp.name}-hero.png`);
      await page.screenshot({ path: hero });

      const full = path.join(OUT, `${vp.name}-full.png`);
      await page.screenshot({ path: full, fullPage: true });
      const kb = (fs.statSync(full).size / 1024).toFixed(0);

      const title = await page.title();
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      console.log(
        `[ok] ${vp.name.padEnd(7)} ${vp.width}x${vp.height}  page ${height}px  ${kb} KB  "${title}"`,
      );

      if (SECTIONS === "all" || (SECTIONS === "desktop" && vp.name === "desktop")) {
        await captureSections(page, vp.name);
      }
      await page.close();
    }
    console.log(`[ok] screenshots in ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[FAIL] screenshot run crashed:", err);
  process.exit(1);
});
