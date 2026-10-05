#!/usr/bin/env node
/*
 * Dependency-free runtime test for navis-landing/index.html.
 *
 * The redesign keeps the original inline <script> untouched and re-points the
 * markup at a new shell. This test proves that contract at *runtime* without a
 * browser: it parses the live half of index.html into a minimal DOM, executes
 * the preserved script bytes inside it and asserts the observable behaviour
 * (countdown, counters, reveal, market feed, treasury clock, toast, mobile menu,
 * language switcher, wallet connect + estimate).
 *
 *   node tools/runtime-test.cjs
 *
 * Requires Node >= 18. For a real-browser pass see tools/smoke-test.cjs.
 *
 * Sandbox notes for anyone adding checks: selectors support `#id`, `.class`,
 * `[attr=value]` and plain tags (no descendant combinators), and page timers run
 * on the real clock, so assertions wait out the script's own 1s / 2.6s / 3.2s
 * intervals instead of faking time.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PAGE = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(PAGE, "utf8");

/* ------------------------------------------------------------------ *
 *  Minimal DOM: only what the landing script actually touches.
 * ------------------------------------------------------------------ */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAWTEXT = new Set(["script", "style"]);

function tagEnd(text, from) {
  let quote = null;
  for (let i = from + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return i;
  }
  return text.length;
}

class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = Object.create(null);
    this.listeners = Object.create(null);
    this.classes = new Set();
    this.value = "";
    this.offsetWidth = 0;
    // layout stubs the landing script reads/writes
    this.style = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 900;
    this.clientWidth = 1280;
  }

  get classList() {
    const set = this.classes;
    return {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      contains: (n) => set.has(n),
      toggle: (n) => (set.has(n) ? (set.delete(n), false) : (set.add(n), true)),
    };
  }

  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "class") this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get lang() {
    return this.getAttribute("lang") || "";
  }

  set lang(value) {
    this.setAttribute("lang", value);
  }

  get dir() {
    return this.getAttribute("dir") || "";
  }

  set dir(value) {
    this.setAttribute("dir", value);
  }

  get children() {
    return this.childNodes.filter((n) => n instanceof El);
  }

  get textContent() {
    return this.childNodes.map((n) => (typeof n === "string" ? n : n.textContent)).join("");
  }

  set textContent(value) {
    this.childNodes = value === "" ? [] : [String(value)];
  }

  get innerHTML() {
    return this.childNodes.map((n) => (typeof n === "string" ? n : n.outerHTML)).join("");
  }

  set innerHTML(value) {
    this.childNodes = [];
    parseFragment(String(value), this);
  }

  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Object.keys(this.attrs).map((k) => ` ${k}="${this.attrs[k]}"`).join("");
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (matches(child, selector)) found.push(child);
        walk(child);
      });
    };
    walk(this);
    return found;
  }

  dispatchEvent(event) {
    let node = this;
    while (node) {
      const handlers = node.listeners && node.listeners[event.type];
      if (handlers) handlers.slice().forEach((fn) => fn.call(node, event));
      if (event.stopped) break;
      node = node.parentNode;
    }
    return !event.prevented;
  }
}

function matches(el, selector) {
  const sel = selector.trim();
  if (sel.startsWith("#")) return el.getAttribute("id") === sel.slice(1);
  if (sel.startsWith(".")) return el.classes.has(sel.slice(1));
  const attr = /^\[([-\w]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
  if (attr) {
    return attr[2] === undefined
      ? el.getAttribute(attr[1]) !== null
      : el.getAttribute(attr[1]) === attr[2];
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function makeEvent(type, target, props = {}) {
  return Object.assign(
    {
      type,
      target,
      stopped: false,
      prevented: false,
      stopPropagation() { this.stopped = true; },
      preventDefault() { this.prevented = true; },
    },
    props
  );
}

/* ------------------------------------------------------------------ *
 *  HTML -> El tree (attribute values, nesting and class lists are kept;
 *  script/style bodies are captured as raw text and never executed).
 * ------------------------------------------------------------------ */
function parseFragment(text, parent = null) {
  const nodes = [];
  const stack = [];

  const target = () => (stack.length ? stack[stack.length - 1] : parent);
  const append = (node) => {
    if (typeof node !== "string") node.parentNode = target();
    (target() ? target().childNodes : nodes).push(node);
  };

  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      append(decode(text.slice(i)));
      break;
    }
    if (lt > i) append(decode(text.slice(i, lt)));

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<!", lt) || text.startsWith("<?", lt)) {
      const end = text.indexOf(">", lt);
      i = end < 0 ? text.length : end + 1;
      continue;
    }

    const gt = tagEnd(text, lt);
    const inner = text.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s >= 0; s -= 1) {
        if (stack[s].tagName.toLowerCase() === name) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const name = body.split(/[\s/]/)[0].toLowerCase();
    const el = new El(name);

    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = attrRe.exec(body.slice(name.length)))) {
      el.setAttribute(m[1], m[3] ?? m[4] ?? m[5] ?? "");
    }
    append(el);

    if (selfClosing || VOID.has(name)) continue;

    if (RAWTEXT.has(name)) {
      const close = text.toLowerCase().indexOf(`</${name}`, i);
      const end = close < 0 ? text.length : close;
      if (end > i) el.childNodes.push(text.slice(i, end));
      i = end;
      continue;
    }
    stack.push(el);
  }
  return nodes;
}

