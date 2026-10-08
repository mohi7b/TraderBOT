#!/usr/bin/env node
/*
 * Owner console contract: boots the admin <script> block of index.html inside a
 * stub DOM with a mocked `window.ethers` + `window.ethereum` and asserts the
 * read + write paths, the owner gate and the wallet-network handling.
 *
 *   node tools/adm-console-harness.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PAGE = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(PAGE, "utf8");

/* ------------------------------ script block ----------------------- */
function adminScript() {
  const marker = "var OWN_TAGS = {";
  const at = html.indexOf(marker);
  if (at < 0) throw new Error("admin script marker not found");
  const open = html.lastIndexOf("<script>", at);
  const close = html.indexOf("</script>", at);
  return html.slice(open + "<script>".length, close);
}
const SCRIPT = adminScript();

/* ------------------------------ DOM stub --------------------------- */
class El {
  constructor(tag, id) {
    this.tagName = String(tag || "div").toUpperCase();
    this.id = id || "";
    this.attrs = Object.create(null);
    this.children = [];
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = Object.create(null);
    this.classes = new Set();
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this.innerHTML = "";
    this.type = "";
    this.style = {};
  }
  get classList() {
    const set = this.classes;
    return {
      add: (...n) => n.forEach((x) => set.add(x)),
      remove: (...n) => n.forEach((x) => set.delete(x)),
      contains: (n) => set.has(n),
      toggle: (n) => (set.has(n) ? (set.delete(n), false) : (set.add(n), true)),
    };
  }
  get className() { return Array.from(this.classes).join(" "); }
  set className(value) {
    this.classes = new Set(String(value == null ? "" : value).split(/\s+/).filter(Boolean));
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type) {
    const event = {
      type, target: this, stopped: false, prevented: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    let walk = this;
    while (walk) {
      (walk.listeners[type] || []).slice().forEach((fn) => fn.call(walk, event));
      if (event.stopped) { break; }
      walk = walk.parentNode;
    }
    return event;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "class") { this.className = value; }
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  appendChild(node) { node.parentNode = this; this.children.push(node); this.childNodes.push(node); return node; }
  removeChild(node) {
    this.children = this.children.filter((c) => c !== node);
    this.childNodes = this.childNodes.filter((c) => c !== node);
    return node;
  }
  get firstChild() { return this.childNodes[0] || null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return false; }
}

/* the stub has no HTML parser: seed the id -> class map straight from the page
   so revealConsole()/applyGate() toggling of `hidden` stays observable. */
const SEEDED = (() => {
  const map = new Map();
  const tagRe = /<([a-zA-Z0-9]+)([^>]*)>/g;
  let match = tagRe.exec(html);
  while (match) {
    const attrs = match[2] || "";
    const idMatch = /id="([^"]+)"/.exec(attrs);
    const classMatch = /class="([^"]*)"/.exec(attrs);
    if (idMatch && classMatch && !map.has(idMatch[1])) { map.set(idMatch[1], classMatch[1]); }
    match = tagRe.exec(html);
  }
  return map;
})();

function createDocument() {
  const registry = new Map();
  const doc = {
    getElementById(id) {
      if (!registry.has(id)) {
        const node = new El("div", id);
        if (SEEDED.has(id)) { node.className = SEEDED.get(id); }
        registry.set(id, node);
      }
      return registry.get(id);
    },
    createElement: (tag) => new El(tag),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    documentElement: new El("html", "html"),
    body: new El("body", "body"),
  };
  doc.node = (id) => doc.getElementById(id);
  doc.text = (id) => doc.getElementById(id).textContent;
  doc.has = (id, name) => doc.getElementById(id).classes.has(name);
  return doc;
}

/* --------------------------- chain fixtures ------------------------ */
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const STRANGER = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";
const DEPLOYMENT = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

const E18 = 10n ** 18n;
const E6 = 10n ** 6n;
const ADDRESSES = DEPLOYMENT.addresses;
const role = (address) => {
  const hit = Object.keys(ADDRESSES).find(
    (key) => ADDRESSES[key].toLowerCase() === String(address).toLowerCase()
  );
  return hit || "unknown";
};

const READS = {
  usdtToken: { symbol: "USDT", decimals: 6n, balanceOf: 50000n * E6 },
  navToken: {
    owner: OWNER, symbol: "NAVIS", decimals: 18n,
    totalSupply: 250000n * E18, MAX_SUPPLY: 1000000000n * E18,
    balanceOf: 1234n * E18, getGenesisBalance: 500n * E18,
    redemptionLockExpiresAt: 0n, lastDirectMintAt: 0n,
    isGenesisHolder: true, isBurner: false,
    paused: false, isPauser: true,
  },
  treasury: {
    owner: OWNER, reserveBalance: 250000n * E6, getTotalReserve: 260000n * E6,
    getNavFloorPrice: 39000n, navFloor: 39000n, lockPeriod: 5184000n,
    paused: true, isPauser: true,
  },
  presale: {
    treasuryVault: ZERO, liquidityPool: ZERO, currentNavFloor: 39000n,
    subPhaseCount: 2n, currentSubPhase: 1n, DEFAULT_LOCK_PERIOD: 7776000n,
    phasePrice: (index) => [41000n, 42000n][Number(index)] || 0n,
    subPhases: (index) => ([
      [300000n * E18, 120000n * E18, 1050000n, true, 2592000n],
      [200000n * E18, 80000n * E18, 950000n, false, 3456000n],
    ][Number(index)] || [0n, 0n, 0n, false, 0n]),
    owner: OWNER,
    paused: false, isPauser: true,
  },
  vesting: {
    owner: OWNER,
    scheduleCount: 2n,
    vestingBalance: 250000000n * E18,
    totalAllocated: 250000000n * E18,
    totalReleased: 25000000n * E18,
    freeBalance: 0n,
    roleShareTotalBps: 2500n,
    roleCount: 2n,
    roleLabelAt: (index) => ["team", "marketing"][Number(index)] || "",
    roleShare: (label) => (String(label) === "team" ? 1500n : 1000n),
    getSchedule: (index) => ([
      [OWNER, "team", 150000000n * E18, 0n, 1739000000n, 31536000n, 94608000n, false, false],
      [STRANGER, "marketing", 100000000n * E18, 25000000n * E18, 1739000000n, 7776000n, 63072000n, true, false],
    ][Number(index)] || [ZERO, "", 0n, 0n, 0n, 0n, 0n, false, false]),
    vestedAmount: (index) => [15200000n * E18, 50000000n * E18][Number(index)] || 0n,
    releasableAmount: (index) => [15200000n * E18, 25000000n * E18][Number(index)] || 0n,
  },
};

/// The recorded descriptor without the vesting module (an older deployment).
function stripVesting() {
  const copy = JSON.parse(JSON.stringify(DEPLOYMENT));
  delete copy.addresses.vesting;
  delete copy.vesting;
  return copy;
}

