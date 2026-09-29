// Historical Server Layer — Engine Proxy (S2)
//
// One place that owns:
//   · the engine WORKER (so the HTTP loop never blocks — D23)
//   · the RAM cache: TTL + LRU + hit/miss counters (D7's RAM layer)
//   · in-flight de-duplication (identical concurrent requests share one build)
//   · a defensive in-process fallback (HISTORICAL_INLINE=1 or worker failure)
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const { buildTf, warmExchangeCache, listExchanges, latestTimestampRaw, readRaw1m } = require("../../_engine/timeframe/build-tf.cjs");
const { assertTf, tfWidthMs } = require("../../_engine/timeframe/utils.cjs");
const { normalize1m } = require("../../_engine/normalize/normalize.cjs");
const { DEFAULT_ROOT } = require("../../_engine/root.cjs");
/** S4-B: کش دیسکی تایم‌فریم (D22) */
const diskCache = require("./tf-disk-cache.cjs");
const fs = require("node:fs");
const { resolveRaw1mPath } = require("../../full/merge-into-1m-db.cjs");

/**
 * **اثر انگشت DB خام (O(1)):** `size + mtimeMs` فایل `candles_1m.db`.
 * اگر تغییر نکرده باشد ⇒ **هیچ دادهٔ تازه‌ای نوشته نشده** ⇒ snapshot دیسکی
 * عیناً همان چیزی است که بازسازی می‌داد ✓ (بدون هیچ کوئری ✗).
 * چرا: `latestTimestampRaw` روی این DB **۵۰–۷۵ ثانیه** است ✗ و نمی‌تواند روی
 * مسیر بحرانی هر درخواست بنشیند.
 */
function dbFingerprint(symbol) {
    try {
        const st = fs.statSync(resolveRaw1mPath(symbol, { rootDir: DEFAULT_ROOT }));
        return `${st.size}:${Math.round(st.mtimeMs)}`;
    } catch {
        return null;
    }
}

const WORKER_FILE = path.join(__dirname, "..", "workers", "engine-worker.cjs");
const COVERAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const TTL_TF_MS = Number(process.env.HISTORICAL_TF_TTL_MS || 60_000); // ۱ دقیقه: هم‌طول کندل ۱m
const TTL_META_MS = Number(process.env.HISTORICAL_META_TTL_MS || 300_000); // ۵ دقیقه
const CACHE_MAX = Number(process.env.HISTORICAL_CACHE_MAX || 60); // سقف LRU
const CALL_TIMEOUT_MS = Number(process.env.HISTORICAL_WORKER_TIMEOUT_MS || 120_000);
/** S4-B — کش دیسکی (پیش‌فرض روشن · `HISTORICAL_TF_DISK=0` خاموش) */
const TF_DISK_ENABLED = process.env.HISTORICAL_TF_DISK !== "0";
const TTL_TF_DISK_MS = Number(process.env.HISTORICAL_TF_DISK_TTL_MS || 600_000);
/** TFs پیش‌گرم‌شده در بوت (S4-B) — پیش‌فرض: تایم‌فریم‌های سنگین */
const PREWARM_TFS = (process.env.HISTORICAL_PREWARM_TFS || "1d,1w,1mo").split(",").map((s) => s.trim()).filter(Boolean);
const PREWARM_ENABLED = process.env.HISTORICAL_PREWARM !== "0";

const cache = new Map(); // key -> { at, value, ttlMs }
const inflight = new Map(); // key -> Promise
const stats = { hits: 0, misses: 0, evictions: 0, workerCalls: 0, warmWorkerCalls: 0, workerErrors: 0, inlineCalls: 0, deduped: 0, diskHits: 0, diskHitFingerprint: 0, diskStale: 0, diskWrites: 0, prewarmed: 0, latestHits: 0, latestMisses: 0, latestSidecar: 0 };

/**
 * **S4 — دو اسلات ورکر (ورکر تعاملی + ورکر warmup):**
 * باگ اندازه‌گیری‌شدهٔ S2/D23: صف ورکر **سری** است و اسکن ۲۶–۵۰ ثانیه‌ای warmup
 * جلوی `/tf` و `/metadata` را می‌گیرد (`cold=47.5s`). چون یک op در حال اجرا
 * **قابل‌پیش‌گیری نیست**، اولویت‌بندی صف کافی نیست ⇒ **ورکر جداگانه** برای warmup:
 * درخواست‌های تعاملی هرگز پشت اسکن صرافی نمی‌مانند.
 */
