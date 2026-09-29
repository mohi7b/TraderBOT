/**
 * بررسی سلامت macro.db پس از یک تراکنش ناتمام (hot journal).
 * اجرا: node db_build/_verify_macro_db.cjs
 * - با باز کردن read-write، SQLite تراکنش ناتمام را rollback می‌کند.
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "db", "macro.db");
const JOURNAL = DB_PATH + "-journal";

console.log("journal exists before open:", fs.existsSync(JOURNAL),
  fs.existsSync(JOURNAL) ? `(${fs.statSync(JOURNAL).size} bytes)` : "");

const db = new Database(DB_PATH); // read-write ⇒ triggers rollback of a hot journal
console.log("journal_mode      :", db.pragma("journal_mode", { simple: true }));
console.log("journal exists now:", fs.existsSync(JOURNAL));

const counts = {
  series: db.prepare("SELECT COUNT(*) c FROM series").get().c,
  data: db.prepare("SELECT COUNT(*) c FROM data").get().c,
  data_current: db.prepare("SELECT COUNT(*) c FROM data WHERE valid_to IS NULL").get().c,
};
console.log("counts:", counts);

// آیا سری‌های جدید مهاجرت (نیمه‌کاره) درج شده‌اند؟
const migrated = db.prepare(
  "SELECT indicator, frequency, COUNT(*) c FROM series WHERE dataset='BIS' AND indicator IN ('CPI_IDX','CPI_YOY') GROUP BY indicator, frequency",
).all();
console.log("migrated series present:", migrated.length ? migrated : "NONE (transaction rolled back)");

// نقطه‌کنترل‌ها: مقدار آخر سری‌های شناخته‌شده باید دست‌نخورده باشد
for (const sid of ["BIS.US.CPI.M", "BIS.AU.CPI.M", "BIS.DE.CPI.M"]) {
  const row = db.prepare(
    "SELECT date, value FROM data WHERE series_id=? AND valid_to IS NULL ORDER BY date DESC LIMIT 1",
  ).get(sid);
  const n = db.prepare("SELECT COUNT(*) c FROM data WHERE series_id=? AND valid_to IS NULL").get(sid).c;
  console.log(`  ${sid}: n=${n} last=${row ? row.date + "=" + row.value : "-"}`);
}

console.log("quick_check:", db.pragma("quick_check", { simple: true }));
db.close();
console.log("verify done");
