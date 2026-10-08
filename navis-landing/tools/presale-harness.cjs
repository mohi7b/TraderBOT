#!/usr/bin/env node
/*
 * Wallet/buy paths across several networks for the landing page.
 *
 * Boots the *presale* <script> block of index.html (the one owning
 * #connectWallet/#buyPresale) inside a stub DOM with a mocked `window.ethers`,
 * `window.ethereum` and `window.fetch`, then asserts:
 *   A/B  connect + buy on BSC testnet, and the wallet-only fallback when the
 *        public RPC is down
 *   C    a wallet on the wrong network is asked for the deployment chain
 *   C2   a live hardhat node wins on a locally served page
 *   E    a wallet parked on 31337 with *no node behind it* follows the recorded
 *        live deployment instead (and says why)
 *   D    no injected wallet at all: the demo reservation
 *
 *   node tools/presale-harness.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PAGE = path.resolve(__dirname, "..", "index.html");
const DIR = path.resolve(__dirname, "..");
const html = fs.readFileSync(PAGE, "utf8");

function presaleScript() {
  const marker = "var CHAIN_META = {";
  const at = html.indexOf(marker);
  if (at < 0) throw new Error("presale script marker not found");
  const open = html.lastIndexOf("<script>", at);
  const close = html.indexOf("</script>", at);
  return html.slice(open + "<script>".length, close);
}
const SCRIPT = presaleScript();

const TESTNET = JSON.parse(fs.readFileSync(DIR + "/deployments/bscTestnet.json", "utf8"));
const LOCALHOST = JSON.parse(fs.readFileSync(DIR + "/deployments/localhost.json", "utf8"));
const OWNER = "0x23f7b4FAF4Fa8a3A44B21569B7Ef3BA6f7f1Bdff";
const DEMO = "0x7A3F…9C21";
const ZERO = "0x0000000000000000000000000000000000000000";

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
    this.style = {};
    this.dataset = {};
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
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  click() {
    const event = { type: "click", target: this, prevented: false, preventDefault() { this.prevented = true; } };
    (this.listeners.click || []).slice().forEach((fn) => fn.call(this, event));
    return event;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "class") { this.className = value; }
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  removeAttribute(name) { delete this.attrs[name]; }
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
  focus() {}
}

function createDocument(ids) {
  const registry = new Map();
  const documentElement = new El("html", "html");
  documentElement.scrollHeight = 4000;
  documentElement.clientHeight = 900;
  documentElement.scrollTop = 0;
  const doc = {
    getElementById(id) {
      if (!registry.has(id)) { registry.set(id, new El("div", id)); }
      return registry.get(id);
    },
    createElement: (tag) => new El(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    querySelector(sel) {
      const id = String(sel || "").replace(/^#/, "");
      return registry.has(id) ? registry.get(id) : null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    documentElement,
    body: new El("body", "body"),
    head: new El("head", "head"),
    hidden: false,
  };
  (ids || []).forEach((id) => doc.getElementById(id));
  doc.node = (id) => doc.getElementById(id);
  doc.text = (id) => doc.getElementById(id).textContent;
  return doc;
}

/* --------------------------- the stub pieces ----------------------- */
const PRESALE_HOOKS = [
  "toast", "toastText", "year", "scrollProgress", "menuToggle", "mobileMenu",
  "langWrap", "langToggle", "langMenu", "langCurrentLabel", "countdown",
  "livePrice", "netInflow", "tTreasury", "tFloor", "tRatio", "tHolders",
  "tRedeemed", "tBlock", "tClock", "connectWallet", "walletStatus", "usdtAmount",
  "tokenEstimate", "presalePrice", "walletBalance", "networkStatus", "buyPresale",
  "phaseNumber",
];

function unitsToBig(value, decimals) {
  return BigInt(Math.round(Number(value) * Math.pow(10, decimals)));
}