const slots = {
    interactive: { worker: null, pending: new Map(), nextId: 1 },
    warmup: { worker: null, pending: new Map(), nextId: 1 },
};
const isWarmOp = (op) => op === "warmup";
const slotFor = (op) => (isWarmOp(op) ? slots.warmup : slots.interactive);

function startWorker(slot) {
    if (slot.worker || process.env.HISTORICAL_INLINE === "1") return slot.worker;
    const w = new Worker(WORKER_FILE, { workerData: { rootDir: DEFAULT_ROOT } });
    slot.worker = w;
    w.on("message", (msg) => {
        if (!msg || msg.id === "ready") return;
        const entry = slot.pending.get(msg.id);
        if (!entry) return;
        slot.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.ok) entry.resolve(msg.data);
        else {
            stats.workerErrors += 1;
            entry.reject(new Error(msg.error || "worker error"));
        }
    });
    w.on("error", (err) => {
        stats.workerErrors += 1;
        for (const [, entry] of slot.pending) {
            clearTimeout(entry.timer);
            entry.reject(err);
        }
        slot.pending.clear();
        slot.worker = null; // در درخواست بعدی از نو ساخته می‌شود
    });
    w.unref?.();
    return w;
}

/** فراخوانی یک op روی **ورکر مربوط به خودش** (یا با `warm:true` روی ورکر warmup؛ S4). */
function callWorker(op, args, { warm = false } = {}) {
    if (process.env.HISTORICAL_INLINE === "1") {
        stats.inlineCalls += 1;
        return Promise.resolve(inline(op, args));
    }
    const onWarmSlot = warm || isWarmOp(op);
    const slot = onWarmSlot ? slots.warmup : slots.interactive;
    const w = startWorker(slot);
    if (!w) return Promise.resolve(inline(op, args));
    stats.workerCalls += 1;
    if (onWarmSlot) stats.warmWorkerCalls += 1;
    const id = slot.nextId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            slot.pending.delete(id);
            stats.workerErrors += 1;
            reject(new Error(`worker timeout after ${CALL_TIMEOUT_MS}ms (op=${op})`));
        }, CALL_TIMEOUT_MS);
        slot.pending.set(id, { resolve, reject, timer });
        w.postMessage({ id, op, args });
    }).catch((err) => {
        console.warn(`[engine-proxy] worker failed (${err.message}) → inline fallback`);
        stats.inlineCalls += 1;
        return inline(op, args);
    });
}

/** پیاده‌سازی درون‌پروسه (همان منطق ورکر — برای fallback و تست). */
function inline(op, args = {}) {
    if (op === "ping") return { pong: true, pid: process.pid };
    if (op === "warmup") return { warmed: warmExchangeCache(args.symbols || ["BTCUSDT"], DEFAULT_ROOT) };
    if (op === "tf") {
        const tf = assertTf(args.tf);
        return {
            tf,
            exchange: args.exchange || null,
            candles: buildTf(String(args.symbol).toUpperCase(), tf, {
                exchange: args.exchange || null,
                from: Number.isInteger(args.from) ? args.from : null,
                to: Number.isInteger(args.to) ? args.to : null,
                rootDir: DEFAULT_ROOT,
            }),
        };
    }
    if (op === "metadata") {
        const symbol = String(args.symbol).toUpperCase();
        const exchange = args.exchange || null;
        const nowMs = Number.isInteger(args.nowMs) ? args.nowMs : Date.now();
        const rows = readRaw1m(symbol, exchange, nowMs - COVERAGE_WINDOW_DAYS * DAY_MS, nowMs, DEFAULT_ROOT);
        const { candles, report } = normalize1m(rows, { nowMs });
        return {
            symbol,
            timeframe: assertTf(args.tf || "1h"),
            exchange,
            venues: listExchanges(symbol, DEFAULT_ROOT),
            barSpacingMs: tfWidthMs(args.tf || "1h"),
            latestTimestamp: latestTimestampRaw(symbol, exchange, DEFAULT_ROOT),
            nowMs,
            coverage: {
                windowDays: COVERAGE_WINDOW_DAYS,
                coveragePct: report.coveragePct,
                gapCount: report.gaps.length,
                missingBars: report.missingBars,
                rows: candles.length,
            },
        };
    }
    throw new RangeError(`unknown op: ${op}`);
}

