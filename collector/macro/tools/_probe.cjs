"use strict";
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const log = [];
const record = (k, v) => log.push([k, v]);

try {
  record("__dirname", HERE);
  record("db exists macro.db", fs.existsSync(path.join(ROOT, "db", "macro.db")));
  record("cwd", process.cwd());
  record("cwd file has db/macro.db", fs.existsSync(path.join(process.cwd(), "db", "macro.db")));

  let b = "n/a";
  try { b = require.resolve("better-sqlite3", { paths: [HERE, ROOT] }); } catch (e) { b = "ERR:" + e.message.slice(0, 120); }
  record("better-sqlite3 resolve", b);

  // try to write
  const out = path.join(HERE, "_probe.txt");
  try {
    fs.writeFileSync(out, "probe ok at " + new Date().toISOString() + "\n" + JSON.stringify(log, null, 1), "utf8");
    record("write succeeded", fs.existsSync(out));
    record("probe file path", out);
  } catch (e) {
    record("write failed", String(e && e.message || e).slice(0, 200));
  }
} catch (e) {
  log.push(["top-level", String(e && e.stack || e)]);
}

const logPath = path.join(HERE, "_probe_report.json");
try {
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), "utf8");
  process.stdout.write("probe report written\n");
} catch (e) {
  process.stdout.write("PROBE WRITE FAILED: " + String(e) + "\n");
}