function makeEthers(options) {
  const log = [];
  const providers = [];
  const networks = [];
  const chainOf = options.chainOf || ((url) => (/(127\.0\.0\.1|localhost|195\.248\.240\.102)/.test(String(url)) ? 31337 : 97));
  const makeContract = (address, abi, runner) => {
    const target = { address, abi, runner };
    return new Proxy(target, {
      get(t, prop) {
        if (prop in t) { return t[prop]; }
        if (prop === "connect") { return (next) => makeContract(address, abi, next); }
        if (typeof prop !== "string") { return undefined; }
        return (...args) => {
          const entry = (abi || []).find((line) => line.indexOf(" " + prop + "(") > -1);
          const isRead = !!(entry && entry.indexOf("view") > -1);
          log.push({ address, method: prop, args, kind: isRead ? "read" : "write", runner });
          if (!isRead) {
            return Promise.resolve({
              hash: "0x" + "ab".repeat(32),
              wait: () => Promise.resolve({ status: 1 }),
            });
          }
          if (options.rpcDown && runner && runner.rpc === true) { return Promise.reject(new Error("rpc down")); }
          const table = {
            symbol: () => "USDT",
            decimals: () => (address === TESTNET.addresses.usdtToken ? 6n : 18n),
            balanceOf: () => unitsToBig(50000, 6),
            allowance: () => 0n,
            totalSupply: () => unitsToBig(250000000, 18),
            reserveBalance: () => unitsToBig(250000, 6),
            navFloor: () => 39000n,
            currentNavFloor: () => 39000n,
            subPhaseCount: () => 3n,
            currentSubPhase: () => 0n,
            phasePrice: () => 41000n,
            treasuryVault: () => ZERO,
            liquidityPool: () => ZERO,
          };
          const fn = table[prop];
          return Promise.resolve(fn ? fn.apply(null, args || []) : 0n);
        };
      },
      set(t, prop, value) { t[prop] = value; return true; },
    });
  };
  return {
    log,
    providers,
    networks,
    mocked: {
      Contract: class { constructor(address, abi, runner) { return makeContract(address, abi, runner); } },
      JsonRpcProvider: class {
        constructor(url, chain) { this.url = url; this.rpc = true; providers.push({ url: String(url), chain: Number(chain) }); }
        getNetwork() {
          if (options.rpcDown) { return Promise.reject(new Error("ECONNREFUSED")); }
          networks.push({ url: String(this.url), resolved: Number(chainOf(this.url)) });
          return Promise.resolve({ chainId: BigInt(chainOf(this.url)) });
        }
      },
      BrowserProvider: class {
        constructor(injected) { this.injected = injected; this.signs = true; }
        getSigner() { return Promise.resolve({ address: options.account || OWNER, signs: true }); }
      },
      parseUnits: (value, decimals) => unitsToBig(value, decimals),
      formatUnits: (value, decimals) => String(Number(value) / Math.pow(10, Number(decimals))),
    },
  };
}

/* ---------------------------- boot helper -------------------------- */
const toasts = [];
function watchText(el, sink) {
  let value = el.textContent;
  Object.defineProperty(el, "textContent", {
    get() { return value; },
    set(next) {
      value = String(next);
      if (value) { sink.push(value); }
    },
    configurable: true,
  });
}
function boot(options = {}) {
  const doc = createDocument(PRESALE_HOOKS);
  const ethers = makeEthers(Object.assign({ account: options.account }, options));
  const accounts = options.accounts || [OWNER];
  const requests = [];
  const walletChain = Number(options.walletChain === undefined
    ? (options.noWallet ? 0 : TESTNET.chainId) : options.walletChain);
  const injected = {
    on() {},
    request({ method, params }) {
      requests.push({ method, params });
      if (method === "eth_chainId") {
        if (options.noWallet) { return Promise.reject(new Error("no wallet")); }
        return Promise.resolve("0x" + walletChain.toString(16));
      }
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return options.noWallet ? Promise.reject(new Error("no wallet")) : Promise.resolve(accounts);
      }
      /* the page pings the wallet's own node before trusting a parked chain */
      if (method === "eth_blockNumber") {
        if (options.blockNumber === false) { return Promise.reject(new Error("ECONNREFUSED")); }
        return Promise.resolve(options.blockNumber || "0x1");
      }
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error("unsupported " + method));
    },
  };
  const announced = [];
  const win = {
    ethereum: options.noWallet ? undefined : injected,
    ethers: ethers.mocked,
    location: { hash: "", hostname: "127.0.0.1", protocol: "http:", search: "", href: "http://127.0.0.1/" },
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    Event: class { constructor(type) { this.type = type; } },
    navisWalletConnected: (account) => { announced.push(account); },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: "fa-IR", userAgent: "harness" },
    document: doc,
    fetch: (path, init) => {
      /* the page probes the hardhat node before falling back to a descriptor */
      if (String(path).indexOf("127.0.0.1:8545") === 0 || (init && init.method === "POST")) {
        if (!options.localNode) { return Promise.reject(new Error("ECONNREFUSED")); }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: "0x7a69" }) });
      }
      const wanted = options.descriptors ||
        { "deployments/bscTestnet.json": TESTNET, "deployments/localhost.json": LOCALHOST };
      const key = String(path).replace(/^\.\.\//, "").replace(/^navis?-contracts\//, "");
      const hit = Object.keys(wanted).filter((name) => key === name || key.endsWith(name))[0];
      if (!hit) { return Promise.resolve(null); }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(wanted[hit]))) });
    },
    innerWidth: 1440,
    innerHeight: 900,
    console,
  };
  const errors = [];
  try {
    new Function("window", "document", "console", SCRIPT)(win, doc, console);
  } catch (err) {
    errors.push(String((err && err.stack) || err));
  }
  watchText(doc.node("toastText"), toasts);
  return { doc, win, ethers, errors, requests, announced };
}
const writes = (scenario) => scenario.ethers.log.filter((entry) => entry.kind === "write");
const chainRequests = (scenario) => scenario.requests.filter((entry) => entry.method.indexOf("wallet_") === 0);
const readAddresses = (scenario) => scenario.ethers.log
  .filter((entry) => entry.kind === "read" && entry.runner && entry.runner.rpc === true)
  .map((entry) => entry.address);
