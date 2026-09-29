/**
 * ============================================================
 * Macro Live Update System — main orchestrator
 * File: collector/macro/update/update_live.cjs
 *
 * Pipeline (one source at a time):
 *   1. read update_schedule.json
 *   2. Light Update Checker   (only if the source is due)
 *   3. if new data -> Smart Downloader
 *   4. Extractor (ZIP only, only required files)
 *   5. Normalizer
 *   6. Comparator + Writer (INSERT / UPDATE+INSERT / IGNORE)
 *   7. log to logs/update_log_YYYYMMDD.txt
 *
 * Usage:
 *   node collector/macro/update/update_live.cjs
 *   node collector/macro/update/update_live.cjs --force
 *   node collector/macro/update/update_live.cjs --source=FRED
 *   node collector/macro/update/update_live.cjs --source=BIS --allow-new-series
 *   node collector/macro/update/update_live.cjs --only-light
 *   node collector/macro/update/update_live.cjs --dry-run
 * ============================================================
 */
const fs = require("fs");
const path = require("path");

const { DIRS, SOURCE_TO_DATASET, ensureAllDirs, DB_PATH } = require("./lib/paths.cjs");
const logger = require("./lib/update_logger.cjs");
const { runLightCheck } = require("./lib/light_checker.cjs");
const { runSmartDownload, runExtract } = require("./lib/smart_downloader.cjs");
const { runNormalize } = require("./lib/normalizer.cjs");
const { runComparatorWriter } = require("./lib/comparator_writer.cjs");

// Single timing reference: the unified calendar table (release_events). The
// engine no longer schedules purely on cadence/status — it reads the nearest
// *due* scheduled event for each source from calendar/data/releases.db.
const calStore = require("../calendar/store.cjs");
const Mk = require("../calendar/maketime.cjs");
const sched = require("../calendar/scheduler.cjs");
const { windowState, windowFor, nextPollDelayMs } = require("../calendar/window.cjs");

const SCHEDULE_PATH = path.join(DIRS.schedule, "update_schedule.json");
const STATUS_PATH = path.join(DIRS.status, "light_status.json");

// ------------------------------------------------------------
// CLI args
// ------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    source: null,
    force: false,
    allowNewSeries: false,
    dryRun: false,
    onlyLight: false,
    help: false,
  };
  for (const a of argv) {
    if (a === "--force") args.force = true;
    else if (a === "--allow-new-series") args.allowNewSeries = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--only-light") args.onlyLight = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--source=")) args.source = a.split("=")[1].toUpperCase();
  }
  return args;
}

