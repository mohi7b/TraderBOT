/* ============================================================
 * File: collector/crypto/realtime/server.cjs
 * Section: collector/crypto/realtime  (standalone HTTP + SSE surface)
 * Version: 2.0.0
 *
 * Role:
 *   Dependency-free (node:http) server over the public section API.
 *   It is the only thing that binds the realtime section to a socket;
 *   the section itself never opens a listening port.
 *
 *   Routes:
 *     GET    /                       route index + section status (JSON)
 *     GET    /health                 realtime.status()
 *     GET    /state/:symbol          realtime.getState(symbol) — read-only
 *     GET    /request/:symbol        start streams (?markets=&exchanges=)
 *     POST   /request/:symbol        same (body/query options)
 *     GET    /release/:symbol        stop + release the symbol
 *     DELETE /release/:symbol        same
 *     GET    /stream/:symbol         Server-Sent Events (live bus feed)
 *
 *   CLI:
 *     node collector/crypto/realtime/server.cjs [--port 4100] [--host 127.0.0.1] \
 *          [--markets spot,futures] [--exchanges binance,bybit] [BTCUSDT ETHUSDT]
 *
 *   Env (see config/realtime.cjs):
 *     REALTIME_PORT · REALTIME_HOST · REALTIME_SERVER_ENABLED
 * ============================================================ */

const http = require("node:http");
const CONFIG = require("./config/realtime.cjs");
const realtime = require("./index.cjs");

const log = realtime.core.createLogger("server");

/* ------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------- */
function sendJson(response, status, body) {
    const payload = `${JSON.stringify(body, null, 2)}\n`;
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
    });
    response.end(payload);
}

function sendText(response, status, text) {
    response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
    });
    response.end(text);
}

/** "spot,futures" | "both" → ["spot", "futures"] | null (when absent). */
function parseMarkets(value) {
    if (value === undefined || value === null || value === "") return null;
    const parts = String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (parts.includes("both")) return [...CONFIG.markets];
    const valid = parts.filter((item) => ["spot", "futures"].includes(item));
    return valid.length ? valid : null;
}

function parseExchanges(value) {
    if (value === undefined || value === null || value === "") return null;
    const parts = String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    return parts.length ? parts : null;
}

function requestOptions(searchParams) {
    const options = {};
    const markets = parseMarkets(searchParams.get("markets"));
    const exchanges = parseExchanges(searchParams.get("exchanges"));
    if (markets) options.markets = markets;
    if (exchanges) options.exchanges = exchanges;
    if (searchParams.get("force") === "true") options.force = true;
    return options;
}

function normalizeSymbolParam(value) {
    const symbol = realtime.normalizeSymbol(decodeURIComponent(String(value || "")));
    return symbol || null;
}

/* ------------------------------------------------------------
 * SSE (GET /stream/:symbol)
 * ---------------------------------------------------------- */
const sseClients = new Set();

function writeSseEvent(response, entry) {
    response.write(`event: ${entry.event}\ndata: ${JSON.stringify(entry.payload)}\n\n`);
}

function startSse(request, response, symbol) {
    response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no"
    });
    response.write(`retry: ${Math.max(1000, CONFIG.sseThrottleMs * 4)}\n\n`);

    // bootstrap tail: the newest entry of every channel of this symbol
    for (const entry of realtime.core.getRuntime().bus.tail({ symbol }, 20)) writeSseEvent(response, entry);

    let lastSentAt = 0;
    const unsubscribe = realtime.subscribe((entry) => {
        if (entry.symbol !== symbol) return;
        const now = Date.now();
        if (now - lastSentAt < CONFIG.sseThrottleMs) return;
        lastSentAt = now;
        writeSseEvent(response, entry);
    });

    const heartbeat = setInterval(() => response.write(": ping\n\n"), 15000);

    const stop = () => {
        clearInterval(heartbeat);
        unsubscribe();
        sseClients.delete(stop);
    };

    sseClients.add(stop);
    request.on("close", stop);
    request.on("error", stop);

    log.info(`sse attached ${symbol} (${sseClients.size} client(s))`);
}

/* ------------------------------------------------------------
 * Router
 * ---------------------------------------------------------- */
