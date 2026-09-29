// Dynamic Historical API server (dependency-free, node:http only).
//
// After removing the persisted-summary/indicator/zone API, this server exposes only the two dynamic
// routes that compute everything on the fly from raw 1m candles:
//   GET /tf/:symbol/:tf        -> higher-timeframe candles built dynamically
//   GET /summary/:symbol/:tf   -> market summary built dynamically
//
// Port (default 4000) and rootDir come from config. A tiny JSON log line is emitted per request.
const http = require("node:http");
const crypto = require("node:crypto");
const { pathToRegexp, match } = require("./utils/router.cjs");
const { ok, error } = require("./utils/formatter.cjs");
const { tfHandler } = require("./routes/tf-dynamic.cjs");
const { summaryHandler } = require("./routes/summary-dynamic.cjs");
const { metadataHandler } = require("./routes/metadata.cjs");
/** P5/گام ۱ — جریان نقدینگی سبک (RVOL/z-score از دادهٔ موجود ✓ · بقیه صریحاً null ✗) */
const { flowHandler } = require("./routes/flow.cjs");
const proxy = require("./utils/engine-proxy.cjs");
const { engineStats } = proxy;
const { SPEC_VERSIONS } = require("./utils/spec-version.cjs");
const { DEFAULT_ROOT } = require("../_engine/root.cjs");

const DEFAULT_PORT = Number(process.env.HISTORICAL_API_PORT) || 4000;
const DEFAULT_HISTORICAL_ROOT = DEFAULT_ROOT; // canonical root -> candles_1m.db in crypto/<symbol>/

function createLogger({ stdout = process.stdout } = {}) {
    function log(level, message, extra = {}) {
        const line = `[${new Date().toISOString()}] [${level}] ${message} ${Object.keys(extra).length ? JSON.stringify(extra) : ""}`.trimEnd();
        stdout.write(`${line}\n`);
    }
    return Object.freeze({
        info: (message, extra) => log("INFO", message, extra),
        warn: (message, extra) => log("WARN", message, extra),
        error: (message, extra) => log("ERROR", message, extra),
    });
}

function buildRoutes() {
    return [
        { method: "GET", path: "/tf/:symbol/:tf", handler: tfHandler, match: pathToRegexp("/tf/:symbol/:tf") },
        { method: "GET", path: "/summary/:symbol/:tf", handler: summaryHandler, match: pathToRegexp("/summary/:symbol/:tf") },
        /** S1 — alias درخواستی (بدون شکستن مسیر فعلی، D16/D24) */
        { method: "GET", path: "/candles/:symbol/:tf", handler: tfHandler, match: pathToRegexp("/candles/:symbol/:tf") },
        /** S1 — متادیتای صادق سرویس (تازگی/پوشش/ونوها/قرارداد) */
        { method: "GET", path: "/metadata/:symbol", handler: metadataHandler, match: pathToRegexp("/metadata/:symbol") },
        /** P5 — جریان نقدینگی سبک (فقط از دادهٔ موجود ✓ · بقیه null صریح ✗) */
        { method: "GET", path: "/flow/:symbol", handler: flowHandler, match: pathToRegexp("/flow/:symbol") },
    ];
}

async function readJson(req, { maxBytes = 1_000_000 } = {}) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxBytes) { reject(new RangeError("request body too large")); req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (chunks.length === 0) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
            catch { reject(new TypeError("invalid JSON body")); }
        });
        req.on("error", reject);
    });
}

function writeJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders,
    });
    res.end(body);
}

/**
 * **C3 — ETag سبک و پایدار:** هش ۱۶ کاراکتری از *محتوای معنادار* تایم‌فریم
 * (نماد/تایم‌فریم/تعداد/آخرین کندل + وضعیت و مقدارهای کندل در حال تشکیل).
 * ⚠️ عمداً `window.to`/`nowMs` در هش **نیستند**: پنجرهٔ لغزان هر ثانیه عوض
 * می‌شود ولی داده تازه نیست ⇒ وگرنه ۳۰۴ هرگز رخ نمی‌داد.
 */
function etagOfTf(data) {
    const f = data && data.forming ? data.forming : null;
    const sig = [
        data && data.symbol,
        data && data.tf,
        data && data.count,
        data && data.latestTimestamp,
        f ? `${f.timestamp}:${f.open}:${f.high}:${f.low}:${f.close}:${f.volume ?? ""}` : "none",
        data && data.meta ? `${data.meta.clamped}:${data.meta.anchored}` : "",
    ].join("|");
    return `W/"${crypto.createHash("sha1").update(sig).digest("hex").slice(0, 16)}"`;
}

