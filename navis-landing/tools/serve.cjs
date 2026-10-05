#!/usr/bin/env node
/*
 * Dependency-free static file server for the NAVIS landing page.
 *
 * Serves ONLY the landing site (navis-landing/) on a dedicated port so it can
 * run next to an existing Nginx / Sanaei panel installation without touching a
 * single one of its configs. There is no directory listing and the tooling
 * folder (tools/, node_modules/, dotfiles) is never published.
 *
 *   node tools/serve.cjs                       # 0.0.0.0:8080
 *   node tools/serve.cjs --port 8080 --host 0.0.0.0
 *   PORT=8081 node tools/serve.cjs
 *
 * Flags: --port N (default 8080), --host IP (default 0.0.0.0),
 *        --dir NAME (default the landing root = this file's parent folder),
 *        --force (allow a protected panel/VPN port - see PROTECTED_PORTS).
 *
 * Requires Node >= 18. Stop it with Ctrl+C, or `kill $(cat /tmp/navis-landing.pid)`.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(__dirname, "..", flag("dir", "."));
const PORT = Number(flag("port", process.env.PORT || 8080));
const HOST = flag("host", process.env.HOST || "0.0.0.0");
const INDEX = "index.html";

/* Ports owned by the Sanaei panel / Xray (V2Ray) inbounds and by the system
 * services of this VPN host. Binding one of them would push the VPN off its
 * port (or the VPN would block us), so they are refused unless --force is
 * passed explicitly. Keep this list in sync with tools/deploy.sh. */
const PROTECTED_PORTS = new Set([
  22, 53, 80, 443, 2053, 2096, 3333, 8443, 11111,
  21115, 21116, 21117, 21118, 21119, 34903, 54321,
]);
const FORCE = process.argv.includes("--force");

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[serve] invalid port: ${PORT}`);
  process.exit(1);
}

if (PROTECTED_PORTS.has(PORT) && !FORCE) {
  console.error(
    `[serve] port ${PORT} is reserved for the Sanaei panel / Xray VPN inbounds on this host.\n` +
      `[serve] nothing was bound. use another port (e.g. --port 8088) or pass --force to override.`
  );
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

// Never published: tooling, dependency folders, caches and dotfiles.
const DENY_SEGMENTS = new Set(["tools", "node_modules", ".git", ".vscode", "__pycache__"]);

/* Resolve a request path to a file inside ROOT, or null when it must be denied. */
function safePath(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(requestPath).split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = path.resolve(ROOT, "." + path.posix.normalize(decoded));
  const rel = path.relative(ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const segments = rel.split(path.sep).filter(Boolean);
  if (segments.some((seg) => seg.startsWith(".") || DENY_SEGMENTS.has(seg))) return null;
  return target;
}

/* Follow a directory to its index.html, else give up (no listings). */
async function resolveFile(candidate, depth = 0) {
  if (depth > 3) return null;
  try {
    const st = await fsp.stat(candidate);
    if (st.isDirectory()) return resolveFile(path.join(candidate, INDEX), depth + 1);
    if (!st.isFile()) return null;
    return { file: candidate, stat: st };
  } catch {
    return null;
  }
}

function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(...parts) {
  console.log(`[${stamp()}]`, ...parts);
}

function reply(req, res, status, headers, body) {
  res.writeHead(status, { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", ...headers });
  if (req.method === "HEAD") res.end();
  else res.end(body == null ? "" : body);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = req.url || "/";
  const done = (status) => log(`${req.method} ${url} -> ${status} (${Date.now() - started}ms)`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    reply(req, res, 405, { "Content-Type": "text/plain; charset=utf-8" }, "405 Method Not Allowed\n");
    return done(405);
  }

  const target = safePath(url);
  if (!target) {
    reply(req, res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "400 Bad Request\n");
    return done(400);
  }

  const found = await resolveFile(target);
  const type = found ? TYPES[path.extname(found.file).toLowerCase()] : null;
  if (!found || !type) {
    reply(req, res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "404 Not Found\n");
    return done(404);
  }

  const etag = `W/"${found.stat.size.toString(16)}-${Math.floor(found.stat.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": type,
    "Last-Modified": found.stat.mtime.toUTCString(),
    ETag: etag,
    "Cache-Control": path.extname(found.file).toLowerCase() === ".html" ? "no-cache" : "public, max-age=300",
  };

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    res.end();
    return done(304);
  }

  headers["Content-Length"] = found.stat.size;
  res.writeHead(200, headers);
  done(200);
  if (req.method === "HEAD") return res.end();

  const stream = fs.createReadStream(found.file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry.family === "IPv4" && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[serve] port ${PORT} is already in use on ${HOST} - nothing was changed, aborting.`);
  } else if (err.code === "EACCES") {
    console.error(`[serve] not allowed to bind ${HOST}:${PORT} (privileged port?)`);
  } else {
    console.error("[serve]", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log(`NAVIS landing served from ${ROOT}`);
  log(`listening on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/`);
  for (const ip of addresses()) log(`           http://${ip}:${PORT}/`);
  log("press Ctrl+C to stop");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