function readCache(key, ttlMs) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > (hit.ttlMs ?? ttlMs)) {
        cache.delete(key);
        return null;
    }
    cache.delete(key); // LRU: تازه‌سازی ترتیب
    cache.set(key, hit);
    return hit.value;
}

function writeCache(key, value, ttlMs) {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
            cache.delete(oldest);
            stats.evictions += 1;
        }
    }
    cache.set(key, { at: Date.now(), value, ttlMs });
}

/**
 * اجرای یک op با **کش TTL/LRU** + **dedup درخواست‌های هم‌زمان**.
 * @returns `{ value, cached }` — `cached:true` یعنی از RAM آمد (بدون DB/ورکر)
 */
async function run(op, args, { ttlMs = 0, key = null, warm = false } = {}) {
    if (key && ttlMs > 0) {
        const hit = readCache(key, ttlMs);
        if (hit) {
            stats.hits += 1;
            return { value: hit, cached: true };
        }
        stats.misses += 1;
        const inFlight = inflight.get(key);
        if (inFlight) {
            stats.deduped += 1;
            return { value: await inFlight, cached: false };
        }
        const task = callWorker(op, args, { warm }).finally(() => inflight.delete(key));
        inflight.set(key, task);
        const value = await task;
        writeCache(key, value, ttlMs);
        return { value, cached: false };
    }
    return { value: await callWorker(op, args, { warm }), cached: false };
}

/** کندل‌های یک (symbol · tf · exchange · پنجره) با کش RAM (D7) + کش دیسکی (S4-B/D22). */
async function getTf({ symbol, tf, exchange = null, from = null, to = null, diskKeyFrom, diskKeyTo, warm = false }) {
    const key = `tf|${String(symbol).toUpperCase()}|${exchange ?? "auto"}|${tf}|${from ?? "any"}|${to ?? "any"}`;
    /**
     * کلید کش دیسکی = پنجرهٔ **درخواست** (`diskKeyFrom/To`) و اگر داده نشد، پنجرهٔ
     * واقعی ساخت. این‌طور `pre-warm` (بدون پنجره) با درخواست پیش‌فرض فرانت (بدون
     * پنجره) هم‌کلید می‌شود و کش دیسکی واقعاً hit می‌کند (S4-B).
     */
    const dkey = diskCache.keyOf({
        symbol,
        tf,
        exchange,
        from: diskKeyFrom !== undefined ? diskKeyFrom : from,
        to: diskKeyTo !== undefined ? diskKeyTo : to,
    });

    /**
     * **S4-B — اعتبارسنجی snapshot:**
     *  · حالت **همگروهی (bucket-aligned):** اگر آخرین کندل خام با آخرین کندلِ
     *    snapshot در **همان باکت همان تایم‌فریم** باشند، سریِ سرو‌شده دقیقاً همان
     *    چیزی است که بازسازی می‌داد — به‌جز «نوک زندهٔ باکت جاری» که ممکن است تا
     *    یک باکت عقب‌تر باشد (سمت چارت: مبنا `closed` است ⇒ ساختار/اندیکاتور
     *    اصلاً باکِت نیم‌کاره را نمی‌بیند ✓ و نوک با poll/diff تازه می‌شود ✓).
     *  · قواعد سخت‌گیرانه‌تر (تساوی دقیق `rawLatest`) با کلکتور فعال هر دقیقه
     *    invalid می‌شد و کش دیسکی بی‌فایده بود ✗.
     *  · اگر `latest` جلوتر از snapshot باشد ولی در باکت جاری (۱d مثال) ⇒ *سرو
     *    می‌شود* + شمارش `diskHits` (شفاف، چون نوک زنده در چارت دیده می‌شود).
     */
    const sameBucket = (a, b) =>
        a !== null && b !== null && Math.floor(a / tfWidthMs(tf)) === Math.floor(b / tfWidthMs(tf));
    const fingerprintNow = dbFingerprint(symbol);
    if (TF_DISK_ENABLED) {
        const snap = diskCache.read(dkey, TTL_TF_DISK_MS);
        if (snap) {
            /**
             * **اعتبار درجهٔ یک = اثر انگشت DB:** اگر فایل خام تغییر نکرده، snapshot
             * قطعاً جاری است ✓ (O(1) · بدون کوئری). اگر تغییر کرده، درجهٔ دوم
             * (هم‌گروهی باکت) با probe memo‌شده — که خودش TTL دارد ✓.
             */
            if (fingerprintNow && snap.fingerprint && snap.fingerprint === fingerprintNow) {
                stats.diskHits += 1;
                stats.diskHitFingerprint += 1;
                return { value: snap.value, cached: true, source: "disk" };
            }
            const latest = latestTimestamp({ symbol, exchange });
            if (sameBucket(latest, snap.rawLatest) || latest === snap.rawLatest) {
                stats.diskHits += 1;
                return { value: snap.value, cached: true, source: "disk" };
            }
            stats.diskStale += 1;
        }
    }

    const res = await run("tf", { symbol, tf, exchange, from, to }, { ttlMs: TTL_TF_MS, key, warm });

    if (TF_DISK_ENABLED) {
        const latest = latestTimestamp({ symbol, exchange });
        if (latest !== null) {
            const ok = diskCache.write(dkey, {
                value: res.value,
                rawLatest: latest,
                fingerprint: dbFingerprint(symbol),
            });
            if (ok) stats.diskWrites += 1;
        }
    }
    return res;
}