// ------------------------------------------------------------
// Status file helpers
// ------------------------------------------------------------
function loadStatus() {
  if (!fs.existsSync(STATUS_PATH)) {
    return { created_at: new Date().toISOString(), last_run: null, sources: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
  } catch {
    return { created_at: new Date().toISOString(), last_run: null, sources: {} };
  }
}

function saveStatus(status) {
  fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
}

// Timing helpers (cadenceLabelFor, dueSourcesFromCalendar, markReleasedThrough)
// live in ../calendar/scheduler.cjs — a pure, pipeline-independent module so the
// scheduler can be tested in isolation. update_live only consumes them via sched.*.

// ------------------------------------------------------------
// Per-source pipeline
// ------------------------------------------------------------
async function runSourcePipeline(source, cadence, status, args) {
  logger.section(`=== ${source} (schedule: ${cadence}) ===`);

  // ---- 1) Light Update Checker -------------------------------------
  // Timing decided upstream by the unified calendar engine;
  // no cadence/status gate inside the pipeline anymore.


  const light = await runLightCheck(source, status);
  const srcState = status.sources[source] || {};
  status.sources[source] = {
    ...srcState,
    schedule: cadence,
    last_checked_at: light.last_checked_at,
    signal: light.signal,
    status: light.status,
    detail: light.detail,
  };
  saveStatus(status);

  logger.info(`[${source}] light check -> ${light.status}${light.prev_signal ? ` (signal changed: ${light.new_data})` : ""}`);
  if (args.onlyLight) return { source, status: light.status, new_data: light.new_data };

  if (!light.ok) {
    logger.error(`[${source}] light probe failed — update aborted for this source`);
    // Structured, API-readable error (prampt1 §3): a failed/empty light probe
    // must be surfaced in macro_errors rather than silently dropped.
    try {
      calStore.appendError({
        error_code: "SYNC_FAILED",
        source,
        event_id: null,
        details: `light probe failed: ${JSON.stringify(light.detail || {})}`,
      });
    } catch {}
    return { source, status: "probe_error" };
  }
  const newData = args.force ? true : light.new_data; // --force bypasses the signal too
  if (!newData) {
    logger.info(`[${source}] no new data published — nothing to do`);
    return { source, status: "no_new_data" };
  }

  // ---- 2) Smart Downloader -------------------------------------------
  logger.info(`[${source}] new data confirmed → downloading...`);
  const dl = await runSmartDownload(source, { force: args.force, retries: 3 });
  if (!dl.ok && dl.results.filter((r) => r.status === "downloaded").length === 0) {
    logger.error(`[${source}] all downloads failed — update aborted`);
    try {
      calStore.appendError({
        error_code: "SYNC_FAILED",
        source,
        event_id: null,
        details: `download failed: ${JSON.stringify(dl.results || {})}`,
      });
    } catch {}
    return { source, status: "download_failed", results: dl.results };
  }

  // ---- 3) Extractor (ZIP sources only) --------------------------------
  await runExtract(source);

  // ---- 4) Normalizer ----------------------------------------------------
  const nm = await runNormalize(source);
  if (!nm.ok) return { source, status: "normalize_failed", error: nm.error };

  // ---- 5) Comparator + Writer ------------------------------------------
  const wr = await runComparatorWriter(source, {
    onlyExisting: !args.allowNewSeries,
    dryRun: args.dryRun,
  });
  if (!wr.ok) return { source, status: "write_failed", error: wr.error };

  return { source, status: "updated", light: light.status, series: nm.series, obs: nm.obs, writer: wr };
}

// ------------------------------------------------------------
// Release-window engine integration
// ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Did a pipeline result actually receive (download+write) fresh data? */
function dataReceivedOf(res) {
  return !!(res && (res.dataReceived === true || res.status === "updated"));
}

/**
 * Pure decision used after a NON-windowed (--source / --force) run: should we
 * record a MISSED_EVENT for a target? Yes only when:
 *   1. no fresh data was received during the run, AND
 *   2. the target references a real scheduled release (finite dueTs), AND
 *   3. that release's window has already closed (state === "after").
 * (prampt1.txt §2.4 guarantees a due event is never silently lost — even on a
 *  manual/forced run — by surfacing the closed window as MISSED_EVENT.)
 * Pure & testable; mirrors exactly what the windowed path does in runTargetWithWindow.
 */
function shouldMarkMissed(source, target, res, nowMs = Date.now()) {
  if (!target) return false;
  if (dataReceivedOf(res)) return false;
  if (!Number.isFinite(target.dueTs)) return false;
  return windowState(target.dueTs, source, nowMs) === "after";
}

function markReleased(source, target) {
  if (target && target.dueIso) {
    try { sched.markReleasedThrough(source, target.dueIso); } catch {}
  }
}

function recordMissed(source, target) {
  try {
    calStore.appendError({
      error_code: "MISSED_EVENT",
      source,
      event_id: target && target.dueIso ? target.dueIso : null,
      details: `release window closed without data (scheduled ${target && target.dueIso ? target.dueIso : "?"})`,
    });
  } catch {}
  if (target && target.dueIso) {
    try { sched.markMissedThrough(source, target.dueIso); } catch {}
  }
}

/** One pipeline attempt, turning timeout-like failures into POLLING_TIMEOUT errors. */
async function safeAttempt(source, target, status, args) {
  try {
    return await runSourcePipeline(source, target.cadence || sched.cadenceLabelFor(source), status, args);
  } catch (e) {
    if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(String((e && e.message) || ""))) {
      try {
        calStore.appendError({
          error_code: "POLLING_TIMEOUT",
          source,
          event_id: target.dueIso || null,
          details: e.message,
        });
      } catch {}
    }
    return { source, status: "error", error: e.message, dataReceived: false };
  }
}

/** Polling sources: attempt, then retry every poll_interval until the window closes. */
async function pollSourceWithinWindow(source, target, scheduled, status, args) {
  let res = await safeAttempt(source, target, status, args);
  if (dataReceivedOf(res)) return res;

  while (true) {
    const delay = nextPollDelayMs(scheduled, source, Date.now());
    if (delay == null) break;
    await sleep(delay);
    res = await safeAttempt(source, target, status, args);
    if (dataReceivedOf(res)) return res;
  }

  recordMissed(source, target);
  return { source, status: "missed" };
}

/**
 * Run a due target through the release-window model (prampt1.txt §2):
 *   before  -> wait (skip)
 *   inside  -> non-polling: run once; polling: retry until window_end
 *   after   -> data received: released; otherwise: MISSED_EVENT + mark missed
 */
