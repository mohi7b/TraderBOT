"use strict";
/**
 * ============================================================
 * Country meta reader — inflation targets (MAIN DB: macro.db)
 * File: collector/macro/backend/core/country_meta.cjs
 * ============================================================
 * تنها منبع رسمی «هدف تورمی» جدول inflation_targets در macro.db است.
 * (core.db فقط series/data/sources دارد و با هر rebuild پاک می‌شود؛
 *  پس هدف باید در MAIN DB بماند.)
 *
 * API:
 *   getTarget(countryIso)  -> { country, low, high, note } | null
 *   listTargets()          -> [ ... ]
 * ============================================================
 */
const path = require("path");
const Database = require("better-sqlite3");

const MAIN_DB_PATH = path.join(__dirname, "..", "..", "db", "macro.db");

let db = null;
function open() {
  if (!db) {
    db = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
  }
  return db;
}

let hasTable = null;
function tableExists(d) {
  if (hasTable !== null) return hasTable;
  try {
    const row = d
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='inflation_targets'",
      )
      .get();
    hasTable = !!row;
  } catch {
    hasTable = false;
  }
  return hasTable;
}

/** هدف تورمی یک کشور (ISO3 یا هر کدی که در جدول هست). */
function getTarget(countryIso) {
  if (!countryIso) return null;
  const d = open();
  if (!tableExists(d)) return null;
  const key = String(countryIso).toUpperCase();
  const row = d
    .prepare(
      "SELECT country, low, high, note FROM inflation_targets WHERE country = ?",
    )
    .get(key);
  return row ?? null;
}

/** همهٔ اهداف (برای درفت/دیباگ). */
function listTargets() {
  const d = open();
  if (!tableExists(d)) return [];
  return d
    .prepare(
      "SELECT country, low, high, note FROM inflation_targets ORDER BY country",
    )
    .all();
}

module.exports = { getTarget, listTargets, MAIN_DB_PATH };