/** متادیتا (تازگی/پوشش/ونوها) با کش RAM بلندتر. */
function getMetadata({ symbol, exchange = null, tf = "1h" }) {
    const key = `meta|${String(symbol).toUpperCase()}|${exchange ?? "auto"}|${tf}`;
    return run("metadata", { symbol, exchange, tf }, { ttlMs: TTL_META_MS, key });
}

/** warmup در ورکر **جداگانهٔ** warmup (حلقهٔ HTTP آزاد می‌ماند — D23 · S4). */
function warmup(symbols) {
    return callWorker("warmup", { symbols });
}

/**
 * **S4-B — pre-warm:** ساخت و ذخیرهٔ روی دیسک برای تایم‌فریم‌های سنگین در بوت
 * (پیش‌فرض `1d,1w,1mo`). هر آیتم جداگانه try می‌شود ⇒ یک TF معیوب pre-warm کل
 * استارت را نمی‌شکند (fail-open). خروجی: گزارش صادقانهٔ هر TF.
 */
async function prewarm(symbols, tfs = PREWARM_TFS) {
    if (!PREWARM_ENABLED) return [];
    const out = [];
    for (const symbol of symbols) {
        for (const tf of tfs) {
            const started = Date.now();
            try {
                /**
                 * **روی ورکر warmup** (نه تعاملی) ⇒ pre-warm هرگز `/tf` کاربر را
                 * بلاک نمی‌کند (باگ واقعی: prewarm روی ورکر تعاملی ۳ ساخت
                 * ۵۶–۷۵ ثانیه‌ای اجرا کرد و `/tf 1h` را >۱۰۰s معطل گذاشت ✗).
                 */
                const res = await getTf({ symbol, tf, exchange: null, warm: true });
                stats.prewarmed += 1;
                out.push({ symbol, tf, ok: true, ms: Date.now() - started, source: res.source ?? "worker" });
            } catch (error) {
                out.push({ symbol, tf, ok: false, ms: Date.now() - started, error: String(error && error.message) });
            }
        }
    }
    return out;
}

