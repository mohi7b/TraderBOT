"use strict";
/**
 * ============================================================
 * Seed inflation_targets  →  collector/macro/db/macro.db
 * File: collector/macro/db/seed_targets.cjs
 * ============================================================
 * هدف تورمی بانک مرکزی هر کشور را در MAIN DB (macro.db) ذخیره می‌کند.
 * این جدول idempotent است (CREATE IF NOT EXISTS + INSERT OR REPLACE) و
 * هرگز توسط build_core_db.cjs دست‌کاری نمی‌شود (builder فقط
 * series/data/sources را می‌سازد).
 *
 * اجرا:
 *   node collector/macro/db/seed_targets.cjs
 *
 * ستون‌ها:
 *   country  TEXT (ISO3) PRIMARY KEY
 *   low      REAL NULL
 *   high     REAL NULL
 *   note     TEXT NULL
 * ============================================================
 */
const path = require("path");
const Database = require("better-sqlite3");

const MAIN_DB_PATH = path.join(__dirname, "..", "db", "macro.db");

// جدول هدف: { iso3: [low, high, note] }
// (طبق سند chart02 بخش ۲ — گسترش برای هر کشورِ core بدون تغییر کد)
const TARGETS = {
  USA: [2, 2, "Federal Reserve"],
  EUR: [2, 2, "ECB"],
  DEU: [2, 2, "ECB"],
  FRA: [2, 2, "ECB"],
  ITA: [2, 2, "ECB"],
  ESP: [2, 2, "ECB"],
  GBR: [2, 2, "Bank of England"],
  CAN: [2, 2, "Bank of Canada"],
  JPN: [2, 2, "Bank of Japan"],
  KOR: [2, 2, "Bank of Korea"],
  SWE: [2, 2, "Riksbank"],
  NOR: [2, 2, "Norges Bank"],
  CHE: [0, 2, "Swiss National Bank"],
  AUS: [2, 3, "Reserve Bank of Australia"],
  NZL: [1, 3, "Reserve Bank of New Zealand"],
  IND: [2, 6, "Reserve Bank of India"],
  BRA: [3, 3, "Banco Central do Brasil"],
  CHN: [null, null, "PBoC (no official point target)"],
};

function main() {
  const db = new Database(MAIN_DB_PATH, { fileMustExist: true });
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS inflation_targets (
      country TEXT PRIMARY KEY,   -- ISO3
      low     REAL NULL,
      high    REAL NULL,
      note    TEXT NULL
    );
  `);

  const upsert = db.prepare(
    `INSERT INTO inflation_targets (country, low, high, note)
     VALUES (@country, @low, @high, @note)
     ON CONFLICT(country) DO UPDATE SET
       low = excluded.low,
       high = excluded.high,
       note = excluded.note`,
  );

  const tx = db.transaction((rows) => {
    for (const [country, [low, high, note]] of rows) {
      upsert.run({ country, low, high, note });
    }
  });

  tx(Object.entries(TARGETS));

  const n = db
    .prepare("SELECT COUNT(*) AS n FROM inflation_targets")
    .get().n;
  const sample = db
    .prepare(
      "SELECT country, low, high FROM inflation_targets ORDER BY country LIMIT 5",
    )
    .all();

  console.log(`[seed_targets] macro.db => ${MAIN_DB_PATH}`);
  console.log(`[seed_targets] inflation_targets rows = ${n}`);
  console.log(`[seed_targets] sample:`, sample);
  db.close();
}

main();