function createServer(config = {}) {
    const port = config.port ?? DEFAULT_PORT;
    const rootDir = config.rootDir ?? DEFAULT_HISTORICAL_ROOT;
    const logger = config.logger || createLogger();
    const routes = buildRoutes();
    /** S1: شمارنده‌ها + وضعیت آماده‌سازی (برای `/health` و `/metadata`) */
    const stats = { startedAt: Date.now(), requests: 0, byRoute: {}, hits: 0, misses: 0, errors: 0 };
    const warmup = { done: false, exchanges: null, ms: null };
    routes.push({
        method: "GET",
        path: "/health",
        handler: async () =>
            Object.freeze({
                ok: true,
                ready: warmup.done,
                uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000),
                warmup,
                cache: { hits: stats.hits, misses: stats.misses },
                engine: engineStats(),
                requests: stats.requests,
                byRoute: stats.byRoute,
                spec: SPEC_VERSIONS,
            }),
        match: pathToRegexp("/health"),
    });

    const server = http.createServer(async (req, res) => {
        const startedAt = Date.now();
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const method = req.method.toUpperCase();
        const pathname = url.pathname;

        const query = {};
        for (const [key, value] of url.searchParams.entries()) query[key] = value;

        try {
            let route = null;
            let params = {};
            for (const candidate of routes) {
                if (candidate.method !== method) continue;
                const m = match(pathname, candidate.match);
                if (m) { route = candidate; params = m; break; }
            }

            if (!route) {
                logger.warn(`${method} ${pathname}`, { status: 404, ms: Date.now() - startedAt });
                writeJson(res, 404, error("not found", 404));
                return;
            }

            const body = method === "POST" ? await readJson(req) : {};
            stats.requests += 1;
            stats.byRoute[route.path] = (stats.byRoute[route.path] ?? 0) + 1;
            const requestCtx = { query, body, rootDir, stats, headers: req.headers };
            const data = await route.handler(params, requestCtx);
            /**
             * **C3 — ETag/304 فقط روی `/tf`** (طبق تصمیم کاربر: سبک‌ترین مسیر،
             * کافی برای چارت). پاسخ بی‌تغییر = **۳۰۴ بدون بدنه**؛ در صورت
             * تغییر، بدنه با همان ETag برگردانده می‌شود (`no-cache` ⇒ کلاینت
             * شرطی می‌پرسد ولی همیشه اعتبارسنجی می‌کند).
             */
            if (route.path === "/tf/:symbol/:tf") {
                const payload = ok(data);
                const etag = etagOfTf(data);
                if (req.headers["if-none-match"] === etag) {
                    logger.info(`${method} ${pathname}`, {
                        status: 304,
                        etag,
                        ms: Date.now() - startedAt,
                    });
                    res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
                    res.end();
                    return;
                }
                logger.info(`${method} ${pathname}`, {
                    status: 200,
                    etag,
                    ms: Date.now() - startedAt,
                });
                writeJson(res, 200, payload, { ETag: etag, "Cache-Control": "no-cache" });
                return;
            }
            logger.info(`${method} ${pathname}`, { status: 200, ms: Date.now() - startedAt });
            writeJson(res, 200, ok(data));
        } catch (err) {
            const status = err && err.status ? err.status : (err instanceof RangeError || err instanceof TypeError ? 400 : 500);
            logger.error(`${method} ${pathname}`, { error: err.message, status, ms: Date.now() - startedAt });
            writeJson(res, status, error(err.message || "internal error", status));
        }
    });

    return Object.freeze({
        server,
        port,
        listen: () => new Promise((resolve) => server.listen(port, () => {
            logger.info("historical API listening", { port });
            /**
             * Background warmup: resolving the default exchange ("most populated")
             * is a ~26 s index scan on the 4.15 GB store (see
             * _engine/timeframe/build-tf.cjs#listExchanges).
             *
             * ⚠️ **D23 (اندازه‌گیری‌شده در S1):** `better-sqlite3` سنکرون است و این
             * اسکن، حلقهٔ event loop را می‌بندد ⇒ هر درخواستی که در همان بازه برسد
             * (حتی `/health`) **معطل می‌ماند**. در S1 با تأخیر انداختن warmup،
             * سرویس در ثانیه‌های اول پاسخ‌ده می‌مانَد و `/health.ready` پس از آن
             * true می‌شود؛ **رفع کامل = chunked/yielding یا worker thread در S2**.
             */
            const WARMUP_DELAY_MS = Number(process.env.HISTORICAL_WARMUP_DELAY_MS || 3000);
            setTimeout(() => {
                const symbols = (process.env.HISTORICAL_WARM_SYMBOLS || "BTCUSDT")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                const startedAt = Date.now();
                /**
                 * **S2 (D23 حل شد):** warmup داخل **Worker Thread** اجرا می‌شود؛
                 * اسکن سنگین ایندکس در حلقهٔ جداگانه انجام می‌شود و سرور در همان
                 * زمان به `/health` و `/tf` پاسخ می‌دهد (پیش‌تر حلقه بلاک می‌شد).
                 */
                proxy
                    .warmup(symbols)
                    .then((res) => {
                        warmup.done = true;
                        warmup.exchanges = res.warmed;
                        warmup.ms = Date.now() - startedAt;
                        logger.info("exchange cache warmed (worker)", { warmed: res.warmed, ms: warmup.ms });
                        /**
                         * **S4-B — pre-warm کش دیسکی:** ساخت تایم‌فریم‌های سنگین
                         * (`HISTORICAL_PREWARM_TFS`، پیش‌فرض `1d,1w,1mo`) و نوشتن
                         * snapshot روی دیسک تا استارت بعدی **بدون بازسازی** پاسخ
                         * دهد. در پس‌زمینه اجرا می‌شود و `ready` را عقب نمی‌اندازد.
                         */
                        proxy
                            .prewarm(symbols)
                            .then((items) => {
                                warmup.prewarm = items;
                                logger.info("tf pre-warm done (disk cache)", {
                                    ok: items.filter((i) => i.ok).length,
                                    total: items.length,
                                    tfs: items.map((i) => `${i.tf}:${i.ms}ms`).join(","),
                                });
                            })
                            .catch((err) => {
                                logger.warn("tf pre-warm failed", { error: String(err && err.message) });
                            });
                    })
                    .catch((err) => {
                        warmup.error = err && err.message ? String(err.message) : "warmup failed";
                        logger.warn("exchange cache warmup failed", { error: warmup.error });
                    });
            }, WARMUP_DELAY_MS).unref?.();
            resolve();
        })),
        close: () => new Promise((resolve) => server.close(resolve)),
    });
}

if (require.main === module) {
    const app = createServer();
    app.listen().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

module.exports = { createServer, createLogger, DEFAULT_PORT, DEFAULT_HISTORICAL_ROOT };