/** شمارنده‌ها + وضعیت **هر دو** ورکر (برای `/health` و `/metadata`). */
function engineStats() {
    const interactive = slots.interactive;
    const warm = slots.warmup;
    return {
        ...stats,
        workerAlive: Boolean(interactive.worker),
        workerThreadId: interactive.worker ? interactive.worker.threadId : null,
        workerPending: interactive.pending.size,
        /** S4: ورکر warmup جدا ⇒ درخواست‌ها پشت اسکن صرافی نمی‌مانند */
        warmWorkerAlive: Boolean(warm.worker),
        warmWorkerThreadId: warm.worker ? warm.worker.threadId : null,
        warmWorkerPending: warm.pending.size,
        cacheSize: cache.size,
        inflight: inflight.size,
        inlineMode: process.env.HISTORICAL_INLINE === "1",
        ttlTfMs: TTL_TF_MS,
        ttlMetaMs: TTL_META_MS,
        cacheMax: CACHE_MAX,
        /** S4-B: کش دیسکی + pre-warm */
        tfDiskEnabled: TF_DISK_ENABLED,
        tfDiskTtlMs: TTL_TF_DISK_MS,
        tfDisk: diskCache.statsOf(),
        prewarmTfs: PREWARM_TFS,
    };
}

/**
 * **probe «آخرین کندل خام» + memo کوتاه (S4):**
 * ⚠️ اندازه‌گیری واقعی: `latestTimestampRaw(symbol, exchange=null)` روی ۴٫۷۸M ردیف
 *    **~۵۰ ثانیه** است ✗ (ادعای «O(log n)» فقط وقتی صادق است که ایندکس مناسب
 *    فیلتر را بپوشاند؛ برای `exchange=null` اسکن می‌شود). چون route در **هر**
 *    `/tf` (لنگر C1) و کش دیسکی (اعتبارسنجی) این عدد را می‌خواهد، بدون memo
 *    یک هزینهٔ پنهان ۵۰ ثانیه‌ای تکرار می‌شد ✗ ⇒ memo درون‌پروسه با TTL کوتاه.
 * (تغییر اسکیما/ایندکس روی store خام **ممنوع** است ⇒ راه‌حل لایه‌ای، نه DB.)
 */
const latestCache = new Map(); // key -> { at, value }
const LATEST_TTL_MS = Number(process.env.HISTORICAL_LATEST_TTL_MS || 60_000);

function latestTimestamp({ symbol, exchange = null }) {
    const key = `${String(symbol).toUpperCase()}|${exchange ?? "auto"}`;
    const hit = latestCache.get(key);
    const now = Date.now();
    if (hit && now - hit.at <= LATEST_TTL_MS) {
        stats.latestHits += 1;
        return hit.value;
    }
    /**
     * **S4 — sidecar کلکتور (O(1)):** اگر کلکتور بعد از آخرین تغییر فایل DB
     * مقدار تازه را نوشته باشد، همان‌جا خوانده می‌شود (بدون هیچ کوئری ✗ گران).
     * قاعدهٔ اعتبار: `dbMtimeMs` sidecar == mtime فعلی فایل DB ✓ (اگر نه ⇒ کهنه).
     */
    const side = readLatestSidecar(symbol);
    const value = side !== null ? side : latestTimestampRaw(symbol, exchange, DEFAULT_ROOT);
    if (side !== null) stats.latestSidecar += 1;
    else stats.latestMisses += 1;
    latestCache.set(key, { at: now, value });
    return value;
}

/** خواندن sidecar تازگی کلکتور با اعتبارسنجی mtime (O(1)). */
function readLatestSidecar(symbol) {
    try {
        const dir = path.dirname(resolveRaw1mPath(symbol, { rootDir: DEFAULT_ROOT }));
        const raw = fs.readFileSync(path.join(dir, "latest.json"), "utf8");
        const parsed = JSON.parse(raw);
        const st = fs.statSync(path.join(dir, "candles_1m.db"));
        if (Math.round(st.mtimeMs) !== Number(parsed.dbMtimeMs)) return null; // کهنه
        return Number.isFinite(Number(parsed.latest)) ? Number(parsed.latest) : null;
    } catch {
        return null;
    }
}

module.exports = {
    getTf,
    getMetadata,
    warmup,
    prewarm,
    run,
    callWorker,
    engineStats,
    latestTimestamp,
    TTL_TF_MS,
    TTL_META_MS,
    CACHE_MAX,
    CALL_TIMEOUT_MS,
    PREWARM_TFS,
};

