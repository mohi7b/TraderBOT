// P5/گام ۲ — انبار «جریان taker» (جدایی کامل از انبار خام ✗)
//
//   crypto/<SYMBOL>/flow_1m.db     ← پایگاه دادهٔ **تازه و مستقل** ✓
//   جدول: taker_flow(symbol, exchange, timestamp_raw, taker_buy_base, taker_sell_base, trades)
//
// ⚠️ قواعد صادقانه/امنیتی:
//   · انبار خام ۴٫۳۶GB (`candles_1m.db`) **هرگز تغییر نمی‌کند** ✗ — این ماژول فقط
//     روی فایل خودش می‌نویسد ✓ (کلید اصلی ⇒ upsert ✓ بدون تکرار ✓).
//   · هیچ عدد ساختگی ✗ — اگر داده نباشد، `null` برمی‌گردد ✓.
const fs = require("node:fs");
const path = require("node:path");
const Database = require(path.join(__dirname, "..", "..", "..", "..", "node_modules", "better-sqlite3"));
const { resolveRaw1mPath } = require("./merge-into-1m-db.cjs");
const { DEFAULT_ROOT } = require("../_engine/root.cjs");

/** مسیر انبار جریان (کنار DB خام همان نماد · نام فایل متفاوت ✓) */
function resolveFlowPath(symbol, { rootDir = DEFAULT_ROOT } = {}) {
    return resolveRaw1mPath(symbol, { rootDir }).replace(/candles_1m\.db$/, "flow_1m.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS taker_flow (
  symbol           TEXT    NOT NULL,
  exchange         TEXT    NOT NULL,
  timestamp_raw    INTEGER NOT NULL,
  taker_buy_base   REAL    NOT NULL,
  taker_sell_base  REAL    NOT NULL,
  trades           INTEGER,
  PRIMARY KEY (symbol, exchange, timestamp_raw)
);
CREATE INDEX IF NOT EXISTS idx_taker_flow_ex_ts ON taker_flow (exchange, timestamp_raw);
-- P5/۳: سنجه‌های مقطعی صرافی (funding/openInterest) — فقط فیوچرز ✓
CREATE TABLE IF NOT EXISTS flow_metrics (
  symbol           TEXT    NOT NULL,
  exchange         TEXT    NOT NULL,
  kind             TEXT    NOT NULL,   -- 'funding' | 'openInterest'
  timestamp_raw    INTEGER NOT NULL,
  value            REAL    NOT NULL,
  PRIMARY KEY (symbol, exchange, kind, timestamp_raw)
);
`;

function openFlowDatabase(symbol, { rootDir = DEFAULT_ROOT, readonly = false } = {}) {
    const file = resolveFlowPath(symbol, { rootDir });
    if (!readonly) fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file, readonly ? { readonly: true, fileMustExist: true } : {});
    if (!readonly) {
        db.pragma("journal_mode = WAL");
        db.exec(SCHEMA);
    }
    return db;
}

/** درج/به‌روزرسانی (upsert) — idempotent ✓ */
function upsertFlow(db, rows) {
    if (!rows.length) return 0;
    const stmt = db.prepare(
        `INSERT INTO taker_flow (symbol, exchange, timestamp_raw, taker_buy_base, taker_sell_base, trades)
         VALUES (@symbol, @exchange, @timestamp_raw, @taker_buy_base, @taker_sell_base, @trades)
         ON CONFLICT(symbol, exchange, timestamp_raw) DO UPDATE SET
           taker_buy_base = excluded.taker_buy_base,
           taker_sell_base = excluded.taker_sell_base,
           trades = excluded.trades`,
    );
    const tx = db.transaction((list) => {
        let n = 0;
        for (const r of list) n += stmt.run(r).changes;
        return n;
    });
    return tx(rows);
}

/** آخرین دقیقهٔ ذخیره‌شده (برای resume ✓) */
function lastFlowTimestamp(symbol, exchange, { rootDir = DEFAULT_ROOT } = {}) {
    try {
        const db = openFlowDatabase(symbol, { rootDir, readonly: true });
        const row = db
            .prepare("SELECT MAX(timestamp_raw) AS t FROM taker_flow WHERE symbol = ? AND exchange = ?")
            .get(symbol, exchange);
        db.close();
        return row && Number.isInteger(row.t) ? row.t : null;
    } catch {
        return null; // انبار نبود ⇒ از صفر (هیچ ساختگی ✗)
    }
}

/** خواندن بازهٔ جریان (برای CVD در `/flow` ✓) */
function readFlowRange(symbol, exchange, from, to, { rootDir = DEFAULT_ROOT } = {}) {
    try {
        const db = openFlowDatabase(symbol, { rootDir, readonly: true });
        const rows = db
            .prepare(
                `SELECT timestamp_raw, taker_buy_base, taker_sell_base, trades
                   FROM taker_flow
                  WHERE symbol = ? AND exchange = ? AND timestamp_raw >= ? AND timestamp_raw <= ?
                  ORDER BY timestamp_raw`,
            )
            .all(symbol, exchange, from, to);
        db.close();
        return rows;
    } catch {
        return [];
    }
}

/** درج/به‌روزرسانی سنجه‌های مقطعی (funding/openInterest) — idempotent ✓ */
function upsertMetrics(db, rows) {
    if (!rows.length) return 0;
    const stmt = db.prepare(
        `INSERT INTO flow_metrics (symbol, exchange, kind, timestamp_raw, value)
         VALUES (@symbol, @exchange, @kind, @timestamp_raw, @value)
         ON CONFLICT(symbol, exchange, kind, timestamp_raw) DO UPDATE SET value = excluded.value`,
    );
    const tx = db.transaction((list) => {
        let n = 0;
        for (const r of list) n += stmt.run(r).changes;
        return n;
    });
    return tx(rows);
}

/** آخرین مقدار هر سنجه (funding → نرخ جاری ✓ · openInterest → آخرین snapshot ✓) */
function readLatestMetrics(symbol, exchange, { rootDir = DEFAULT_ROOT } = {}) {
    try {
        const db = openFlowDatabase(symbol, { rootDir, readonly: true });
        const rows = db
            .prepare(
                `SELECT kind, value, timestamp_raw FROM flow_metrics m
                  WHERE symbol = ? AND exchange = ?
                    AND timestamp_raw = (SELECT MAX(timestamp_raw) FROM flow_metrics x
                                          WHERE x.symbol = m.symbol AND x.exchange = m.exchange AND x.kind = m.kind)`,
            )
            .all(symbol, exchange);
        db.close();
        const out = {};
        for (const r of rows) out[r.kind] = { value: r.value, timestamp: r.timestamp_raw };
        return out;
    } catch {
        return {}; // انبار نبود ⇒ خالی ✓ (هیچ ساختگی ✗)
    }
}

module.exports = { resolveFlowPath, openFlowDatabase, upsertFlow, lastFlowTimestamp, readFlowRange, upsertMetrics, readLatestMetrics, SCHEMA };
