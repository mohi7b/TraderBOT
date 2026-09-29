#!/usr/bin/env node
/**
 * ============================================================
 * TraderBOT / Macro Collector — Orchestrator (daemon, no API)
 * File: collector/macro/orchestrator.cjs
 * ============================================================
 * Started ONCE by systemd and kept always-on.
 *
 *  start (one-time): check offline database (db/macro.db)
 *    - missing  -> short guide message + exit(1)
 *    - present  -> enter the driver loops:
 *                     calendar sync   -> every 1 day
 *                     update_live     -> every 5 minutes
 *  No API implementation in this file (API is a separate service).
 * ============================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MACRO_ROOT = __dirname;
const DB_PATH = path.join(MACRO_ROOT, "db", "macro.db");
const ORCH_LOG_DIR = path.join(MACRO_ROOT, "logs", "orchestrator");
const ORCH_LOG = path.join(ORCH_LOG_DIR, "orchestrator.log");

// Intervals
const CALENDAR_MS = 24 * 60 * 60 * 1000; // every 1 day
const UPDATE_MS = 5 * 60 * 1000;         // every 5 minutes

// ---------------- lightweight colored output ----------------
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;
const now = () => new Date().toISOString();
const ts = () => now().slice(11, 19);

// ---------------- single-line log: console + file ----------------
function cm(lineColor, tag, msg) {
  process.stdout.write(`[${D(ts())}] ${lineColor(`[${tag}]`)} ${msg}\n`);
  try {
    fs.mkdirSync(path.dirname(ORCH_LOG), { recursive: true });
    fs.appendFileSync(ORCH_LOG, `[${now()}] [${tag}] ${msg}\n`);
  } catch {}
}

// ---------------- run a macro script (quiet, only exit code) ----------------
function runNode(relScript, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [relScript, ...args], {
      cwd: MACRO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve(code ? code : 0));
  });
}

// ---------------- 1) calendar sync ----------------
let calendarBusy = false;
async function tickCalendar() {
  if (calendarBusy) return;
  calendarBusy = true;
  const t0 = Date.now();
  cm(Y, "CAL", "calendar sync start…");
  let msg;
  try {
    const { syncAll } = require("./calendar/sync.cjs");
    const res = await syncAll();
    msg = `calendar synced. updated=${res && typeof res.updated === "number" ? res.updated : "n/a"}`;
  } catch (e) {
    msg = `calendar unchanged (source error/offline): ${String(e && e.message).slice(0, 60)}`;
  }
  cm(G, "CAL", `${msg} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  calendarBusy = false;
}

// ---------------- 2) update_live ----------------
let updateBusy = false;
async function tickUpdate() {
  if (updateBusy) return;
  updateBusy = true;
  const t0 = Date.now();
  cm(Y, "UPD", "update_live start…");
  const code = await runNode("./update/update_live.cjs");
  cm(code === 0 ? G : R, "UPD", code === 0 ? "done." : `error / exit=${code} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  updateBusy = false;
}

// ---------------- entry ----------------
(async function main() {
  process.title = "macro-orchestrator";
  fs.mkdirSync(ORCH_LOG_DIR, { recursive: true });
  cm(C, "ORCH", "Macro Orchestrator (daemon, no API) — battery-powered driver");

  // (a) one-time: database presence check
  process.stdout.write(`[${D(ts())}] ${C("[ORCH]")} checking offline database…\n`);
  if (!fs.existsSync(DB_PATH)) {
    process.stdout.write(`\n${R("[DB]")} offline historical database not found.\n`);
    process.stdout.write("  to build it run:\n");
    process.stdout.write(`    ${C("node db_build/main_offline_loader.cjs")}\n`);
    process.stdout.write("  after building, start the service again (systemd restart).\n");
    process.exit(1); // daemon will not start until DB exists
  }
  process.stdout.write(`[${D(ts())}] ${G("[DB]")} database present → loops started.\n`);

  cm(G, "LOOP", `driving: calendar every 1 day • update_live every 5 min`);

  // immediate first run, then intervals
  tickUpdate();
  const calTimer = setInterval(tickCalendar, CALENDAR_MS);
  const updTimer = setInterval(tickUpdate, UPDATE_MS);

  // graceful shutdown on SIGTERM/SIGINT (systemd stop/restart)
  const stop = () => {
    cm(R, "ORCH", "shutdown signal received — exiting.");
    clearInterval(calTimer);
    clearInterval(updTimer);
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
})().catch((e) => {
  process.stdout.write(R("[ORCH] fatal: ") + ((e && e.stack) || e) + "\n");
  process.exit(1);
});