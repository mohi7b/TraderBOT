// Historical Server Layer — TF Disk Cache (S4-B · D22)
//
// چرا: ساخت تایم‌فریم سنگین (۱d/۱w/۱mo روی 4.15GB خام) در استارت سرد کند است و
// کش RAM با ری‌استارت پاک می‌شود. این ماژول یک **snapshot روی دیسک** نگه می‌دارد
// تا بعد از ری‌استارت (یا برای pre-warm) بدون بازسازی پاسخ داده شود.
//
// ⚠️ قواعد صادقانه (هم‌راستا با D6/A7):
//   · هر snapshot با `rawLatest` (خروجی `latestTimestampRaw`) ذخیره می‌شود؛ مصرف‌کننده
//     **فقط در صورت تساوی دقیق** با آخرین کندل خامِ همین لحظه آن را معتبر می‌داند
//     ⇒ هیچ داده‌ی کهنه/ساختگی سرو نمی‌شود (TTL فقط فیلتر ارزان است، نه مجوز).
//   · `version` برای نگهبان اسکیما؛ ساختار ناسازگار = miss (نه کرش).
//   · نوشتن **اتمی** (tmp + rename) تا فایل نیمه‌نوشته خوانده نشود.
const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = process.env.HISTORICAL_TF_DISK_DIR
    || path.join(__dirname, "..", "..", "api", ".cache", "tf");
const SCHEMA_VERSION = 1;
const TTL_MS = Number(process.env.HISTORICAL_TF_DISK_TTL_MS || 600_000); // ۱۰ دقیقه (فیلتر ارزان)

const stats = { hits: 0, misses: 0, writes: 0, stale: 0, invalid: 0, bytes: 0 };

function ensureDir() {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/** کلید فایل‌سیف از چهار مؤلفهٔ پنجره (بدون کاراکتر خطرناک). */
function keyOf({ symbol, tf, exchange = null, from = null, to = null }) {
    const safe = (v) => String(v ?? "any").replace(/[^A-Za-z0-9._-]/g, "_");
    return `${safe(symbol)}__${safe(tf)}__${safe(exchange)}__${safe(from)}__${safe(to)}`;
}

function fileOf(key) {
    return path.join(CACHE_DIR, `${key}.json`);
}

/**
 * خواندن snapshot.
 * @returns `{ value, rawLatest, builtAt } | null` — `null` یعنی miss (نبود/کهنه/ناسازگار)
 */
function read(key, ttlMs = TTL_MS) {
    const file = fileOf(key);
    let raw;
    try {
        raw = fs.readFileSync(file, "utf8");
    } catch {
        stats.misses += 1;
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        stats.invalid += 1;
        stats.misses += 1;
        return null;
    }
    if (!parsed || parsed.version !== SCHEMA_VERSION || !("value" in parsed)) {
        stats.invalid += 1;
        stats.misses += 1;
        return null;
    }
    if (Date.now() - Number(parsed.builtAt || 0) > ttlMs) {
        stats.stale += 1;
        stats.misses += 1;
        return null;
    }
    stats.hits += 1;
    stats.bytes = raw.length;
    return {
        value: parsed.value,
        rawLatest: parsed.rawLatest ?? null,
        /** S4: اثر انگشت DB (size+mtime) — اعتبارسنجی O(1) بدون کوئری گران */
        fingerprint: parsed.fingerprint ?? null,
        builtAt: parsed.builtAt,
    };
}

/** نوشتن snapshot به‌صورت **اتمی** (tmp + rename). */
function write(key, payload) {
    try {
        ensureDir();
        const file = fileOf(key);
        const tmp = `${file}.${process.pid}.tmp`;
        const body = JSON.stringify({
            version: SCHEMA_VERSION,
            builtAt: Date.now(),
            rawLatest: payload.rawLatest ?? null,
            /** S4: اثر انگشت DB در لحظهٔ ساخت (اعتبارسنجی O(1) در خواندن) */
            fingerprint: payload.fingerprint ?? null,
            value: payload.value,
        });
        fs.writeFileSync(tmp, body);
        fs.renameSync(tmp, file);
        stats.writes += 1;
        stats.bytes = body.length;
        return true;
    } catch (error) {
        /** دیسک پر/بی‌مجوز ⇒ کش خاموش می‌ماند، سرویس سالم است (fail-open) */
        console.warn(`[tf-disk-cache] write failed: ${error && error.message}`);
        return false;
    }
}

function statsOf() {
    return { ...stats, dir: CACHE_DIR, ttlMs: TTL_MS, schema: SCHEMA_VERSION };
}

module.exports = { keyOf, read, write, statsOf, CACHE_DIR, TTL_MS, SCHEMA_VERSION };