/// The same address book recorded on BSC testnet: the live case a visitor hits.
const TESTNET_DEPLOYMENT = Object.assign(JSON.parse(JSON.stringify(DEPLOYMENT)), {
  network: "bscTestnet",
  chainId: 97,
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
});
const LIVE_DEPLOYMENTS = {
  "deployments/bscTestnet.json": TESTNET_DEPLOYMENT,
  "deployments/localhost.json": DEPLOYMENT,
};

/* --------------------------- ethers mock --------------------------- */
function makeEthers(options) {
  const log = [];
  const contracts = [];
  /* a dead RPC can be global (true) or per endpoint, e.g. only the hardhat one */
  const rpcDown = (url) => {
    const rule = options.rpcDown;
    if (typeof rule === "function") { return !!rule(url); }
    return !!rule;
  };
  const chainOf = options.chainOf ||
    ((url) => (/(127\.0\.0\.1|localhost)/.test(String(url)) ? 31337 : 97));
  class Contracts {
    constructor(address, abi, runner) {
      const table = READS[role(address)] || {};
      const self = {
        address, abi, runner,
        call(method, args) {
          const entry = (abi || []).find((line) => line.indexOf(" " + method + "(") > -1);
          const isRead = !!(entry && entry.indexOf("view") > -1);
          log.push({ role: role(address), method, args, kind: isRead ? "read" : "write" });
          if (isRead) {
            if (rpcDown(runner && runner.url)) { return Promise.reject(new Error("rpc down")); }
            const entry = table[method];
            const value = typeof entry === "function" ? entry.apply(null, args || []) : entry;
            return Promise.resolve(value === undefined ? 0n : value);
          }
          if (options.rejectWrites) {
            return Promise.reject(new Error("execution reverted: owner only"));
          }
          if (options.hangWrites) { return new Promise(() => {}); }
          return Promise.resolve({
            hash: "0x" + "ab".repeat(32),
            wait: () => Promise.resolve({ status: 1 }),
          });
        },
      };
      contracts.push({ address, abi, runner });
      return new Proxy(self, {
        get(target, prop) {
          if (prop in target) { return target[prop]; }
          if (typeof prop !== "string") { return undefined; }
          return (...args) => target.call(prop, args);
        },
        set(target, prop, value) { target[prop] = value; return true; },
      });
    }
  }
  return {
    log, contracts,
    mocked: {
      Contract: Contracts,
      JsonRpcProvider: class {
        constructor(url) { this.url = url; }
        getNetwork() {
          if (rpcDown(this.url)) { return Promise.reject(new Error("ECONNREFUSED")); }
          return Promise.resolve({ chainId: BigInt(chainOf(this.url)) });
        }
      },
      BrowserProvider: class {
        constructor(injected, chain) { this.injected = injected; this.chain = chain; }
        getSigner() { return Promise.resolve({ address: OWNER }); }
      },
      parseUnits(value, decimals) {
        const parts = String(value).split(".");
        const frac = (parts[1] || "").slice(0, decimals).padEnd(decimals, "0");
        return BigInt((parts[0] || "0") + frac);
      },
      formatUnits: (value) => String(value),
    },
  };
}



/* ---------------------------- boot helper -------------------------- */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function boot(options = {}) {
  const doc = createDocument();
  const ethers = makeEthers(options);
  const accounts = options.accounts || [OWNER];
  /* the injected wallet is stateful: the console may ask it to move to another
     chain and every later eth_chainId must observe that move. */
  const wallet = {
    chainId: BigInt(options.chainId || DEPLOYMENT.chainId),
    switchCalls: [],
    addCalls: [],
  };
  const planError = (code, message) => {
    const err = new Error(message);
    err.code = code;
    return err;
  };
  const injected = {
    request({ method, params }) {
      if (options.noWallet) { return Promise.reject(new Error("no wallet")); }
      if (method === "eth_chainId") { return Promise.resolve("0x" + wallet.chainId.toString(16)); }
      if (method === "eth_blockNumber") {
        if (typeof options.blockNumber === "function") { return Promise.resolve(options.blockNumber()); }
        if (options.blockNumber === false) { return Promise.reject(new Error("ECONNREFUSED")); }
        return Promise.resolve("0x1");
      }
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return Promise.resolve(accounts);
      }
      if (method === "wallet_switchEthereumChain") {
        const wanted = BigInt((params && params[0] && params[0].chainId) || "0x0");
        wallet.switchCalls.push(wanted);
        if (options.rejectSwitch) { return Promise.reject(planError(4001, "user rejected")); }
        if (options.unknownChain) { return Promise.reject(planError(4902, "unknown chain")); }
        wallet.chainId = wanted;
        return Promise.resolve(null);
      }
      if (method === "wallet_addEthereumChain") {
        wallet.addCalls.push(params && params[0]);
        wallet.chainId = BigInt(params[0].chainId);
        return Promise.resolve(null);
      }
      return Promise.reject(new Error("unsupported " + method));
    },
    on() {},
  };
  const win = {
    ethereum: options.noWallet ? undefined : injected,
    ethers: options.noEthers ? undefined : ethers.mocked,
    location: { hash: options.hash || "", hostname: "127.0.0.1" },
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    addEventListener() {}, removeEventListener() {},
    fetch: (url) => {
      const key = String(url == null ? "" : url);
      let payload = null;
      if (options.deployments) {
        const hit = Object.keys(options.deployments).find((name) => key.indexOf(name) > -1);
        payload = hit ? options.deployments[hit] : null;
      } else if (!options.noDeployments) {
        payload = options.noVesting ? stripVesting() : DEPLOYMENT;
      }
      if (!payload) { return Promise.resolve({ ok: false, status: 404 }); }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  const errors = [];
  try {
    new Function("window", "document", SCRIPT)(win, doc);
  } catch (err) {
    errors.push(String((err && err.stack) || err));
  }
  return { doc, win, ethers, errors, accounts, wallet };
}

/* ----------------------------- runner ------------------------------ */
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`[${pass ? "ok  " : "FAIL"}] ${name}${!pass && detail !== undefined ? " -> " + detail : ""}`);
}
const writesTo = (scenario, roleName, method) =>
  scenario.ethers.log.filter((e) => e.kind === "write" && e.role === roleName && e.method === method);

function submit(scenario, formId, fields) {
  Object.keys(fields).forEach((id) => {
    const value = fields[id];
    if (typeof value === "boolean") { scenario.doc.node(id).checked = value; }
    else { scenario.doc.node(id).value = String(value); }
  });
  scenario.doc.node(formId).dispatch("submit");
  return sleep(40);
}

