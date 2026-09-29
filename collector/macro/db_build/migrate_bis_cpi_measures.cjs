"use strict";
/**
 * ============================================================
 * P0 migration — split BIS::CPI into CPI_IDX (628) + CPI_YOY (771)
 * File: collector/macro/db_build/migrate_bis_cpi_measures.cjs
 * ============================================================
 * چرا این اسکریپت وجود دارد
 * -------------------------
 * فایل خام BIS `WS_LONG_CPI` برای هر (کشور، فرکانس) **دو سنجه** دارد که فقط
 * با `UNIT_MEASURE` تفکیک می‌شوند:
 *      628 -> "Index, 2010 = 100"                    (سطح شاخص)
 *      771 -> "Year-on-year changes, in per cent"    (نرخ سالانه)
 * لودر قدیمی هر دو را به `indicator = "CPI"` نگاشت می‌کرد، پس هر دو یک
 * `series_id` می‌ساختند (`BIS.<ISO2>.CPI.<FREQ>`) و قاعدهٔ staging
 * («first value wins per (series_id, date)») مقدار شاخص و نرخ را در یک سری
 * قاطی می‌کرد. شاهد: MACRO_DATA_INVENTORY.md §5.
 *
 * این اسکریپت **فقط همان یک دیتاست** را دوباره و به‌صورت پاک می‌نویسد:
 *      BIS.<ISO2>.CPI_IDX.<FREQ>   (628)
 *      BIS.<ISO2>.CPI_YOY.<FREQ>   (771)
 * و **هیچ چیزی را حذف یا بازنویسی نمی‌کند** — سری‌های قدیمی
 * `BIS.<ISO2>.CPI.<FREQ>` در دیتابیس خام دست‌نخورده باقی می‌مانند و فقط
 * دیگر توسط `core_db/build/build_core_db.cjs` انتخاب نمی‌شوند.
 *
 * اجرا (از داخل collector/macro):
 *      node db_build/migrate_bis_cpi_measures.cjs --dry-run   # فقط شبیه‌سازی
 *      node db_build/migrate_bis_cpi_measures.cjs             # اجرای واقعی
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");
const Database = require("better-sqlite3");
const {
  COUNTRY_COLS,
  isDateToken,
  toNumber,
  frequencyCode,
  normalizeDate,
  makeSeriesId,
  bisIndicator,
} = require("./normalize.cjs");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "db", "macro.db");
const CSV_PATH = path.join(
  ROOT, "offline", "bis", "WS_LONG_CPI_csv_col", "WS_LONG_CPI_csv_col.csv",
);
const DATASET_CODE = "WS_LONG_CPI";
const TODAY = new Date().toISOString().slice(0, 10);
const DRY_RUN = process.argv.includes("--dry-run");

function log(...a) {
  console.log("[migrate_bis_cpi]", ...a);
}

/** خواندن CSV و ساخت ردیف‌های (series_id, date, value) — با همان قواعد لودر. */
async function readMeasureRows() {
  const series = new Map(); // sid -> {series_id,dataset,country,indicator,frequency,unit}
  const observations = [];  // {series_id,date,value}
  const perMeasure = new Map(); // indicator -> count

  const parser = fs.createReadStream(CSV_PATH).pipe(parse({
    columns: true, skip_empty_lines: true, relax_column_count: true,
  }));

  for await (const row of parser) {
    let country = "";
    let freq = "";
    let unit = "";
    let unitMeasure = "";
    for (const k of Object.keys(row)) {
      if (isDateToken(k)) continue;
      const v = String(row[k] ?? "").trim();
      if (!v) continue;
      if (!country && COUNTRY_COLS.includes(k)) country = v;
      if (!freq && k === "FREQ") freq = v;
      if (!unit && k === "UNIT_MEASURE") { unit = v; unitMeasure = v; }
    }
    if (!country) continue;

    const f = frequencyCode(freq) || "U";
    const indicator = bisIndicator(DATASET_CODE, unitMeasure);
    const sid = makeSeriesId("BIS", country, indicator, f);

    if (!series.has(sid)) {
      series.set(sid, {
        series_id: sid, dataset: "BIS", country, indicator, frequency: f, unit, source: "BIS",
      });
    }
    perMeasure.set(indicator, (perMeasure.get(indicator) || 0) + 1);

    for (const k of Object.keys(row)) {
      if (!isDateToken(k)) continue;
      const value = toNumber(row[k]);
      if (value == null) continue;
      const date = normalizeDate(k, f);
      if (!date) continue;
      observations.push({ series_id: sid, date, value });
    }
  }
  return { series, observations, perMeasure };
}

/**
 * درج سری با همان قانون revision لودر (db_build/README.md):
 *   ۱) (series_id, date) جدید            → revision_id = 1, valid_to = NULL
 *   ۲) مقدار یکسان با نسخهٔ جاری          → نادیده
 *   ۳) مقدار متفاوت                       → نسخهٔ جاری بسته و revision+1
 */