async function handle(request, response, url) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean);
    const method = request.method || "GET";

    if (method === "OPTIONS") {
        response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "content-type" });
        response.end();
        return;
    }

    if (path === "/") {
        sendJson(response, 200, {
            section: "realtime",
            version: realtime.version,
            routes: ["GET /", "GET /health", "GET /state/:symbol", "GET /request/:symbol", "POST /request/:symbol", "GET|DELETE /release/:symbol", "GET /stream/:symbol"],
            status: realtime.status()
        });
        return;
    }

    if (path === "/health") {
        sendJson(response, 200, realtime.status());
        return;
    }

    const [route, rawSymbol] = parts;
    if (!["state", "request", "release", "stream"].includes(route)) {
        sendJson(response, 404, { error: "unknown route", path });
        return;
    }

    const symbol = normalizeSymbolParam(rawSymbol);
    if (!symbol) {
        sendJson(response, 400, { error: "invalid symbol", path });
        return;
    }

    if (route === "state") {
        if (method !== "GET") return sendJson(response, 405, { error: "use GET /state/:symbol" });
        const state = realtime.getState(symbol);
        return sendJson(response, state ? 200 : 404, state || { error: "symbol has not been requested yet" });
    }

    if (route === "request") {
        if (method !== "GET" && method !== "POST") return sendJson(response, 405, { error: "use GET or POST /request/:symbol" });
        const options = requestOptions(url.searchParams);
        const result = await realtime.request(symbol, options);
        return sendJson(response, 200, result);
    }

    if (route === "release") {
        if (method !== "GET" && method !== "DELETE") return sendJson(response, 405, { error: "use GET or DELETE /release/:symbol" });
        return sendJson(response, 200, { symbol, released: realtime.release(symbol) });
    }

    // route === "stream"
    if (method !== "GET") return sendJson(response, 405, { error: "use GET /stream/:symbol" });
    return startSse(request, response, symbol);
}

/* ------------------------------------------------------------
 * Server factory
 * ---------------------------------------------------------- */
function createRealtimeServer(overrides = {}) {
    const host = overrides.host || CONFIG.server.host;
    const port = Number(overrides.port) || CONFIG.server.port;

    const server = http.createServer((request, response) => {
        const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
        const startedAt = Date.now();

        Promise.resolve()
            .then(() => handle(request, response, url))
            .catch((err) => {
                log.error(`${request.method} ${url.pathname} failed → ${err.message}`);
                if (!response.headersSent) sendJson(response, 500, { error: err.message });
                else response.end();
            })
            .then(() => {
                if (!response.writableEnded) return;
                log.debug(`${request.method} ${url.pathname} → ${response.statusCode} (${Date.now() - startedAt}ms)`);
            });
    });

    return {
        server,
        host,
        port,

        listen() {
            return new Promise((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, host, () => {
                    log.info(`listening on http://${host}:${port}`);
                    resolve({ host, port });
                });
            });
        },

        close() {
            for (const stop of [...sseClients]) stop();
            return new Promise((resolve) => server.close(() => resolve(true)));
        },

        /** Symbols currently watched through this server. */
        status() {
            return realtime.status();
        }
    };
}

/* ------------------------------------------------------------
 * CLI
 * ---------------------------------------------------------- */
function parseCli(argv) {
    const overrides = {};
    const symbols = [];

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--port" || token.startsWith("--port=")) {
            overrides.port = Number(token.startsWith("--port=") ? token.slice(7) : argv[++index]);
            continue;
        }
        if (token === "--host" || token.startsWith("--host=")) {
            overrides.host = token.startsWith("--host=") ? token.slice(7) : argv[++index];
            continue;
        }
        if (token === "--markets" || token.startsWith("--markets=")) {
            overrides.markets = parseMarkets(token.startsWith("--markets=") ? token.slice(10) : argv[++index]);
            continue;
        }
        if (token === "--exchanges" || token.startsWith("--exchanges=")) {
            overrides.exchanges = parseExchanges(token.startsWith("--exchanges=") ? token.slice(12) : argv[++index]);
            continue;
        }
        if (token.startsWith("--")) continue;

        const symbol = realtime.normalizeSymbol(token);
        if (symbol) symbols.push(symbol);
    }

    return { overrides, symbols };
}

async function main() {
    const { overrides, symbols } = parseCli(process.argv.slice(2));

    if (CONFIG.server.enabled === false) {
        log.warn("REALTIME_SERVER_ENABLED=false → the server stays down");
        return 0;
    }

    const app = createRealtimeServer(overrides);
    await app.listen();

    const options = {};
    if (overrides.markets) options.markets = overrides.markets;
    if (overrides.exchanges) options.exchanges = overrides.exchanges;

    for (const symbol of symbols) {
        const response = await realtime.request(symbol, options);
        const running = response.streams.filter((stream) => stream.status === "running").length;
        log.info(`warmed ${symbol}: ${running}/${response.streams.length} stream(s) — ${response.venues.join(", ") || "no venue"}`);
    }

    const shutdown = async (signal) => {
        log.info(`${signal} → closing the realtime server`);
        await app.close();
        realtime.releaseAll("server-shutdown");
        // spot WS factories cannot be torn down (venue-adapters/wrappers.cjs),
        // so the process must not wait for the sockets to drain.
        process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    if (symbols.length) log.info(`ready — ${symbols.length} symbol(s) streaming, ${sseClients.size} SSE client(s)`);
    return null;  // stays alive until a signal arrives
}

if (require.main === module) {
    main().catch((err) => {
        log.error(`realtime server failed → ${err.message}`);
        process.exit(1);
    });
}

module.exports = { createRealtimeServer, parseCli, parseMarkets, parseExchanges, requestOptions };
