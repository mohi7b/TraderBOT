#!/usr/bin/env node
/*
 * Runtime smoke test for the NAVIS landing page.
 *
 * Loads ./index.html in headless Chromium and asserts that the *preserved*
 * inline <script> really drives the redesigned shell: countdown, live market
 * feed, treasury clock, counters, reveal animations, mobile menu, language
 * switcher, wallet connect, estimate calculator and toast.
 *
 *   node tools/smoke-test.cjs
 *   NAVIS_CHROME=/path/to/chrome node tools/smoke-test.cjs
 *
 * CDN requests (Tailwind, Google Fonts) are blocked so the test is offline-safe;
 * the page's own inline CSS carries the `.hidden` / `.reveal` behaviour used here.
 */
"use strict";

const path = require("node:path");
const puppeteer = require("puppeteer");

const PAGE = path.resolve(__dirname, "..", "index.html");
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass });
  const mark = pass ? "ok  " : "FAIL";
  const extra = !pass && detail ? ` -> ${detail}` : "";
  console.log(`[${mark}] ${name}${extra}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser() {
  try {
    return await puppeteer.launch({
      headless: "shell",
      executablePath: process.env.NAVIS_CHROME || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
    });
  } catch (err) {
    const message = String((err && err.message) || err);
    if (/Failed to launch|shared libraries|Code: 127/.test(message)) {
      console.log("[skip] headless Chromium cannot start in this environment\n");
      console.log(message.split("\n")[0]);
      console.log("\nInstall the browser libraries, then re-run this file:");
      console.log("  sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \\");
      console.log("       libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0");
      console.log("\nFor a browser-free runtime check use: node tools/runtime-test.cjs");
      process.exit(2);
    }
    throw err;
  }
}

async function run() {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("file:") || url.startsWith("data:")) request.continue();
      else request.abort();
    });

    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`file://${PAGE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const clock = document.querySelector("#tClock");
        return clock && clock.textContent !== "--:--:--";
      },
      { timeout: 8000 }
    );

    const text = (sel) => page.$eval(sel, (el) => el.textContent.trim());
    const hasClass = (sel, cls) => page.$eval(sel, (el, c) => el.classList.contains(c), cls);
    const attr = (sel, name) => page.$eval(sel, (el, n) => el.getAttribute(n), name);

    /* ---------- shell / chrome ---------- */
    check("#year shows the current year", (await text("#year")) === String(new Date().getFullYear()), await text("#year"));
    check("#toast exists and starts hidden", !(await hasClass("#toast", "show")));
    check("#scrollProgress is mounted", (await page.$("#scrollProgress")) !== null);
    check("legacy <template> is inert and separate from the live DOM", await page.evaluate(() => {
      const tpl = document.querySelector("template#legacy-page");
      if (!tpl) return false;
      const live = document.getElementById("year");
      const inert = tpl.content.getElementById("year");
      return Boolean(inert) && inert !== live;
    }));

    /* ---------- countdown ---------- */
    const cells = await page.$$eval("#countdown [data-unit]", (els) =>
      els.map((el) => ({ unit: el.dataset.unit, value: el.textContent.trim() }))
    );
    check("#countdown exposes the four data-unit cells", cells.length === 4, JSON.stringify(cells));
    check("countdown cells are numeric", cells.every((c) => /^\d{1,3}$/.test(c.value)), JSON.stringify(cells));
    const secBefore = await text('#countdown [data-unit="seconds"]');
    await sleep(2200);
    const secAfter = await text('#countdown [data-unit="seconds"]');
    check("countdown ticks (seconds change)", secBefore !== secAfter, `${secBefore} -> ${secAfter}`);

    /* ---------- live market + treasury feed ---------- */
    const priceBefore = await text("#livePrice");
    await sleep(3000);
    const priceAfter = await text("#livePrice");
    check("#livePrice keeps the $0.xxxxx format", /^\$\d+\.\d{5}$/.test(priceAfter), priceAfter);
    check("#livePrice ticks with the market feed", priceBefore !== priceAfter, `${priceBefore} -> ${priceAfter}`);
    check("#netInflow is formatted as +$…", /^\+\$[\d,]+$/.test(await text("#netInflow")), await text("#netInflow"));
    check("#tClock shows HH:MM:SS", /^\d{2}:\d{2}:\d{2}$/.test(await text("#tClock")), await text("#tClock"));
    check("#tBlock shows a block number", /^#[\d,]+$/.test(await text("#tBlock")), await text("#tBlock"));
    check("#tTreasury is currency formatted", /^\$[\d,]+$/.test(await text("#tTreasury")), await text("#tTreasury"));
    check("#tFloor is an ascending 5-decimal price", /^\$0\.\d{5}$/.test(await text("#tFloor")), await text("#tFloor"));
    check("#tRatio is a percentage", /^\d{2,3}\.\d%$/.test(await text("#tRatio")), await text("#tRatio"));
    check("#tHolders is a plain count", /^[\d,]+$/.test(await text("#tHolders")), await text("#tHolders"));

    /* ---------- reveal + counters ---------- */
    await page.evaluate(() => document.querySelector("#tokenomics").scrollIntoView({ block: "center" }));
    await sleep(2300);
    const counters = await page.$$eval(".counting", (els) => els.map((el) => el.textContent.trim()));
    check(
      "tokenomics counters animate to their data-count",
      counters.includes("100") && counters.includes("1") && counters.includes("0.039"),
      JSON.stringify(counters)
    );
    check("reveal sections activate on scroll", (await page.$$eval(".reveal.in", (n) => n.length)) > 0);

    /* ---------- mobile menu ---------- */
    check("#mobileMenu starts hidden", await hasClass("#mobileMenu", "hidden"));
    await page.click("#menuToggle");
    check("#menuToggle reveals #mobileMenu", !(await hasClass("#mobileMenu", "hidden")));
    check("#menuToggle reports aria-expanded=true", (await attr("#menuToggle", "aria-expanded")) === "true", await attr("#menuToggle", "aria-expanded"));
    await page.click('#mobileMenu a[href="#roadmap"]');
    check("a menu link closes #mobileMenu", await hasClass("#mobileMenu", "hidden"));

    /* ---------- language switcher ---------- */
    await page.click("#langToggle");
    check("#langToggle reveals #langMenu", !(await hasClass("#langMenu", "hidden")));
    await page.click('#langMenu .lang-btn[data-lang="en"]');
    check("#langMenu closes after picking a language", await hasClass("#langMenu", "hidden"));
    check("html lang/dir switch to en/ltr", await page.evaluate(
      () => document.documentElement.lang === "en" && document.documentElement.dir === "ltr"
    ));
    check("#langCurrentLabel shows the chosen label", (await text("#langCurrentLabel")) === "English", await text("#langCurrentLabel"));
    check("language switch raises the toast", await hasClass("#toast", "show"));
    check("#toastText carries a message", (await text("#toastText")).length > 1, await text("#toastText"));

    /* ---------- presale wallet + estimate ---------- */
    await page.$eval("#usdtAmount", (el) => {
      el.value = "2500";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    check("estimate recalculates from the USDT input", (await text("#tokenEstimate")) === "250,000 NAVIS", await text("#tokenEstimate"));
    check("#connectWallet starts disconnected", !(await hasClass("#connectWallet", "connected")));
    await page.click("#connectWallet");
    await sleep(400);
    check("#connectWallet enters the connected state", await hasClass("#connectWallet", "connected"));
    check("#walletStatus reports the demo wallet", (await text("#walletStatus")).includes("نمایشی"), await text("#walletStatus"));
    check("connect raises the toast again", await hasClass("#toast", "show"));

    await sleep(3800);
    check("toast auto-hides after its timeout", !(await hasClass("#toast", "show")));

    /* ---------- no runtime exceptions ---------- */
    check("no uncaught page errors", errors.length === 0, errors.join(" | "));
  } finally {
    await browser.close();
  }
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log("RESULT:", failed.length === 0 ? "PASS" : "FAIL");
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("[FAIL] smoke test crashed:", err);
    process.exit(1);
  });