/* ---------------------------- scenario A --------------------------- */
async function ownerScenario() {
  const sc = boot({ hash: "#admin" });
  await sleep(80);
  check("A1 boot() does not throw", sc.errors.length === 0, sc.errors.join(" | "));

  check("A2 chain label from wallet chainId", sc.doc.text("admChainLabel").includes("Localhost"),
    sc.doc.text("admChainLabel"));
  check("A3 deployment address painted", sc.doc.text("admPresaleAddress").length >= 10,
    sc.doc.text("admPresaleAddress"));
  check("A4 source line names RPC + deployment", sc.doc.text("admSource").includes("127.0.0.1:8545"),
    sc.doc.text("admSource"));
  check("A5 treasury reserve", sc.doc.text("admReserve") === "250,000.00 USDT", sc.doc.text("admReserve"));
  check("A6 total reserve", sc.doc.text("admTotalReserve") === "260,000.00 USDT", sc.doc.text("admTotalReserve"));
  check("A7 usdt treasury balance", sc.doc.text("admUsdtBalance") === "50,000.00 USDT",
    sc.doc.text("admUsdtBalance"));
  check("A8 nav supply", sc.doc.text("admSupply") === "250,000 NAVIS", sc.doc.text("admSupply"));
  check("A9 nav cap", sc.doc.text("admSupplyCap") === "1,000,000,000 NAVIS", sc.doc.text("admSupplyCap"));
  check("A10 cap share", sc.doc.text("admSupplyPct") === "0.03٪", sc.doc.text("admSupplyPct"));
  check("A11 direct pool = supply - sold", /50,000 NAVIS/.test(sc.doc.text("admGenesisPool")),
    sc.doc.text("admGenesisPool"));
  check("A12 pointer 1 of 1", sc.doc.text("admCurrent") === "1 از 1", sc.doc.text("admCurrent"));
  check("A13 default lock days", sc.doc.text("admDefaultLock") === "90 روز", sc.doc.text("admDefaultLock"));
  check("A14 treasury lock days", sc.doc.text("admTreasuryLockPeriod") === "60 روز",
    sc.doc.text("admTreasuryLockPeriod"));
  check("A15 vault unset", sc.doc.text("admVault") === "تنظیم‌نشده", sc.doc.text("admVault"));
  check("A16 pool unset", sc.doc.text("admPool") === "تنظیم‌نشده", sc.doc.text("admPool"));
  check("A17 phase count live", sc.doc.text("admPhaseCountLive") === "2", sc.doc.text("admPhaseCountLive"));
  check("A18 active phase price", sc.doc.text("admPhasePrice") === "$0.042000", sc.doc.text("admPhasePrice"));
  check("A19 nav floor price", /^\$0\.039/.test(sc.doc.text("admFloor")), sc.doc.text("admFloor"));

  const rows = sc.doc.node("admPhaseRows");
  const cell = (row, at) => rows.children[row] && rows.children[row].children[at];
  check("A20 two phase rows rendered", rows.children.length === 2, String(rows.children.length));
  check("A21 row0 supply", cell(0, 1) && cell(0, 1).textContent === "300,000",
    cell(0, 1) && cell(0, 1).textContent);
  check("A22 row0 sold + multiplier", cell(0, 2) && cell(0, 2).textContent === "120,000"
    && cell(0, 4) && cell(0, 4).textContent === "1.05×", JSON.stringify([
      cell(0, 2) && cell(0, 2).textContent,
      cell(0, 4) && cell(0, 4).textContent,
    ]));
  check("A23 row0 lock + tag", cell(0, 6) && cell(0, 6).textContent === "30"
    && cell(0, 7) && cell(0, 7).children[0].textContent === "فعال", JSON.stringify([
      cell(0, 6) && cell(0, 6).textContent,
      cell(0, 7) && cell(0, 7).children[0].textContent,
    ]));
  check("A24 row1 tagged current", cell(1, 7) && cell(1, 7).children[0].textContent === "جاری",
    cell(1, 7) && cell(1, 7).children[0].textContent);
  check("A24 row1 numbers", cell(1, 1) && cell(1, 1).textContent === "200,000"
    && cell(1, 2) && cell(1, 2).textContent === "80,000"
    && cell(1, 4) && cell(1, 4).textContent === "0.95×", JSON.stringify([
      cell(1, 1) && cell(1, 1).textContent,
      cell(1, 2) && cell(1, 2).textContent,
      cell(1, 4) && cell(1, 4).textContent,
    ]));
  check("A25 row1 tagged current but idle", cell(1, 7) && cell(1, 7).children[0].textContent === "جاری"
    && cell(1, 6) && cell(1, 6).textContent === "40", JSON.stringify([
      cell(1, 6) && cell(1, 6).textContent,
      cell(1, 7) && cell(1, 7).children[0].textContent,
    ]));
  check("A25b phase hint", /2 زیرفاز/.test(sc.doc.text("admPhaseHint")), sc.doc.text("admPhaseHint"));

  check("A26 gate is ok", sc.doc.has("admGate", "is-ok"), sc.doc.node("admGate").className);
  check("A27 body unlocked", !sc.doc.has("admBody", "hidden"), sc.doc.node("admBody").className);
  check("A28 lock icon open", sc.doc.has("admLockIcon", "is-open"), sc.doc.node("admLockIcon").className);
  check("A29 connect label", sc.doc.text("admConnect") === "کیف‌پول مالک متصل است", sc.doc.text("admConnect"));
  check("A30 owner tag on presale", sc.doc.has("admOwnPresale", "is-own"), sc.doc.node("admOwnPresale").className);
  check("A31 owner tag on treasury", sc.doc.has("admOwnTreasury", "is-own"),
    sc.doc.node("admOwnTreasury").className);
  check("A32 owner tag on nav", sc.doc.has("admOwnNavToken", "is-own"),
    sc.doc.node("admOwnNavToken").className);
  check("A33 no chain mismatch notice", !/زنجیرهٔ/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  return sc;
}

/* --------------------- scenario A: phase writes --------------------- */
async function ownerPhaseWrites(sc) {
  const toast = () => sc.doc.text("toastText");

  await submit(sc, "admFormAdd", {
    admAddSupply: "500000", admAddMultiplier: "1.25", admAddLockDays: "30", admAddActive: true,
  });
  let hits = writesTo(sc, "presale", "addSubPhaseWithLock");
  check("B1 addSubPhaseWithLock args",
    hits.length === 1 && String(hits[0].args[0]) === String(500000n * E18) &&
    String(hits[0].args[1]) === String(1250000n) && hits[0].args[2] === true &&
    String(hits[0].args[3]) === "2592000", JSON.stringify(hits.map((h) => h.args.map(String))));
  check("B2 success toast", /افزودن زیرفاز با قفل ثبت شد/.test(toast()), toast());

  await submit(sc, "admFormAdd", {
    admAddSupply: "250000", admAddMultiplier: "1.10", admAddLockDays: "", admAddActive: false,
  });
  hits = writesTo(sc, "presale", "addSubPhase");
  check("B3 addSubPhase args (no lock)",
    hits.length === 1 && String(hits[0].args[0]) === String(250000n * E18) &&
    String(hits[0].args[1]) === String(1100000n) && hits[0].args[2] === false,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  const before = sc.ethers.log.filter((e) => e.kind === "write").length;
  await submit(sc, "admFormAdd", {
    admAddSupply: "1000", admAddMultiplier: "0.5", admAddLockDays: "", admAddActive: true,
  });
  check("B4 multiplier < 1 rejected", /ضریب باید/.test(toast()), toast());
  await submit(sc, "admFormAdd", {
    admAddSupply: "", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("B5 empty supply rejected", /عرضهٔ زیرفاز/.test(toast()), toast());
  await submit(sc, "admFormAdd", {
    admAddSupply: "1000", admAddMultiplier: "1.0", admAddLockDays: "abc", admAddActive: true,
  });
  check("B6 non-numeric lock rejected", /قفل باید/.test(toast()), toast());
  await submit(sc, "admFormAdd", {
    admAddSupply: "1000", admAddMultiplier: "1.0", admAddLockDays: "0", admAddActive: true,
  });
  check("B7 zero-day lock rejected", /قفل باید/.test(toast()), toast());
  check("B8 validation sends nothing",
    sc.ethers.log.filter((e) => e.kind === "write").length === before, String(before));

  await submit(sc, "admFormEdit", {
    admEditIndex: "1", admEditSupply: "1000", admEditMultiplier: "1.1", admEditActive: false,
  });
  hits = writesTo(sc, "presale", "setSubPhase");
  check("B9 setSubPhase args",
    hits.length === 1 && String(hits[0].args[0]) === "1" &&
    String(hits[0].args[1]) === String(1000n * E18) &&
    String(hits[0].args[2]) === String(1100000n) && hits[0].args[3] === false,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormEdit", {
    admEditIndex: "9", admEditSupply: "1000", admEditMultiplier: "1.1", admEditActive: true,
  });
  check("B10 out-of-range phase index rejected", /باید کمتر از 2 باشد/.test(toast()), toast());

  await submit(sc, "admFormLock", { admLockIndex: "0", admLockDays: "45" });
  hits = writesTo(sc, "presale", "setSubPhaseLockPeriod");
  check("B11 setSubPhaseLockPeriod args",
    hits.length === 1 && String(hits[0].args[0]) === "0" && String(hits[0].args[1]) === "3888000",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormCurrent", { admCurrentIndex: "2" });
  hits = writesTo(sc, "presale", "setCurrentSubPhase");
  check("B12 setCurrentSubPhase args", hits.length === 1 && String(hits[0].args[0]) === "2",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  const endCount = writesTo(sc, "presale", "setCurrentSubPhase").length;
  sc.doc.node("admEndPresale").dispatch("click");
  await sleep(40);
  hits = writesTo(sc, "presale", "setCurrentSubPhase");
  check("B13 end-presale jumps to phaseCount",
    hits.length === endCount + 1 && String(hits[hits.length - 1].args[0]) === "2",
    JSON.stringify(hits.map((h) => h.args.map(String))));
  return sc;
}




/* ------------------- scenario A: vesting + treasury ---------------- */
async function ownerValueWrites(sc) {
  const toast = () => sc.doc.text("toastText");

  await submit(sc, "admFormMint", { admMintTo: STRANGER, admMintAmount: "1000", admMintLockDays: "10" });
  let hits = writesTo(sc, "navToken", "mintDirectWithLock");
  check("C1 mintDirectWithLock args",
    hits.length === 1 && hits[0].args[0] === STRANGER &&
    String(hits[0].args[1]) === String(1000n * E18) && String(hits[0].args[2]) === "864000",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormMint", { admMintTo: STRANGER, admMintAmount: "7", admMintLockDays: "" });
  hits = writesTo(sc, "navToken", "mintDirect");
  check("C2 mintDirect args",
    hits.length === 1 && hits[0].args[0] === STRANGER && String(hits[0].args[1]) === String(7n * E18),
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormMint", { admMintTo: "0xnope", admMintAmount: "7", admMintLockDays: "" });
  check("C3 bad mint address rejected", /آدرس دریافت‌کننده معتبر نیست/.test(toast()), toast());

  await submit(sc, "admFormBurn", { admBurnFrom: STRANGER, admBurnAmount: "5" });
  hits = writesTo(sc, "navToken", "burnDirect");
  check("C4 burnDirect args",
    hits.length === 1 && hits[0].args[0] === STRANGER && String(hits[0].args[1]) === String(5n * E18),
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormBurner", { admBurnerAccount: STRANGER, admBurnerStatus: true });
  hits = writesTo(sc, "navToken", "setBurner");
  check("C5 setBurner args",
    hits.length === 1 && hits[0].args[0] === STRANGER && hits[0].args[1] === true,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  sc.doc.node("admLookupAddr").value = OWNER;
  sc.doc.node("admLookupBtn").dispatch("click");
  await sleep(40);
  check("C6 lookup balance", sc.doc.text("admLookupBalance") === "1,234.00 NAVIS",
    sc.doc.text("admLookupBalance"));
  check("C7 lookup genesis quota", sc.doc.text("admLookupQuota") === "500 NAVIS", sc.doc.text("admLookupQuota"));
  check("C8 lookup flags", sc.doc.text("admLookupFlags") === "دارندهٔ جنسیس", sc.doc.text("admLookupFlags"));
  check("C9 lookup empty lock stamp", sc.doc.text("admLookupLock") === "—", sc.doc.text("admLookupLock"));
  sc.doc.node("admLookupAddr").value = "0xbad";
  sc.doc.node("admLookupBtn").dispatch("click");
  await sleep(20);
  check("C10 bad lookup address rejected", /آدرس کیف‌پول معتبر نیست/.test(toast()), toast());

  await submit(sc, "admFormTreasuryLock", { admTreasuryDays: "30" });
  hits = writesTo(sc, "treasury", "setLockPeriod");
  check("C11 setLockPeriod args", hits.length === 1 && String(hits[0].args[0]) === "2592000",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormWhitelist", { admWhitelistAccount: STRANGER, admWhitelistStatus: false });
  hits = writesTo(sc, "treasury", "setWhitelisted");
  check("C12 setWhitelisted args",
    hits.length === 1 && hits[0].args[0] === STRANGER && hits[0].args[1] === false,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  sc.doc.node("admWhitelistBatch").value = STRANGER + ", " + OWNER + " ; 0xzz";
  sc.doc.node("admWhitelistBatchStatus").checked = true;
  sc.doc.node("admWhitelistBatchBtn").dispatch("click");
  await sleep(40);
  hits = writesTo(sc, "treasury", "setWhitelistedBatch");
  check("C13 setWhitelistedBatch args (junk filtered)",
    hits.length === 1 && Array.isArray(hits[0].args[0]) && hits[0].args[0].length === 2 &&
    hits[0].args[0][0] === STRANGER && hits[0].args[0][1] === OWNER && hits[0].args[1] === true,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  const other = "0x2222222222222222222222222222222222222222";
  await submit(sc, "admFormVault", { admVaultInput: other });
  hits = writesTo(sc, "presale", "setTreasuryVault");
  check("C14 setTreasuryVault args", hits.length === 1 && hits[0].args[0] === other,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormPool", { admPoolInput: other });
  hits = writesTo(sc, "presale", "setLiquidityPool");
  check("C15 setLiquidityPool args", hits.length === 1 && hits[0].args[0] === other,
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormPool", { admPoolInput: "" });
  check("C16 bad pool address rejected", /آدرس مقصد پرمیوم معتبر نیست/.test(toast()), toast());

  const targets = sc.ethers.contracts.map((c) => role(c.address));
  check("C17 writes only touch role contracts",
    targets.every((name) => name !== "unknown"), JSON.stringify(targets));
  return sc;
}

/* ------------------ scenario A: row click -> forms ------------------ */
async function rowPickScenario(sc) {
  const rows = sc.doc.node("admPhaseRows");
  const picker = () => rows.children[rows.children.length > 1 ? 1 : 0].children[8].children[0];
  check("D1 picker carries data-phase", picker().getAttribute("data-phase") === "1",
    String(picker().getAttribute("data-phase")));
  picker().dispatch("click");
  await sleep(20);
  check("D2 row click fills the edit form",
    sc.doc.node("admEditIndex").value === "1" &&
    sc.doc.node("admEditSupply").value === "200000" &&
    sc.doc.node("admEditMultiplier").value === "0.95" &&
    sc.doc.node("admEditActive").checked === false,
    JSON.stringify([
      sc.doc.node("admEditIndex").value, sc.doc.node("admEditSupply").value,
      sc.doc.node("admEditMultiplier").value, sc.doc.node("admEditActive").checked,
    ]));
  check("D3 row click fills lock + pointer",
    sc.doc.node("admLockIndex").value === "1" && sc.doc.node("admLockDays").value === "40" &&
    sc.doc.node("admCurrentIndex").value === "1",
    JSON.stringify([
      sc.doc.node("admLockIndex").value, sc.doc.node("admLockDays").value,
      sc.doc.node("admCurrentIndex").value,
    ]));
  check("D4 row click toast", /زیرفاز 1/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  return sc;
}


/* ------------------------- scenario E: gates ----------------------- */
async function strangerScenario() {
  const sc = boot({ hash: "#admin", accounts: [STRANGER] });
  await sleep(80);
  check("E1 gate is err", sc.doc.node("admGate").className === "adm-gate mt-4 is-err",
    sc.doc.node("admGate").className);
  check("E2 console stays locked", sc.doc.has("admBody", "hidden"), sc.doc.node("admBody").className);
  check("E3 connect offers switch",
    sc.doc.text("admConnect") === "تغییر کیف‌پول", sc.doc.text("admConnect"));
  check("E4 no owner tag lit",
    !sc.doc.has("admOwnPresale", "is-own") && !sc.doc.has("admOwnTreasury", "is-own") &&
    !sc.doc.has("admOwnNavToken", "is-own"));
  check("E5 account chip shows the wallet", /0x1111/.test(sc.doc.text("admAccountChip")),
    sc.doc.text("admAccountChip"));
  check("E6 section was revealed by the hash", !sc.doc.has("admin", "hidden"),
    sc.doc.node("admin").className);
  await submit(sc, "admFormAdd", {
    admAddSupply: "10", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("E7 write blocked for non-owner",
    writesTo(sc, "presale", "addSubPhase").length === 0 &&
    /دسترسی مالک لازم است/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  return sc;
}

async function noWalletScenario() {
  const sc = boot({ hash: "#admin", noWallet: true });
  await sleep(80);
  check("F1 boot clean without injected wallet", sc.errors.length === 0, sc.errors.join(" | "));
  check("F2 locked gate copy", /پنل قفل است/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  check("F3 locked gate carries no state class",
    sc.doc.node("admGate").className === "adm-gate mt-4", sc.doc.node("admGate").className);
  check("F4 live numbers still painted", sc.doc.text("admReserve") === "250,000.00 USDT",
    sc.doc.text("admReserve"));
  sc.doc.node("admConnect").dispatch("click");
  await sleep(20);
  check("F5 connect without wallet explains", /کیف‌پول تزریقی پیدا نشد/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  sc.doc.node("admRefresh").dispatch("click");
  await sleep(40);
  check("F6 refresh button survives a locked panel", sc.errors.length === 0, sc.errors.join(" | "));
  return sc;
}

async function rpcDownScenario() {
  const sc = boot({ hash: "#admin", rpcDown: true });
  await sleep(80);
  check("G1 boot clean when RPC is down", sc.errors.length === 0, sc.errors.join(" | "));
  check("G2 gate reports the RPC outage", /اتصال RPC برقرار نشد/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  check("G3 source line marked offline", /RPC قطع/.test(sc.doc.text("admSource")), sc.doc.text("admSource"));
  check("G4 chain label still painted", sc.doc.text("admChainLabel") === "Localhost · 31337",
    sc.doc.text("admChainLabel"));
  await submit(sc, "admFormAdd", {
    admAddSupply: "10", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("G5 write blocked with no reader",
    sc.ethers.log.filter((e) => e.kind === "write").length === 0 &&
    /دسترسی مالک لازم است/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  return sc;
}

async function missingDeploymentScenario() {
  const sc = boot({ hash: "#admin", noDeployments: true });
  await sleep(80);
  check("H1 boot clean without deployments", sc.errors.length === 0, sc.errors.join(" | "));
  check("H2 gate reports the missing config", /فایل تنظیمات پیدا نشد/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  check("H3 chain label falls back", sc.doc.text("admChainLabel") === "شبکه نامشخص",
    sc.doc.text("admChainLabel"));
  check("H4 source line explains the miss",
    /هیچ فایل deployments/.test(sc.doc.text("admSource")), sc.doc.text("admSource"));
  return sc;
}


/* --------------------- scenario I: failure paths ------------------- */
async function revertedWriteScenario() {
  const sc = boot({ hash: "#admin", rejectWrites: true });
  await sleep(80);
  check("I1 owner unlocked before the send", !sc.doc.has("admBody", "hidden"),
    sc.doc.node("admBody").className);
  await submit(sc, "admFormEdit", {
    admEditIndex: "0", admEditSupply: "1000", admEditMultiplier: "1.1", admEditActive: true,
  });
  check("I2 reverted tx reported", /ویرایش زیرفاز 0 ناموفق بود/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  check("I3 gate recovers after a revert", sc.doc.has("admGate", "is-ok"),
    sc.doc.node("admGate").className);
  await submit(sc, "admFormEdit", {
    admEditIndex: "0", admEditSupply: "1000", admEditMultiplier: "1.1", admEditActive: true,
  });
  check("I4 second send is not throttled by the failed one",
    /ناموفق بود/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  return sc;
}

async function hangingWriteScenario() {
  const sc = boot({ hash: "#admin", hangWrites: true });
  await sleep(80);
  await submit(sc, "admFormAdd", {
    admAddSupply: "1000", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("J1 in-flight tx announces itself", /در حال ارسال/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  await submit(sc, "admFormAdd", {
    admAddSupply: "2000", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("J2 second tx while sending is refused",
    /یک تراکنش دیگر در جریان است/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  check("J3 only one contract call reached the chain",
    sc.ethers.log.filter((e) => e.kind === "write").length === 1,
    String(sc.ethers.log.filter((e) => e.kind === "write").length));
  return sc;
}

async function noEthersScenario() {
  const sc = boot({ hash: "#admin", noEthers: true });
  await sleep(80);
  check("K1 boot clean without ethers", sc.errors.length === 0, sc.errors.join(" | "));
  check("K2 gate reports the dead reader", /اتصال RPC برقرار نشد/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  await submit(sc, "admFormAdd", {
    admAddSupply: "1000", admAddMultiplier: "1.0", admAddLockDays: "", admAddActive: true,
  });
  check("K3 nothing is signed without ethers",
    sc.ethers.log.filter((e) => e.kind === "write").length === 0, sc.doc.text("toastText"));
  return sc;
}

async function chainMismatchScenario() {
  const sc = boot({ hash: "#admin", chainId: 97 });
  await sleep(80);
  check("L1 panel explains the wallet/panel chain split",
    /زنجیرهٔ 97/.test(sc.doc.node("admGate").innerHTML) &&
    /31337/.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  check("L2 panel still unlocked on the matched deployment",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden"), sc.doc.node("admGate").className);
  return sc;
}

/* ---------------------------- scenario M --------------------------- */
async function pauseScenario() {
  const sc = boot({ hash: "#admin" });
  await sleep(80);

  check("M1 running token tagged فعال", sc.doc.text("admPauseStateNav") === "فعال",
    sc.doc.text("admPauseStateNav"));
  check("M2 paused treasury tagged متوقف", sc.doc.text("admPauseStateTreasury") === "متوقف",
    sc.doc.text("admPauseStateTreasury"));
  check("M3 running contract carries the green tag", sc.doc.has("admPauseStateNav", "is-on"));
  check("M4 paused contract drops the green tag", !sc.doc.has("admPauseStateTreasury", "is-on"));
  check("M5 hint reports the pauser coverage and the stop",
    /هر سه قرارداد/.test(sc.doc.text("admPauseHint")) && /متوقف است/.test(sc.doc.text("admPauseHint")),
    sc.doc.text("admPauseHint"));

  sc.doc.node("admPauseNav").dispatch("click");
  await sleep(40);
  check("M6 pause button reaches the token", writesTo(sc, "navToken", "pause").length === 1,
    String(writesTo(sc, "navToken", "pause").length));

  sc.doc.node("admResumePresale").dispatch("click");
  await sleep(40);
  check("M7 resume button reaches the presale", writesTo(sc, "presale", "unpause").length === 1);

  sc.doc.node("admPausePresale").dispatch("click");
  await sleep(40);
  check("M8 presale pause routed", writesTo(sc, "presale", "pause").length === 1);

  sc.doc.node("admResumeTreasury").dispatch("click");
  await sleep(40);
  check("M9 treasury resume routed", writesTo(sc, "treasury", "unpause").length === 1);

  check("M10 every stop call is a write, never a read",
    sc.ethers.log.filter((e) => e.method === "pause" || e.method === "unpause")
      .every((e) => e.kind === "write"));
  return sc;
}

/* ---------------------------- scenario N --------------------------- */
async function vestingScenario() {
  const sc = boot({ hash: "#admin" });
  await sleep(80);

  check("N1 vesting address painted", /^0x[0-9a-f]{4}…[0-9a-f]{4}$/i.test(sc.doc.text("admVestingAddress")),
    sc.doc.text("admVestingAddress"));
  check("N2 custody balance", sc.doc.text("admVestingBalance") === "250,000,000 NAVIS",
    sc.doc.text("admVestingBalance"));
  check("N3 released total", sc.doc.text("admVestingReleased") === "25,000,000 NAVIS",
    sc.doc.text("admVestingReleased"));
  check("N4 declared share total in percent", sc.doc.text("admVestingRoleTotal") === "25٪",
    sc.doc.text("admVestingRoleTotal"));
  check("N5 role ledger listed", sc.doc.text("admVestingRoles") === "team 15٪ · marketing 10٪",
    sc.doc.text("admVestingRoles"));
  check("N6 hint counts the schedules", /2 برنامه/.test(sc.doc.text("admVestingHint")),
    sc.doc.text("admVestingHint"));

  const rows = sc.doc.node("admScheduleRows");
  const cell = (row, at) => rows.children[row] && rows.children[row].children[at];
  check("N7 two schedule rows", rows.children.length === 2, String(rows.children.length));
  check("N8 row0 role + beneficiary",
    cell(0, 1).textContent === "team" && cell(0, 2).textContent.length >= 10,
    JSON.stringify([cell(0, 1).textContent, cell(0, 2).textContent]));
  check("N9 row0 total / released / releasable",
    cell(0, 3).textContent === "150,000,000" && cell(0, 4).textContent === "0" &&
    cell(0, 5).textContent === "15,200,000",
    JSON.stringify([cell(0, 3).textContent, cell(0, 4).textContent, cell(0, 5).textContent]));
  check("N10 row0 cliff / duration in days",
    cell(0, 7).textContent === "365" && cell(0, 8).textContent === "1095",
    JSON.stringify([cell(0, 7).textContent, cell(0, 8).textContent]));
  check("N11 row0 tagged irrevocable", cell(0, 10).children[0].textContent === "قطعی",
    cell(0, 10).children[0].textContent);
  check("N12 row1 tagged revocable", cell(1, 10).children[0].textContent === "قابل فسخ",
    cell(1, 10).children[0].textContent);
  check("N13 row1 released / releasable", cell(1, 4).textContent === "25,000,000" &&
    cell(1, 5).textContent === "25,000,000",
    JSON.stringify([cell(1, 4).textContent, cell(1, 5).textContent]));
  return sc;
}

/* ---------------------- scenario N: writes ------------------------- */
async function vestingWriteScenario() {
  const sc = boot({ hash: "#admin" });
  await sleep(80);

  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: STRANGER, admScheduleRole: "marketing", admScheduleAmount: "1000000",
    admScheduleStartDays: "", admScheduleCliffDays: "90", admScheduleDurationDays: "730",
    admScheduleRevocable: true,
  });
  let hits = writesTo(sc, "vesting", "createSchedule");
  check("N14 createSchedule args (cliff/duration in seconds, start=now)",
    hits.length === 1 && hits[0].args[0] === STRANGER && hits[0].args[1] === "marketing" &&
    String(hits[0].args[2]) === String(1000000n * E18) && String(hits[0].args[3]) === "0" &&
    String(hits[0].args[4]) === "7776000" && String(hits[0].args[5]) === "63072000" &&
    hits[0].args[6] === true, JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: STRANGER, admScheduleRole: "team", admScheduleAmount: "1000",
    admScheduleStartDays: "30", admScheduleCliffDays: "0", admScheduleDurationDays: "365",
    admScheduleRevocable: false,
  });
  hits = writesTo(sc, "vesting", "createSchedule");
  check("N15 a start offset becomes an absolute timestamp",
    hits.length === 2 && Number(String(hits[1].args[3])) > Math.floor(Date.now() / 1000),
    JSON.stringify(hits.map((h) => String(h.args[3]))));

  const before = sc.ethers.log.filter((e) => e.kind === "write").length;
  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: STRANGER, admScheduleRole: "team", admScheduleAmount: "1000",
    admScheduleStartDays: "", admScheduleCliffDays: "400", admScheduleDurationDays: "365",
    admScheduleRevocable: false,
  });
  check("N16 cliff above the duration refused", /Cliff نمی‌تواند/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: STRANGER, admScheduleRole: "team", admScheduleAmount: "",
    admScheduleCliffDays: "0", admScheduleDurationDays: "365",
  });
  check("N17 empty amount refused", /مقدار کل برنامه/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: "0xnope", admScheduleRole: "team", admScheduleAmount: "1000",
    admScheduleCliffDays: "0", admScheduleDurationDays: "365",
  });
  check("N18 a bad beneficiary is refused", /ذی‌نفع معتبر نیست/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  check("N19 no invalid schedule reached the chain",
    sc.ethers.log.filter((e) => e.kind === "write").length === before, String(before));

  await submit(sc, "admFormScheduleAction", { admScheduleId: "0" });
  hits = writesTo(sc, "vesting", "release");
  check("N20 release uses the typed id", hits.length === 1 && String(hits[0].args[0]) === "0",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  const rows = sc.doc.node("admScheduleRows");
  rows.children[1].children[11].children[0].dispatch("click");
  check("N21 row pick lands in the action form", sc.doc.node("admScheduleId").value === "1",
    sc.doc.node("admScheduleId").value);
  sc.doc.node("admRevokeSchedule").dispatch("click");
  await sleep(40);
  hits = writesTo(sc, "vesting", "revoke");
  check("N22 revoke uses the picked id", hits.length === 1 && String(hits[0].args[0]) === "1",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormRoleShare", { admRoleName: "marketing", admRoleSharePercent: "10" });
  hits = writesTo(sc, "vesting", "setRoleShare");
  check("N23 setRoleShare converts the percent to basis points",
    hits.length === 1 && hits[0].args[0] === "marketing" && String(hits[0].args[1]) === "1000",
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormVestingSweep", {
    admVestingSweepTo: STRANGER, admVestingSweepAmount: "500000",
  });
  hits = writesTo(sc, "vesting", "sweepUnallocated");
  check("N24 sweepUnallocated args",
    hits.length === 1 && hits[0].args[0] === STRANGER &&
    String(hits[0].args[1]) === String(500000n * E18),
    JSON.stringify(hits.map((h) => h.args.map(String))));

  await submit(sc, "admFormRoleShare", { admRoleName: "team", admRoleSharePercent: "120" });
  check("N25 a share above 100% is refused", /بین ۰ و ۱۰۰/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  await submit(sc, "admFormVestingSweep", { admVestingSweepTo: "0x123", admVestingSweepAmount: "1" });
  check("N26 a bad sweep receiver is refused", /مقصد برداشت معتبر نیست/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  await submit(sc, "admFormScheduleAction", { admScheduleId: "9" });
  check("N27 an out-of-range schedule id is refused", /کمتر از 2 باشد/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  check("N28 the vesting owner shows in the gate", sc.doc.has("admOwnVesting", "is-own"),
    sc.doc.node("admOwnVesting").className);
  return sc;
}

/* ---------------------------- scenario O --------------------------- */
async function noVestingScenario() {
  const sc = boot({ hash: "#admin", noVesting: true });
  await sleep(80);
  check("O1 boot clean without a vesting address", sc.errors.length === 0, sc.errors.join(" | "));
  check("O2 panel reports the missing module", sc.doc.text("admVestingAddress") === "ثبت نشده",
    sc.doc.text("admVestingAddress"));
  check("O3 schedule table shows the empty state",
    sc.doc.node("admScheduleRows").children.length === 1 &&
    /هیچ برنامهٔ وستینگی/.test(sc.doc.node("admScheduleRows").children[0].children[0].textContent),
    String(sc.doc.node("admScheduleRows").children.length));
  check("O4 readouts stay blank instead of failing",
    sc.doc.text("admVestingBalance") === "—" && sc.doc.text("admVestingRoles") === "—",
    sc.doc.text("admVestingBalance"));
  check("O5 the panel stays unlocked through the other owners",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden"),
    sc.doc.node("admGate").className);
  await submit(sc, "admFormSchedule", {
    admScheduleBeneficiary: STRANGER, admScheduleRole: "team", admScheduleAmount: "1000",
    admScheduleCliffDays: "0", admScheduleDurationDays: "365",
  });
  check("O6 creating a schedule is refused without the module",
    /ثبت نشده/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  check("O7 nothing was signed", sc.ethers.log.filter((e) => e.kind === "write").length === 0);
  return sc;
}

/* ---------------------------- scenario P --------------------------- */
/* The presale panel hands the freshly authorized account to the console: the
   owner gate must react at once, even if eth_accounts still lags with []. */
async function walletBridgeScenario() {
  const sc = boot({ hash: "#admin", accounts: [] });
  await sleep(80);
  check("P1 the presale panel can reach the owner console",
    typeof sc.win.navisWalletConnected === "function", typeof sc.win.navisWalletConnected);
  check("P2 the console starts locked without an account",
    /پنل قفل است/.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  await sc.win.navisWalletConnected(OWNER);
  await sleep(80);
  check("P3 connecting the owner wallet unlocks the console",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden"),
    sc.doc.node("admGate").innerHTML + " | " + sc.doc.node("admBody").className);
  check("P4 the chip names the connected owner",
    sc.doc.text("admAccountChip").indexOf("0xf39F") > -1, sc.doc.text("admAccountChip"));
  await sc.win.navisWalletConnected(STRANGER);
  await sleep(80);
  check("P5 another wallet is refused as non-owner",
    sc.doc.has("admGate", "is-err") && /این کیف‌پول مالک نیست/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  await sc.win.navisWalletConnected(null);
  await sleep(80);
  check("P6 a refresh without an account locks the console again",
    !sc.doc.has("admGate", "is-ok") && sc.doc.has("admBody", "hidden"),
    sc.doc.node("admGate").className + " | " + sc.doc.node("admBody").className);
  return sc;
}

/* ---------------------------- scenario Q --------------------------- */
/* The reported live symptom: the creator wallet is parked on 31337 (an older
   build switched it there and nothing is listening). The console used to adopt
   the repo's localhost descriptor for it, so every owner read failed and the
   gate blamed the creator wallet. Evidence (no node behind 31337) must win. */
async function deadLocalChainScenario() {
  const sc = boot({
    hash: "#admin", chainId: 31337, blockNumber: false, deployments: LIVE_DEPLOYMENTS,
  });
  await sleep(80);
  check("Q1 boots without an exception", sc.errors.length === 0, sc.errors.join(" | "));
  check("Q2 a dead local chain does not pin the localhost descriptor",
    sc.doc.text("admChainLabel").indexOf("Testnet") > -1, sc.doc.text("admChainLabel"));
  check("Q3 the creator wallet opens the console",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden"),
    sc.doc.node("admGate").innerHTML + " | " + sc.doc.node("admBody").className);
  check("Q4 the gate names the wallet/panel chain split",
    /زنجیرهٔ 31337/.test(sc.doc.node("admGate").innerHTML) && /97/.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  check("Q5 the source line names the live deployment the panel reads",
    /bscTestnet/.test(sc.doc.text("admSource")), sc.doc.text("admSource"));
  check("Q6 reading never moves the wallet on its own",
    sc.wallet.switchCalls.length === 0, JSON.stringify(sc.wallet.switchCalls.map(String)));
  const button = sc.doc.node("admSwitch");
  check("Q7 the switch to the live chain is offered",
    !sc.doc.has("admSwitch", "hidden") && /Testnet/.test(button.textContent), button.textContent);
  check("Q8 the switch hint is part of the gate copy",
    /سوییچ به BSC Testnet · 97/.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  button.dispatch("click");
  await sleep(60);
  check("Q9 the click asks the wallet for chain 97",
    sc.wallet.switchCalls.length === 1 && sc.wallet.switchCalls[0] === 97n,
    JSON.stringify(sc.wallet.switchCalls.map(String)));
  check("Q10 the switch is confirmed to the user", /سوییچ شد/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  check("Q11 the console stays unlocked with nothing left to fix",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden") &&
    !/زنجیرهٔ 31337/.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  check("Q12 the button hides once the chains agree",
    sc.doc.has("admSwitch", "hidden"), sc.doc.node("admSwitch").className);
  return sc;
}

/* ---------------------------- scenario Q2 -------------------------- */
/* A wallet on a network with no recorded deployment is the other way the gate
   ends up blaming the wallet: the console reads a chain it does have, unlocks,
   and offers to move the wallet onto it. */
async function wrongNetworkScenario() {
  const sc = boot({ hash: "#admin", chainId: 1, deployments: LIVE_DEPLOYMENTS });
  await sleep(80);
  check("Q2a a wallet on an unrecorded network still reads a live chain",
    sc.doc.has("admGate", "is-ok") && sc.doc.text("admChainLabel").indexOf("Testnet") > -1,
    sc.doc.node("admGate").innerHTML + " | " + sc.doc.text("admChainLabel"));
  check("Q2b the gate says no descriptor exists for the wallet chain",
    /هیچ فایل deployments برای زنجیرهٔ 1 /.test(sc.doc.node("admGate").innerHTML),
    sc.doc.node("admGate").innerHTML);
  const button = sc.doc.node("admSwitch");
  check("Q2c a switch button points at the deployment chain",
    !sc.doc.has("admSwitch", "hidden") && /Testnet/.test(button.textContent), button.textContent);
  check("Q2d the switch hint is part of the gate copy",
    /سوییچ به BSC Testnet · 97/.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  button.dispatch("click");
  await sleep(60);
  check("Q2e the click asks the wallet for chain 97",
    sc.wallet.switchCalls.length === 1 && sc.wallet.switchCalls[0] === 97n,
    JSON.stringify(sc.wallet.switchCalls.map(String)));
  check("Q2f the switch is confirmed to the user", /سوییچ شد/.test(sc.doc.text("toastText")),
    sc.doc.text("toastText"));
  check("Q2g the console stays unlocked with nothing left to fix",
    sc.doc.has("admGate", "is-ok") && !sc.doc.has("admBody", "hidden") &&
    !/زنجیرهٔ 1 /.test(sc.doc.node("admGate").innerHTML), sc.doc.node("admGate").innerHTML);
  check("Q2h the button hides once there is nothing left to switch",
    sc.doc.has("admSwitch", "hidden"), sc.doc.node("admSwitch").className);
  return sc;
}

/* ---------------------------- scenario R --------------------------- */
/* A declined switch must be reported and must not disturb the console. */
async function rejectedSwitchScenario() {
  const sc = boot({ hash: "#admin", chainId: 1, rejectSwitch: true, deployments: LIVE_DEPLOYMENTS });
  await sleep(80);
  sc.doc.node("admSwitch").dispatch("click");
  await sleep(60);
  check("R1 a declined switch is reported with its code",
    /سوییچ شبکه انجام نشد \(4001\)/.test(sc.doc.text("toastText")), sc.doc.text("toastText"));
  check("R2 a declined switch leaves the console intact",
    sc.errors.length === 0 && sc.doc.has("admGate", "is-ok"),
    sc.errors.join(" | ") + " | " + sc.doc.node("admGate").className);
  check("R3 the button stays on offer for a retry",
    !sc.doc.has("admSwitch", "hidden"), sc.doc.node("admSwitch").className);
  check("R4 the wallet was not moved anyway", sc.wallet.chainId === 1n, String(sc.wallet.chainId));
  return sc;
}

/* ---------------------------- scenario S --------------------------- */
/* Wallets that do not know BSC testnet yet answer 4902: add it, then retry. */
async function unknownChainScenario() {
  const sc = boot({ hash: "#admin", chainId: 1, unknownChain: true, deployments: LIVE_DEPLOYMENTS });
  await sleep(80);
  sc.doc.node("admSwitch").dispatch("click");
  await sleep(60);
  check("S1 an unknown network is added before retrying",
    sc.wallet.addCalls.length === 1 && sc.wallet.addCalls[0].chainId === "0x61",
    JSON.stringify(sc.wallet.addCalls));
  check("S2 the added network carries the BNB testnet parameters",
    sc.wallet.addCalls[0].nativeCurrency.symbol === "tBNB" &&
    sc.wallet.addCalls[0].rpcUrls[0] === "https://data-seed-prebsc-1-s1.binance.org:8545",
    JSON.stringify(sc.wallet.addCalls[0]));
  check("S3 the console confirms and re-reads on the new chain",
    /سوییچ شد/.test(sc.doc.text("toastText")) && sc.doc.has("admGate", "is-ok"),
    sc.doc.text("toastText") + " | " + sc.doc.node("admGate").className);
  check("S4 the wallet really moved", sc.wallet.chainId === 97n, String(sc.wallet.chainId));
  return sc;
}

/* ------------------------------ main ------------------------------- */
(async function main() {
  const owner = await ownerScenario();
  await ownerPhaseWrites(owner);
  await ownerValueWrites(owner);
  await rowPickScenario(owner);
  await pauseScenario();
  await vestingScenario();
  await vestingWriteScenario();
  await noVestingScenario();
  await strangerScenario();
  await noWalletScenario();
  await rpcDownScenario();
  await missingDeploymentScenario();
  await revertedWriteScenario();
  await hangingWriteScenario();
  await noEthersScenario();
  await chainMismatchScenario();
  await walletBridgeScenario();
  await deadLocalChainScenario();
  await wrongNetworkScenario();
  await rejectedSwitchScenario();
  await unknownChainScenario();

  const failed = results.filter((row) => !row.pass);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
  if (failed.length) { console.log("FAILED: " + failed.map((row) => row.name).join(", ")); }
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.log("harness crashed: " + ((err && err.stack) || err));
  process.exit(2);
});
