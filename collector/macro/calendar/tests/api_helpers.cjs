// ============================================================
// Shared harness for testing the Macro HTTP API in isolation.
// File: collector/macro/calendar/tests/api_helpers.cjs
//
// Points the production /macro/errors route at a throwaway DB (via the
// MACRO_ERRORS_DB env it now honours), boots the real HTTP server in-process
// on an ephemeral port, runs the callback with a working base URL, then shuts
// down + restores the env — so tests never touch the real releases.db.
// ============================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("../../api/server.cjs");

/** mkdir-less temp workspace for a single test. Returns { dir, dbPath }. */
function newDb(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `macro-api-${tag}-`));
  return { dir, dbPath: path.join(dir, "releases.db") };
}

function cleanUp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * Boot the real macro API on an ephemeral port, with GET /macro/errors reading
 * from `dbPath`. `fn(baseUrl) -> any` runs while it listens. Always closes the
 * server and restores the env, even if fn throws.
 */
async function withApi(dbPath, fn) {
  const prev = process.env.MACRO_ERRORS_DB;
  process.env.MACRO_ERRORS_DB = dbPath;
  const srv = server.start(0); // ephemeral port
  try {
    await new Promise((res) => srv.on("listening", res));
    const { port } = srv.address();
    const base = `http://127.0.0.1:${port}/macro`;
    return await fn(base);
  } finally {
    if (prev === undefined) delete process.env.MACRO_ERRORS_DB;
    else process.env.MACRO_ERRORS_DB = prev;
    try {
      await new Promise((r) => srv.close(() => r()));
    } catch {}
  }
}

/** GET a URL and parse the JSON. Throws loudly (with status) when HTTP != 2xx. */
async function getJson(url, ms = 8000, allowNotOk = false) {
  const c = await fetch(url, { signal: AbortSignal.timeout(ms) });
  const body = await c.json().catch(() => null);
  if (!allowNotOk && c.status >= 300) {
    throw new Error(`GET ${url} -> HTTP ${c.status}: ${JSON.stringify(body)}`);
  }
  return { status: c.status, body };
}

module.exports = { newDb, cleanUp, withApi, getJson };
