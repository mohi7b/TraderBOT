/**
 * ============================================================
 * Macro Live Update System — sqlite3 CLI helper
 * File: collector/macro/update/lib/sqlite.cjs
 *
 * The final database (collector/macro/db/macro.db) has ~12M data
 * rows and is managed with the system `sqlite3` CLI — the same
 * approach used by collector/macro/db_build/main_offline_loader.cjs.
 *
 * Two primitives:
 *   - runScript(sql)      feed a full SQL script (DDL + .import + merge)
 *   - query(sql)          run one query, return CSV text (for light checks)
 * ============================================================
 */
const { spawn } = require("child_process");
const { DB_PATH } = require("./paths.cjs");

/**
 * Feed an SQL script to the sqlite3 CLI via stdin.
 * @param {string} sql       full script (may include .import directives)
 * @param {string} [dbPath]  database path (default collector/macro/db/macro.db)
 * @returns {Promise<string>} stdout of sqlite3
 */
function runScript(sql, dbPath = DB_PATH) {
  return new Promise((resolve, reject) => {
    const proc = spawn("sqlite3", [dbPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`sqlite3 exited with code ${code}: ${stderr}`));
      resolve(stdout);
    });

    const write = (s) =>
      new Promise((res) => {
        if (proc.stdin.write(s)) return res();
        proc.stdin.once("drain", res);
      });

    (async () => {
      await write(sql);
      proc.stdin.end();
    })().catch((e) => {
      proc.kill();
      reject(e);
    });
  });
}

/**
 * Run a single query and return raw text (pipe-separated by default,
 * `-csv` mode used to make parsing easy).
 */
function query(sql, dbPath = DB_PATH) {
  return new Promise((resolve, reject) => {
    const q = spawn("sqlite3", ["-csv", dbPath, sql], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    q.stdout.on("data", (d) => (out += d));
    q.stderr.on("data", (d) => (err += d));
    q.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `query failed (${code})`))
    );
  });
}

/**
 * Run a list of simple queries and return array of trimmed results.
 */
async function queryMany(sqls, dbPath = DB_PATH) {
  const out = [];
  for (const s of sqls) out.push(await query(s, dbPath));
  return out;
}

module.exports = { runScript, query, queryMany };