function writeSeries(db, meta, observations) {
  const selCur = db.prepare(
    "SELECT value, revision_id FROM data WHERE series_id=? AND date=? AND valid_to IS NULL",
  );
  const insData = db.prepare(
    `INSERT INTO data(series_id, date, value, revision_id, valid_from, valid_to)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  );
  const closePrev = db.prepare(
    "UPDATE data SET valid_to=? WHERE series_id=? AND date=? AND valid_to IS NULL",
  );
  const insSeries = db.prepare(
    `INSERT OR IGNORE INTO series(series_id, dataset, country, indicator, frequency, unit, source)
     VALUES (@series_id, @dataset, @country, @indicator, @frequency, @unit, @source)`,
  );

  let inserted = 0;
  let revised = 0;
  let skipped = 0;

  insSeries.run(meta);
  for (const o of observations) {
    const cur = selCur.get(o.series_id, o.date);
    if (!cur) {
      insData.run(o.series_id, o.date, o.value, 1, TODAY);
      inserted++;
    } else if (Number(cur.value) === Number(o.value)) {
      skipped++;
    } else {
      closePrev.run(TODAY, o.series_id, o.date);
      insData.run(o.series_id, o.date, o.value, (cur.revision_id || 1) + 1, TODAY);
      revised++;
    }
  }
  return { inserted, revised, skipped };
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exitCode = 1;
    return;
  }
  log(`source : ${path.relative(ROOT, CSV_PATH)}`);
  log(`target : ${path.relative(ROOT, DB_PATH)}${DRY_RUN ? "   (DRY-RUN)" : ""}`);

  const { series, observations, perMeasure } = await readMeasureRows();
  log(`parsed rows by measure : ${JSON.stringify(Object.fromEntries(perMeasure))}`);
  log(`series to upsert       : ${series.size}`);
  log(`observations           : ${observations.length}`);

  // گروه‌بندی یک‌بارهٔ نقاط بر اساس series_id (به‌جای filter تکراری O(n²))
  const bySid = new Map();
  for (const o of observations) {
    let arr = bySid.get(o.series_id);
    if (!arr) { arr = []; bySid.set(o.series_id, arr); }
    arr.push(o);
  }

  const byKey = [...series.values()].reduce((acc, s) => {
    const k = `${s.indicator}/${s.frequency}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  log(`series by indicator/freq: ${JSON.stringify(byKey)}`);

  const db = new Database(DB_PATH); // read-write (the main DB is only *read* elsewhere)
  const before = {
    series: db.prepare("SELECT COUNT(*) c FROM series").get().c,
    data: db.prepare("SELECT COUNT(*) c FROM data").get().c,
  };

  // سری‌های قدیمیِ مخلوط که با این مهاجرت کنار گذاشته می‌شوند
  const legacy = db.prepare(
    "SELECT series_id, unit FROM series WHERE dataset='BIS' AND indicator='CPI' ORDER BY series_id",
  ).all();

  if (DRY_RUN) {
    log(`DRY-RUN — no write. series=${before.series} data=${before.data}`);
    log(`legacy mixed series (left untouched, excluded from core): ${legacy.length}`);
    db.close();
    return;
  }

  const totals = { inserted: 0, revised: 0, skipped: 0 };
  // synchronous=OFF: تراکنش ۱۰۵k درج را روی دیسک کند این میزبان عملی می‌کند.
  // journal_mode همان DELETE (rollback journal) می‌ماند ⇒ در صورت crash پروسه
  // (نه قطع برق) تراکنش به‌درستی برمی‌گردد.
  db.pragma("synchronous = OFF");
  let done = 0;
  const tx = db.transaction(() => {
    for (const meta of series.values()) {
      const obs = bySid.get(meta.series_id) || [];
      const r = writeSeries(db, meta, obs);
      totals.inserted += r.inserted;
      totals.revised += r.revised;
      totals.skipped += r.skipped;
      done++;
      if (done % 25 === 0) log(`  progress ${done}/${series.size} series · +${totals.inserted} obs`);
    }
  });
  tx();

  const after = {
    series: db.prepare("SELECT COUNT(*) c FROM series").get().c,
    data: db.prepare("SELECT COUNT(*) c FROM data").get().c,
  };

  log(`new observations : inserted=${totals.inserted} revised=${totals.revised} unchanged=${totals.skipped}`);
  log(`series  : ${before.series} → ${after.series}  (+${after.series - before.series})`);
  log(`data    : ${before.data} → ${after.data}  (+${after.data - before.data})`);
  log(`legacy mixed series left in main DB (excluded from core): ${legacy.length}`);
  log("sample legacy:", legacy.slice(0, 3).map((r) => r.series_id).join(", ") || "-");
  log("done ✅  → next: rebuild core.db (node core_db/build/build_core_db.cjs --fresh)");
  db.close();
}

main().catch((err) => {
  console.error("[migrate_bis_cpi] FAILED:", err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

