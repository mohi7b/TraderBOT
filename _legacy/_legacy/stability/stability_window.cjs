/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/stability/stability_window.cjs
 * Description:
 *   Stability Window Manager
 *   Handles:
 *     - Closing previous macro value window
 *     - Opening new macro value window
 *     - Calculating duration
 *     - Ensuring no duplicate records
 *   Fully CJS and compatible with db_adapter.cjs
 * Author: Mohsen + Copilot
 * ============================================================
 */

const dayMs = 1000 * 60 * 60 * 24;

/**
 * updateStabilityWindow()
 * ------------------------------------------------------------
 * این تابع مقدار قبلی را می‌بندد و مقدار جدید را باز می‌کند.
 *
 * ورودی‌ها:
 *   db           → آداپتور دیتابیس (db_adapter.cjs)
 *   tableName    → نام جدول پارکت (مثلاً macro_core)
 *   country      → کشور (مثلاً USA)
 *   variable     → متغیر (مثلاً CPI)
 *   newValue     → مقدار جدید
 *   releaseTime  → زمان انتشار مقدار جدید (UTC)
 *   meta         → متادیتا (category, unit, frequency, ...)
 *
 * خروجی:
 *   رکورد جدیدی که در دیتابیس ذخیره شده است
 * ------------------------------------------------------------
 */
async function updateStabilityWindow(db, tableName, country, variable, newValue, releaseTime, meta = {}) {

  // 1) آخرین مقدار قبلی را پیدا کن
  const previous = await db.findLast(tableName, country, variable);

  // 2) اگر مقدار قبلی وجود دارد → بازهٔ ثبات آن را ببند
  if (previous) {
    previous.macro_value_end_time_utc = releaseTime;

    previous.macro_value_duration_days =
      (new Date(releaseTime) - new Date(previous.macro_value_start_time_utc)) / dayMs;

    previous.macro_value_is_active = false;

    await db.update(tableName, previous);
  }

  // 3) رکورد جدید را بساز
  const newRecord = {
    country,
    variable,
    value: newValue,

    // Stability Window
    macro_value_start_time_utc: releaseTime,
    macro_value_end_time_utc: null,
    macro_value_duration_days: null,
    macro_value_is_active: true,

    // Metadata
    category: meta.category || null,
    sub_category: meta.sub_category || null,
    frequency: meta.frequency || null,
    unit: meta.unit || null,
    source_primary: meta.source_primary || null,
    source_secondary: meta.source_secondary || null,
    release_lag_days: meta.release_lag_days || null,

    // Standard fields
    date: releaseTime.split("T")[0],
    quality_flag: "official",
    revision_flag: "unknown",
    last_updated: new Date().toISOString()
  };

  // 4) رکورد جدید را ذخیره کن
  await db.insert(tableName, newRecord);

  return newRecord;
}

module.exports = {
  updateStabilityWindow
};