function decode(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/* ------------------------------------------------------------------ *
 *  document / window sandbox
 * ------------------------------------------------------------------ */
function createWindow() {
  const storage = new Map();
  return {
    storage,
    performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Number(process.hrtime.bigint() / 1000000n)), 16),
    matchMedia: (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }),
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

function createDocument(root) {
  const doc = {
    documentElement: root,
    head: root.querySelector("head"),
    body: root.querySelector("body"),
    listeners: Object.create(null),
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    getElementById: (id) => root.querySelector(`#${id}`),
    createElement: (tag) => new El(tag),
  };
  root.parentNode = doc;
  return doc;
}

class IntersectionObserverStub {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
  }
  observe(target) {
    this.targets.add(target);
    setTimeout(() => {
      if (this.targets.has(target)) this.callback([{ target, isIntersecting: true }], this);
    }, 0);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 *  runner
 * ------------------------------------------------------------------ */
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass });
  const extra = !pass && detail ? ` -> ${detail}` : "";
  console.log(`[${pass ? "ok  " : "FAIL"}] ${name}${extra}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function splitRegions(page) {
  const opener = /^<template id="legacy-page" data-legacy-inert>\s*$/m.exec(page);
  if (!opener) throw new Error("legacy <template> opener not found");
  const live = page.slice(0, opener.index);
  const rest = page.slice(opener.index);
  const close = rest.indexOf("</template>");
  if (close < 0) throw new Error("legacy <template> is never closed");
  const tail = rest.slice(close + "</template>".length);
  const open = tail.indexOf("<script>");
  const end = tail.indexOf("</script>", open);
  if (open < 0 || end < 0) throw new Error("preserved inline <script> not found");
  return { live, script: tail.slice(open + "<script>".length, end) };
}

async function main() {
  const { live, script } = splitRegions(html);
  const root = parseFragment(live).find((n) => n instanceof El && n.tagName === "HTML");
  if (!root) throw new Error("no <html> element in the live shell");
  const doc = createDocument(root);
  const win = createWindow();

  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => doc.querySelectorAll(sel);
  const txt = (sel) => ($(sel) ? $(sel).textContent.trim() : "<missing>");
  const click = (el) => el.dispatchEvent(makeEvent("click", el));
  const errors = [];

  // Execute the shipped script bytes; a browser "pageerror" equals a throw here.
  try {
    new Function("window", "document", "IntersectionObserver", script)(win, doc, IntersectionObserverStub);
  } catch (err) {
    errors.push(`boot: ${err.stack || err.message}`);
  }
  check("the preserved script boots without throwing", errors.length === 0, errors.join(" | "));
  check("live shell parses to an <html> document with a body", Boolean(doc.body));
  check("the legacy template is excluded from the live DOM", $("#legacy-page") === null);
  const priceBefore = txt("#livePrice");

  /* ---------- countdown ---------- */
  const countdown = $("#countdown");
  const cell = (unit) => (countdown ? countdown.querySelector(`[data-unit="${unit}"]`) : null);
  const units = ["days", "hours", "minutes", "seconds"];
  check("#countdown exposes its four data-unit cells", units.every((u) => cell(u) !== null), units.map((u) => Boolean(cell(u))).join(","));
  check("countdown values are numeric", units.every((u) => /^\d{1,3}$/.test(cell(u).textContent.trim())), units.map((u) => cell(u) && cell(u).textContent.trim()).join("|"));
  const secBefore = cell("seconds").textContent.trim();
  await sleep(1200);
  check("countdown ticks every second", secBefore !== cell("seconds").textContent.trim(), `${secBefore} -> ${cell("seconds").textContent.trim()}`);
  check("countdown cells run the flip animation", cell("seconds").classes.has("flip"));
  check("the 18-day target is persisted", Number(win.storage.get("navis-presale-target")) > Date.now());

  /* ---------- reveal + counters ---------- */
  await sleep(1800);
  const reveals = $$(".reveal");
  check("every .reveal block activates in view", reveals.length > 0 && reveals.every((el) => el.classes.has("in")), `${reveals.filter((el) => el.classes.has("in")).length}/${reveals.length}`);
  const counters = $$(".counting").map((el) => el.textContent.trim()).join(",");
  check("counters animate to their data-count values", counters === "100,1,0.039,100", counters);

  /* ---------- market + treasury feed ---------- */
  await sleep(2800);
  const priceAfter = txt("#livePrice");
  check("#livePrice keeps the $0.xxxxx format", /^\$\d+\.\d{5}$/.test(priceAfter), priceAfter);
  check("#livePrice ticks with the market feed", priceBefore !== priceAfter, `${priceBefore} -> ${priceAfter}`);
  check("#netInflow is formatted as +$…", /^\+\$[\d,]+$/.test(txt("#netInflow")), txt("#netInflow"));
  await sleep(800);
  check("#tClock shows HH:MM:SS", /^\d{2}:\d{2}:\d{2}$/.test(txt("#tClock")), txt("#tClock"));
  check("#tBlock shows #<number>", /^#[\d,]+$/.test(txt("#tBlock")), txt("#tBlock"));
  check("#tTreasury is currency formatted", /^\$[\d,]+$/.test(txt("#tTreasury")), txt("#tTreasury"));
  check("#tFloor keeps five decimals", /^\$0\.\d{5}$/.test(txt("#tFloor")), txt("#tFloor"));
  check("#tRatio reports a percentage", /^\d{2,3}\.\d%$/.test(txt("#tRatio")), txt("#tRatio"));
  check("#tHolders is a plain count", /^[\d,]+$/.test(txt("#tHolders")), txt("#tHolders"));
  check("#tRedeemed is a plain count", /^[\d,]+$/.test(txt("#tRedeemed")), txt("#tRedeemed"));
  check("#year shows the current year", txt("#year") === String(new Date().getFullYear()), txt("#year"));

  /* ---------- toast, mobile menu, language switcher ---------- */
  check("#toast starts hidden", !$("#toast").classes.has("show"));
  check("#mobileMenu starts hidden", $("#mobileMenu").classes.has("hidden"));
  click($("#menuToggle"));
  check("#menuToggle reveals #mobileMenu", !$("#mobileMenu").classes.has("hidden"));
  check("#menuToggle sets aria-expanded=true", $("#menuToggle").getAttribute("aria-expanded") === "true", $("#menuToggle").getAttribute("aria-expanded"));
  click($("#mobileMenu").querySelector("a"));
  check("a menu link closes #mobileMenu", $("#mobileMenu").classes.has("hidden"));

  click($("#langToggle"));
  check("#langToggle reveals #langMenu", !$("#langMenu").classes.has("hidden"));
  const flagBefore = $("#langToggle").querySelector(".flag").innerHTML;
  const english = $$(".lang-btn").find((b) => b.getAttribute("data-lang") === "en");
  check('.lang-btn[data-lang="en"] is present', Boolean(english));
  click(english);
  check("#langMenu closes after picking a language", $("#langMenu").classes.has("hidden"));
  check("the picked language is aria-pressed", english.getAttribute("aria-pressed") === "true", english.getAttribute("aria-pressed"));
  check("html lang switches to en", doc.documentElement.getAttribute("lang") === "en", doc.documentElement.getAttribute("lang"));
  check("html dir switches to ltr", doc.documentElement.getAttribute("dir") === "ltr", doc.documentElement.getAttribute("dir"));
  check("#langCurrentLabel shows the picked label", txt("#langCurrentLabel") === "English", txt("#langCurrentLabel"));
  const flagAfter = $("#langToggle").querySelector(".flag").innerHTML;
  check("the toggle flag is swapped for the picked one", flagAfter.length > 0 && flagAfter !== flagBefore);
  check("the switch raises the toast", $("#toast").classes.has("show"));
  check("#toastText carries the message", txt("#toastText").length > 1, txt("#toastText"));

  /* ---------- wallet + estimate ---------- */
  const amount = $("#usdtAmount");
  amount.value = "2500";
  amount.dispatchEvent(makeEvent("input", amount));
  check("the estimate recalculates from the USDT input", txt("#tokenEstimate") === "250,000 NAVIS", txt("#tokenEstimate"));
  check("#connectWallet starts disconnected", !$("#connectWallet").classes.has("connected"));
  click($("#connectWallet"));
  await sleep(60);
  check("#connectWallet enters the connected state", $("#connectWallet").classes.has("connected"));
  check("#connectWallet shows the demo address", /^0x[0-9A-F]{4}…[0-9A-F]{4}$/.test($("#connectWallet").textContent.trim()), $("#connectWallet").textContent.trim());
  check("#walletStatus reports the demo wallet", txt("#walletStatus").includes("نمایشی"), txt("#walletStatus"));
  check("connect raises the toast again", $("#toast").classes.has("show"));
  await sleep(3500);
  check("the toast auto-hides after 3.4s", !$("#toast").classes.has("show"));
  check("no uncaught runtime errors", errors.length === 0, errors.join(" | "));
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log("RESULT:", failed.length === 0 ? "PASS" : "FAIL");
    // The sandbox leaves the page's own timers running, so exit explicitly.
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("[FAIL] runtime test crashed:", err);
    process.exit(1);
  });