const buy = (scenario, amount) => {
  scenario.doc.node("usdtAmount").value = String(amount);
  scenario.doc.node("buyPresale").click();
};

/* ----------------------------- runner ------------------------------ */
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`[${pass ? "ok  " : "FAIL"}] ${name}${!pass && detail !== undefined ? " -> " + detail : ""}`);
}
async function settle(times = 15) {
  for (let i = 0; i < times; i += 1) { await new Promise((resolve) => setImmediate(resolve)); }
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < times; i += 1) { await new Promise((resolve) => setImmediate(resolve)); }
}

(async function main() {
  /* ---------------- A: connect + buy on BSC testnet ---------------- */
  {
    const mark = toasts.length;
    const scenario = boot({});
    check("A1 boots without an exception", scenario.errors.length === 0, scenario.errors[0]);
    scenario.doc.node("connectWallet").click();
    await settle();
    check("A2 the wallet connected without switching chains", chainRequests(scenario).length === 0,
      JSON.stringify(chainRequests(scenario)));
    check("A3 the owner console was told about the wallet",
      scenario.announced.length === 1 && scenario.announced[0] === OWNER, JSON.stringify(scenario.announced));
    const status = scenario.doc.node("walletStatus").textContent;
    check("A4 the status reports the live wallet balance",
      /کیف‌پول متصل/.test(status) && /USDT/.test(status), status);
    const network = scenario.doc.node("networkStatus").textContent;
    check("A5 the network line names the testnet", /Testnet/.test(network), network);
    buy(scenario, 100);
    await settle();
    const sent = writes(scenario);
    check("A6 the purchase reached the testnet presale",
      sent.some((e) => e.method === "buyTokens" && e.address === TESTNET.addresses.presale),
      JSON.stringify(sent.map((e) => e.method + "@" + e.address)));
    check("A7 USDT was approved for the testnet presale",
      sent.some((e) => e.method === "approve" && e.address === TESTNET.addresses.usdtToken &&
        String(e.args[0]).toLowerCase() === TESTNET.addresses.presale.toLowerCase()),
      JSON.stringify(sent.map((e) => e.method)));
    check("A8 the testnet deployment was read over its public RPC",
      readAddresses(scenario).length > 0 && readAddresses(scenario).every((address) =>
        address !== LOCALHOST.addresses.presale && address !== LOCALHOST.addresses.treasury &&
        address !== LOCALHOST.addresses.navToken),
      JSON.stringify(readAddresses(scenario).slice(0, 4)));
    check("A9 the buy never asked for a wallet connection",
      !toasts.slice(mark).some((t) => t.indexOf("ابتدا کیف‌پول را متصل کنید") > -1),
      JSON.stringify(toasts.slice(mark)));
    check("A10 the buy was confirmed to the user",
      toasts.slice(mark).some((t) => t.indexOf("خرید ثبت شد") > -1), JSON.stringify(toasts.slice(mark)));
  }

  /* ------------- B: wallet connected, every public RPC down -------- */
  {
    const mark = toasts.length;
    const scenario = boot({ rpcDown: true });
    scenario.doc.node("connectWallet").click();
    await settle();
    check("B1 the wallet stays connected with a dead RPC",
      scenario.doc.node("walletStatus").textContent.indexOf("متصل") > -1,
      scenario.doc.node("walletStatus").textContent);
    check("B2 the network line explains the wallet fallback",
      scenario.doc.node("networkStatus").textContent.indexOf("کیف‌پول") > -1,
      scenario.doc.node("networkStatus").textContent);
    buy(scenario, 100);
    await settle();
    const sent = writes(scenario);
    check("B3 the purchase still signs through the wallet",
      sent.some((e) => e.method === "buyTokens" && e.address === TESTNET.addresses.presale),
      JSON.stringify(sent.map((e) => e.method)));
    check("B4 the dead RPC never turned into a wallet error",
      !toasts.slice(mark).some((t) => t.indexOf("ابتدا کیف‌پول را متصل کنید") > -1),
      JSON.stringify(toasts.slice(mark)));
    check("B5 the wallet-only path confirmed the purchase",
      toasts.slice(mark).some((t) => t.indexOf("خرید ثبت شد") > -1), JSON.stringify(toasts.slice(mark)));
  }

  /* ---------------- C: wallet on the wrong network ----------------- */
  {
    const scenario = boot({ walletChain: 1 });
    scenario.doc.node("connectWallet").click();
    await settle();
    const switches = chainRequests(scenario).filter((e) => e.method === "wallet_switchEthereumChain");
    check("C1 the panel asks for the deployment chain", switches.length === 1,
      JSON.stringify(chainRequests(scenario)));
    check("C2 with no local node the live testnet wins",
      switches.length === 1 && switches[0].params[0].chainId === "0x61", JSON.stringify(switches));
    check("C3 the network add carries the BNB testnet symbol",
      chainRequests(scenario).every((e) => e.method !== "wallet_addEthereumChain" ||
        e.params[0].nativeCurrency.symbol === "tBNB"), JSON.stringify(chainRequests(scenario)));
  }

  /* -------- C2: local page, unknown wallet chain, hardhat alive ------ */
  {
    const scenario = boot({ walletChain: 1, localNode: true });
    scenario.doc.node("connectWallet").click();
    await settle();
    const switches = chainRequests(scenario).filter((e) => e.method === "wallet_switchEthereumChain");
    check("C4 a live hardhat node wins on a local page",
      switches.length === 1 && switches[0].params[0].chainId === "0x7a69", JSON.stringify(switches));
    check("C5 the hardhat deployment is the active one",
      readAddresses(scenario).some((address) => address === LOCALHOST.addresses.presale),
      JSON.stringify(readAddresses(scenario).slice(0, 4)) + " | providers=" +
        JSON.stringify(scenario.ethers.providers) + " | networks=" +
        JSON.stringify(scenario.ethers.networks) +
        " | net=" + scenario.doc.node("networkStatus").textContent);
  }

  /* ------ E: the wallet is parked on a hardhat chain nobody serves ------ */
  {
    const mark = toasts.length;
    const scenario = boot({ walletChain: 31337, localNode: false, blockNumber: false });
    scenario.doc.node("connectWallet").click();
    await settle();
    const switches = chainRequests(scenario).filter((e) => e.method === "wallet_switchEthereumChain");
    check("E1 a dead 31337 wallet does not pin the local descriptor",
      switches.length === 1 && switches[0].params[0].chainId === "0x61",
      JSON.stringify(chainRequests(scenario)));
    check("E2 the live testnet addresses are the ones read",
      readAddresses(scenario).some((address) => address === TESTNET.addresses.presale),
      JSON.stringify(readAddresses(scenario).slice(0, 4)));
    check("E3 the user is told why the network moved",
      toasts.slice(mark).some((t) => t.indexOf("۳۱۳۳۷") > -1 && t.indexOf("پاسخ نمی‌داد") > -1),
      JSON.stringify(toasts.slice(mark)));
  }

  /* ------ E2: the same wallet with a live node keeps localhost ------ */
  {
    const scenario = boot({ walletChain: 31337, localNode: true, blockNumber: "0x1" });
    scenario.doc.node("connectWallet").click();
    await settle();
    const switches = chainRequests(scenario).filter((e) => e.method === "wallet_switchEthereumChain");
    check("E4 a live 31337 wallet keeps the localhost deployment",
      switches.length === 0, JSON.stringify(chainRequests(scenario)));
    check("E5 the hardhat addresses are the ones read",
      readAddresses(scenario).some((address) => address === LOCALHOST.addresses.presale),
      JSON.stringify(readAddresses(scenario).slice(0, 4)));
  }

  /* -------------------- D: no injected wallet ---------------------- */
  {
    const mark = toasts.length;
    const scenario = boot({ noWallet: true });
    scenario.doc.node("connectWallet").click();
    await settle();
    check("D1 the demo wallet is shown when nothing is injected",
      scenario.doc.node("connectWallet").textContent === DEMO,
      scenario.doc.node("connectWallet").textContent);
    buy(scenario, 100);
    await settle();
    check("D2 the demo buy stays inspectable",
      toasts.slice(mark).some((t) => t.indexOf("حالت نمایشی") > -1), JSON.stringify(toasts.slice(mark)));
  }

  const failed = results.filter((entry) => !entry.pass);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
  console.log("RESULT:", failed.length ? "FAIL" : "PASS");
  process.exit(failed.length ? 1 : 0);
})();