async function runTargetWithWindow(target, status, args, nowMs) {
  const source = target.source;
  const scheduled = Number.isFinite(target.dueTs) ? target.dueTs : nowMs;
  const state = windowState(scheduled, source, nowMs);

  if (state === "before") {
    logger.info(`[${source}] release window not open yet — skip`);
    return { source, status: "before_window" };
  }

  let res;
  if (state === "inside") {
    if (windowFor(source).polling) {
      res = await pollSourceWithinWindow(source, target, scheduled, status, args);
    } else {
      res = await runSourcePipeline(source, target.cadence || sched.cadenceLabelFor(source), status, args);
    }
  } else {
    // after: one final probe; if it still has nothing, mark missed.
    res = await safeAttempt(source, target, status, args);
  }

  if (dataReceivedOf(res)) {
    markReleased(source, target);
    return res;
  }
  if (state === "after") {
    recordMissed(source, target);
    return { source, status: "missed" };
  }
  return res;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Macro Live Update System
  node update_live.cjs [options]

Options:
  --source=NAME       only update one source (FRED|OECD|EUROSTAT|IMF|BIS|WORLD_BANK)
  --force             ignore the schedule + previous signal (force full pipeline)
  --allow-new-series  allow brand-new series into the DB (default: refresh existing only)
  --only-light        run the light checker only, write status, download nothing
  --dry-run           run everything except the final DB write
`);
    return;
  }

  ensureAllDirs();

  // Unified timing: make sure synthetic cadence rows for OECD/IMF/WORLD_BANK
  // exist (>=10y ahead), then decide WHAT to run purely from release_events.
  try { Mk.ensureMacroCadenceEvents(); } catch (e) { console.warn("[calendar] cadence ensure failed: " + e.message); }

  const status = loadStatus();
  const startedAt = new Date().toISOString();
  logger.section(`Macro Live Update started at ${startedAt}`);
  logger.info(`Database: ${DB_PATH}`);
  logger.info(`Log file: ${logger.logFile}`);

  const nowMs = Date.now();

  // ---- Which sources to run --------------------------------------------
  // * --source=X   -> caller explicitly wants that source (debug path).
  // * --force      -> union of every source present in the unified table.
  // * otherwise    -> nearest scheduled release_events that are DUE at `nowMs`.
  let targets = [];
  if (args.source) {
    targets = [{ source: args.source, cadence: sched.cadenceLabelFor(args.source), dueIso: null }];
  } else if (args.force) {
    const db = calStore.openStore();
    const distinct = db.prepare("SELECT DISTINCT source FROM release_events").all().map((r) => r.source);
    calStore.close(db);
    const list = distinct.length ? distinct : ["FRED", "OECD", "EUROSTAT", "IMF", "BIS", "WORLD_BANK"];
    targets = list.map((s) => ({ source: s, cadence: sched.cadenceLabelFor(s), dueIso: null }));
  } else {
    targets = sched.dueSourcesFromCalendar(nowMs);
  }

  if (!targets.length) {
    logger.info("No macro release event is due right now (single release_events timing) — nothing to run.");
    try {
      calStore.appendError({
        error_code: "NO_UPCOMING_EVENTS",
        details: "no scheduled release_events due at " + new Date(nowMs).toISOString(),
      });
    } catch {}
    status.last_run = new Date().toISOString();
    saveStatus(status);
    return;
  }

  logger.info(`Scheduled (release_events, nearest-first): ${targets.map((t) => t.source).join(", ")}`);

  const summary = [];
  const windowed = !args.source && !args.force; // only the pure-scheduled path uses release windows
  for (const target of targets) {
    const source = target.source;
    try {
      let res;
      if (windowed && Number.isFinite(target.dueTs)) {
        res = await runTargetWithWindow(target, status, args, nowMs);
      } else {
        // Non-windowed path (--source / --force): run the pipeline directly
        // (one shot, no poll-loop — intended for manual/debug). We keep the
        // original call shape (runSourcePipeline, so surprises still raise and
        // get handled by the outer catch), then STILL honour the release-window
        // outcome at the end (prampt1 §2.4): if we have a real scheduled release
        // whose window has already closed and no data arrived, record a
        // MISSED_EVENT so the miss is not lost on manual/forced runs either.
        res = await runSourcePipeline(source, target.cadence || sched.cadenceLabelFor(source), status, args);
        if (dataReceivedOf(res) && target.dueIso) {
          markReleased(source, target);
        } else if (shouldMarkMissed(source, target, res)) {
          recordMissed(source, target);
        }
      }
      summary.push(res);
    } catch (e) {
      logger.error(`[${source}] pipeline error: ${e.message}`);
      summary.push({ source, status: "error", error: e.message });
    }
  }

  status.last_run = new Date().toISOString();
  saveStatus(status);

  logger.section("=== Update summary ===");
  for (const s of summary) {
    logger.info(`[${s.source}] ${s.status}`);
  }
  logger.success(`Macro Live Update finished (${((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1)}s)`);
}

if (require.main === module) {
  main().catch((e) => {
    logger.error("Fatal: " + (e.stack || e.message));
    process.exit(1);
  });
}

module.exports = {
  main,
  parseArgs,
  runTargetWithWindow,
  shouldMarkMissed,
  // scheduler helpers re-exported for API compatibility (source of truth:
  // ../calendar/scheduler.cjs, kept pipeline-independent for isolated tests).
  cadenceLabelFor: sched.cadenceLabelFor,
  dueSourcesFromCalendar: sched.dueSourcesFromCalendar,
  markReleasedThrough: sched.markReleasedThrough,
  markMissedThrough: sched.markMissedThrough,
};
