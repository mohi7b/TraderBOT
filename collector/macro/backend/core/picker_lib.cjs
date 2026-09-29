"use strict";

/**
 * ============================================================
 * Macro Backend — Professional Series Picker (core library)
 * File: collector/macro/backend/core/picker_lib.cjs
 * ============================================================
 * "dataset + pattern" picker over core.db producing a professional,
 * dashboard-ready Bloomberg-style payload.
 *
 * Pipeline per group:
 *   1) canonical indicators  -> real provider codes  (INDICATOR_MAP)
 *   2) filter candidate series per dataset (core.db)
 *   3) balanced round-robin so each dataset is represented (max 10)
 *   4) normalize country -> ISO3 (registry), attach country/indicator/
 *      dataset metadata
 *   5) compute history { full (5y) , display (3y) }, mom/yoy/trend/risk
 *   6) summarize the group
 *
 * Output shape (per group):
 *   {
 *     group, meta, summary,
 *     series: [ { id, dataset, country, indicator, unit, frequency,
 *                 latest, trend, risk_flags, history:{full,display} } ]
 *   }
 *
 * Core DB layout (identical to macro.db):
 *   series: series_id | dataset | country | indicator | frequency | unit | source
 *   data:   series_id | date | value | revision_id | valid_from | valid_to
 *   current = valid_to IS NULL
 * ============================================================
 */
"use strict";

const path = require("path");

// Authoritative map owned by the core_db builder (single source of truth).
const { INDICATOR_MAP, DATASETS } = require(path.join(
  __dirname, "..", "..", "core_db", "build", "build_core_db.cjs"
));

const registry = require(path.join(__dirname, "..", "catalog", "registry.cjs"));
// P4 (2026-09-20): بریدگی‌های شناخته‌شدهٔ منبع (منتشرنشده) — برای شفافیت API
const KNOWN_GAPS = require(path.join(__dirname, "..", "catalog", "known_gaps.cjs"));
const computeTrend = require(path.join(__dirname, "..", "processors", "trend.cjs"));
const buildRiskFlags = require(path.join(__dirname, "..", "processors", "risk.cjs"));
const buildGroupSummary = require(path.join(__dirname, "..", "processors", "summary.cjs"));

// seriesProfile() -> registry-derive meaningful unit + series kind.
// minPointsFor()  -> per-frequency min history needed before we pick a
//                    series (a single-print series is useless on trends).
const { seriesProfile, minPointsFor } = registry;

const Database = require("better-sqlite3");
const CORE_DB_PATH = path.join(__dirname, "..", "..", "core_db", "core.db");

/** professional cap for the curated series in one group  */
const MAX_SERIES = 12;

/**
 * P5 (2026-09-20) — canonicalهایی که باید «یک نماینده به‌ازای هر کشور» داشته
 * باشند (تازه‌ترین برنده). دلیل: برای CORE_CPI چند provider با تاریخ‌های
 * بسیار متفاوت وجود دارد (OECD/FRED/EUROSTAT/DERIVED) و payload پر از
 * تکرارهای کهنه می‌شد؛ سری‌های DERIVED تازه هم به‌خاطر سقف جا نمی‌ماندند.
 */
// ⚠️ `GDP_GROWTH` عمداً این‌جا **نیست**: چارت رشد به **هر دو** سری YoY و QoQ
// همان کشور نیاز دارد و dedupe «یک سری تازه به‌ازای هر canon» یکی را حذف می‌کرد.
const DEFAULT_FRESH_CANONS = ["CORE_CPI", "POLICY_RATE", "YIELD_10Y"];

/**
 * P2 (2026-09-20) — اولویت «کیفیت منبع» برای سری Core.
 * ترتیب مورد توافق کاربر:
 *     Eurostat HICP-ANR (هستهٔ رسمی YoY)  >  FRED core  >  OECD _TXCP01_NRG
 * و در انتها DERIVED (محاسباتی — فقط وقتی منبع رسمی تازه وجود ندارد).
 * ⚠️ کیفیت **در باند تازگی** اعمال می‌شود (پایین): یک منبع باکیفیتِ کهنه
 *    نباید جای منبع تازه را بگیرد (وگرنه اصلاح P1/P5 باطل می‌شد).
 */
const SOURCE_QUALITY_RULES = [
  {
    rank: 0,
    label: "Eurostat HICP-ANR (official core YoY)",
    test: (ds, ind) => ds === "EUROSTAT" && ind.startsWith("HICP_ANR"),
  },
  { rank: 1, label: "Eurostat HICP (core index)", test: (ds) => ds === "EUROSTAT" },
  { rank: 2, label: "FRED official core", test: (ds) => ds === "FRED" },
  {
    rank: 3,
    label: "OECD all-items-ex-food-energy",
    test: (ds, ind) => ds === "OECD" && ind === "CPI_IDX_TXCP01_NRG",
  },
  { rank: 9, label: "DERIVED (computed in core_db build)", test: (ds) => ds === "DERIVED" },
];
const DEFAULT_QUALITY_RANK = 5;

/** حداکثر عقب‌ماندگی مجاز (ماه) برای اینکه کیفیت منبع بر تازگی مقدم شود. */
const QUALITY_FRESHNESS_BAND_MONTHS = 3;

function qualityRankOf(dataset, indicator) {
  for (const r of SOURCE_QUALITY_RULES) {
    if (r.test(dataset, String(indicator || ""))) return r.rank;
  }
  return DEFAULT_QUALITY_RANK;
}

function qualityLabelOf(dataset, indicator) {
  for (const r of SOURCE_QUALITY_RULES) {
    if (r.test(dataset, String(indicator || ""))) return r.label;
  }
  return null;
}

// Display window length (per frequency) — "3 years on dashboards".
const DISPLAY_POINTS = { M: 36, Q: 12, A: 3, W: 156, D: 900 };

// Full-history window (years) fetched per series for trend/vol/risk AND for
// the min-points gate. Kept generous so annual backfill (e.g. OWID CPI from
// 1960) is preserved rather than truncated to the last few prints.
// core.db is small (~13 MB) so a wide window is cheap.
const HISTORY_YEARS = 30;

class Picker {
  /**
   * @param {boolean} [lazy=false] - if true the core.db connection
   *   is opened lazily on first query. Kept simple (attach now).
   */
  constructor() {
    this.db = new Database(CORE_DB_PATH, { readonly: true, fileMustExist: true });
    this.close = () => { if (this.db && this.db.open) this.db.close(); };

    // latest published date among current versions
    this.stmtLatest = this.db.prepare(
      `SELECT MAX(date) AS date FROM data WHERE series_id = ? AND valid_to IS NULL`
    );
    // value of the current version at that exact date
    this.stmtVal = this.db.prepare(
      `SELECT value FROM data
        WHERE series_id = ? AND date = ? AND valid_to IS NULL
        ORDER BY revision_id DESC LIMIT 1`
    );
    // valid current history for the full window (HISTORY_YEARS back)
    this.stmtHistory = this.db.prepare(
      `SELECT date, value FROM data
        WHERE series_id = ? AND valid_to IS NULL
          AND date >= date('now','-${HISTORY_YEARS} years')
        ORDER BY date ASC`
    );
    // count of valid points within the full window (used to gate picks)
    this.stmtHistCount = this.db.prepare(
      `SELECT COUNT(*) AS c FROM data
        WHERE series_id = ? AND valid_to IS NULL
          AND date >= date('now','-${HISTORY_YEARS} years')`
    );
  }

  // ---- SQL "IN (...)" helper --------------------------------------
  _qs(n) {
    return Array.from({ length: n }, () => "?").join(",");
  }

  // ---- canonical -> provider codes (per dataset) -------------------
  _codesForDataset(dataset, canons) {
    const out = [];
    const seen = new Set();
    for (const canon of canons) {
      const m = INDICATOR_MAP[canon] && INDICATOR_MAP[canon][dataset];
      if (!Array.isArray(m)) continue;
      for (const c of m) {
        if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    }
    return out;
  }

  // ---- mapping raw provider code -> canonical key -----------------
  _canonOfCode(dataset, code, canonsSet) {
    for (const canon of canonsSet) {
      const arr = INDICATOR_MAP[canon] && INDICATOR_MAP[canon][dataset];
      if (Array.isArray(arr) && arr.includes(code)) return canon;
    }
    return null;
  }

  // ---- رتبهٔ ماه یک تاریخ (ماه/فصل/ششماهه/سال) -------------------
  _monthIndex(date) {
    const s = String(date || "");
    let m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m) return Number(m[1]) * 12 + Number(m[2]);
    m = /^(\d{4})-Q([1-4])$/i.exec(s);
    if (m) return Number(m[1]) * 12 + Number(m[2]) * 3;
    m = /^(\d{4})-S([1-2])$/i.exec(s);
    if (m) return Number(m[1]) * 12 + Number(m[2]) * 6;
    m = /^(\d{4})$/.exec(s);
    if (m) return Number(m[1]) * 12 + 12;
    return null;
  }

  // ---- P3: کادنس واقعی سری (تشخیص دادهٔ «پله‌ای») -----------------
  /**
   * بعضی منابع دادهٔ فصلی را روی کلیدهای **ماهانه** تکرار می‌کنند
   * (شاهد 2026-09-20: `BIS.AU.CPI_IDX.M` → مقدار هر ۳ ماه یک‌بار تغییر
   *  می‌کند: flat ratio ≈ 0.73). این تابع:
   *   · نسبت ماه‌های «تخت» را در ۲۴ نقطهٔ آخر می‌سنجد
   *   · کادنس مؤثر را برمی‌گرداند تا (الف) برچسب فرکانس در چارت درست باشد
   *     و (ب) فرانت‌اند بتواند سری را به دوره‌های واقعی تجمیع کند.
   * @returns {{declared:string, effective:string, padded:boolean, flat_ratio:number}}
   */
  _cadenceOf(seriesId, declared) {
    const base = { declared, effective: declared, padded: false, flat_ratio: 0 };
    if (declared !== "M") return base;
    const rows = this.stmtHistory.all(seriesId).slice(-24);
    if (rows.length < 8) return base;
    let flat = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(Number(rows[i].value) - Number(rows[i - 1].value)) < 1e-9) flat++;
    }
    const ratio = flat / (rows.length - 1);
    const padded = ratio >= 0.45;
    return {
      declared,
      effective: padded ? "Q" : declared,
      padded,
      flat_ratio: Number(ratio.toFixed(3)),
    };
  }

  // ---- fetch viable candidate series for one dataset ---------------
  _candidatesOfDataset(dataset, codes, canonsSet) {
    if (codes.length === 0) return [];
    const sql = `SELECT series_id, dataset, country, indicator, frequency, unit, source
                   FROM series WHERE dataset = ? AND indicator IN (${this._qs(codes.length)})`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(dataset, ...codes);
    const out = [];
    for (const s of rows) {
      const last = this.stmtLatest.get(s.series_id);
      if (!last || !last.date) continue;                 // nothing published
      const v = this.stmtVal.get(s.series_id, last.date);
      if (!v) continue;
      const value = Number(v.value);
      if (!Number.isFinite(value)) continue;             // dirty / unusable
      // (B) need enough valid history before we promise a chart series
      if (this.stmtHistCount.get(s.series_id).c < minPointsFor(s.frequency)) continue;
      out.push({
        ...s,
        date: last.date,
        value,
        canon: this._canonOfCode(s.dataset, s.indicator, canonsSet),
        cadence: this._cadenceOf(s.series_id, s.frequency),
        // P2: رتبهٔ کیفیت منبع (۰ = بهتر) برای ترجیح درون باند تازگی
        quality_rank: qualityRankOf(s.dataset, s.indicator),
        quality_label: qualityLabelOf(s.dataset, s.indicator),
      });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }

  // ---- balanced round-robin across datasets ------------------------
  /**
   * Fair-share, dataset-fair, canonical-aware selection.
   *
   * RULE (source fair-share):
   *   In every pass, each eligible source (dataset) takes EXACTLY ONE
   *   series. No source may take a second series until every eligible
   *   source has taken its first. Remaining capacity after the first
   *   full pass is filled in a second pass by priority/freshness order.
   *
   * Consequences:
   *   - head-of-queue sources can't starve the budget;
   *   - tail sources (e.g. OWID) are never dropped;
   *   - selection is predictable and source priority is meaningful.
   *
   * The caller MUST pass a cap >= number of eligible sources so the
   * first fair pass is always fully consumed.
   *
   * @param {Array} buckets   - [{ ds, items }] per-dataset candidates
   * @param {string[]} canons - canonical order for within-pass spread
   * @param {number} cap      - max series to choose (>= buckets.length)
   */
  _canonBalanced(buckets, canons, cap = MAX_SERIES) {
    // one mutable queue per dataset (preserve DATASETS priority order)
    const queues = buckets.map((b) => ({ ds: b.ds, q: b.items.slice() }));
    const chosen = [];

    const takeFromDataset = (bucket, takenCanons) => {
      if (bucket.q.length === 0) return null;
      // prefer a canonical not yet taken this pass, else fall back to head
      let idx = bucket.q.findIndex((c) => !takenCanons.has(c.canon));
      if (idx < 0) idx = 0;
      return bucket.q.splice(idx, 1)[0];
    };

    // ---- pass 1 (and beyond): one series per eligible source ----
    while (chosen.length < cap) {
      const takenCanons = new Set(chosen.map((c) => c.canon));
      let tookThisPass = 0;

      for (const bucket of queues) {
        if (chosen.length >= cap) break;
        const picked = takeFromDataset(bucket, takenCanons);
        if (!picked) continue;
        chosen.push(picked);
        takenCanons.add(picked.canon);
        tookThisPass++;
      }

      if (tookThisPass === 0) break; // no source has anything left
    }

    return chosen;
  }

  // ---- country-first selection (chart-per-country) -----------------
  /**
   * COUNTRY-FAIR selection: every priority country gets ONE series first,
   * then remaining capacity is filled by the existing source-fair logic.
   *
   * Rationale (chart-per-country requirement):
   *   The dashboard needs a CPI chart for EVERY major country, not just
   *   for whichever 12 series a dataset-first round-robin happens to hit.
   *   So we invert the fairness axis: country breadth first, source
   *   diversity second.
   *
   * @param {Array} buckets   - [{ ds, items }] per-dataset candidates
   *                          (already priority-ordered by DATASETS)
   * @param {number} cap      - max series to choose
   * @returns {{chosen: Array, covered: string[]}}
   */
  _countryBalanced(buckets, cap) {
    const chosen = [];
    const chosenIds = new Set();             // series_id already picked
    const usedCanonsPerCountry = new Map();  // iso3 -> Set(canon)
    const covered = new Set();               // countries that already got one

    // Flatten candidate pool once, preserving dataset priority (DATASETS order)
    // then freshness within a dataset (items are newest-first).
    const pool = [];
    for (const b of buckets) {
      for (const item of b.items) {
        const iso = registry.toISO3(item.country, item.dataset);
        pool.push({ ...item, iso3: iso });
      }
    }

    // ---- PASS 1: one headline-ish series per country --------------
    // For each country (in first-appearance order = dataset priority),
    // take its best (highest-priority) candidate.
    for (const cand of pool) {
      if (chosen.length >= cap) break;
      if (covered.has(cand.iso3)) continue;
      chosen.push(cand);
      chosenIds.add(cand.series_id);
      covered.add(cand.iso3);
      const s = usedCanonsPerCountry.get(cand.iso3) || new Set();
      s.add(cand.canon);
      usedCanonsPerCountry.set(cand.iso3, s);
    }

    // ---- PASS 2: fill the rest with country+canon diversity -------
    for (const cand of pool) {
      if (chosen.length >= cap) break;
      if (chosenIds.has(cand.series_id)) continue;
      const used = usedCanonsPerCountry.get(cand.iso3) || new Set();
      // prefer a different indicator for the same country (e.g. Core/PPI)
      if (used.has(cand.canon)) continue;
      chosen.push(cand);
      chosenIds.add(cand.series_id);
      used.add(cand.canon);
      usedCanonsPerCountry.set(cand.iso3, used);
    }

    // ---- PASS 3: last resort — any remaining candidate ------------
    for (const cand of pool) {
      if (chosen.length >= cap) break;
      if (chosenIds.has(cand.series_id)) continue;
      chosen.push(cand);
      chosenIds.add(cand.series_id);
    }

    return { chosen, covered: Array.from(covered) };
  }

  // ---- cadence-aware "one period ago" label -------------------------
  _stepBack(dateStr, freq) {
    const mRe = /^(\d{4})-(\d{2})$/;
    const qRe = /^(\d{4})-Q([1-4])$/;
    const yRe = /^(\d{4})$/;
    if (freq === "M" && mRe.test(dateStr)) {
      const [, year, month] = mRe.exec(dateStr);
      return `${Number(year) - 1}-${month}`;
    }
    if (freq === "Q" && qRe.test(dateStr)) {
      const m = qRe.exec(dateStr);
      return `${Number(m[1]) - 1}-Q${m[2]}`;
    }
    if (freq === "A" && yRe.test(dateStr)) {
      return String(Number(dateStr) - 1);
    }
    return null;
  }

  // ---- enrich one raw candidate into full professional series -------
  _enrich(s) {
    const history = this.stmtHistory.all(s.series_id); // full 5y window
    const stats = computeTrend(history);
    const canon = s.canon || s.indicator;
    // unit/kind are resolved up-front so mom/yoy can be computed per-kind
    const profile = seriesProfile(s.dataset, s.indicator, canon);
    const isIndex = profile.kind === "index";
    // mom/yoy are *percentage* changes for an index series AND for an
    // absolute "level" series (nominal / volume) so they stay comparable
    // across datasets; only rate / percent series (whose stored values are
    // already in %) carry a change-in-rate diff as mom/yoy.
    const usePct = isIndex || profile.kind === "level";
    const pct = (a, b) =>
      Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) > 1e-12
        ? (a - b) / Math.abs(b) * 100
        : null;

    // MoM for *index* series is a proper percentage change.
    // For *rate* series (whose values already carry the unit, e.g. YoY %)
    // the one-step print difference is kept (it reads as change-in-rate);
    // annual series have a meaningless MoM (previous print == a-year-ago
    // print already reported via YoY) so it stays null.
    let mom = null;
    let prevValue = null;
    if (history.length >= 2 && s.frequency !== "A") {
      const prev = history[history.length - 2];
      prevValue = Number(prev.value);
      mom = usePct
        ? pct(s.value, prevValue)
        : (Number.isFinite(s.value - prevValue)
            ? Number((s.value - prevValue).toFixed(4))
            : null);
    }

    // YoY: same period one year earlier (cadence-aware).
    // For index series -> % change; for rate series -> change-in-rate.
    let yoy = null;
    const back = this._stepBack(s.date, s.frequency);
    if (back !== null) {
      for (let h = history.length - 2; h >= 0; h--) {
        if (history[h].date === back) {
          const base = Number(history[h].value);
          yoy = usePct
            ? pct(s.value, base)
            : (Number.isFinite(s.value - base)
                ? Number((s.value - base).toFixed(4))
                : null);
          break;
        }
      }
    }

    const risk = buildRiskFlags(stats, {
      lastValue: Number(s.value),
      prevValue,
    });

    const displayLen = DISPLAY_POINTS[s.frequency] || Math.min(36, history.length);
    const display = history.length <= displayLen ? history : history.slice(-displayLen);

    const iso3 = registry.toISO3(s.country, s.dataset);
    // (P2) Country contract per spec: { code: ISO3, name: English }.
    const _cm = registry.countryMeta(iso3);
    const country = { code: _cm.code, name: _cm.name_en };
    const indicator = registry.indicatorMeta(canon);
    const dataset = registry.datasetMeta(s.dataset);
    // (A) `unit` / `series_kind` come from the catalog (computed above);
    //     the raw core `series.unit` column is NOT trusted (BIS CPI held a
    //     stray integer like "771").

    // ⭐ id must be unique per PROVIDER series, not per canonical: one
    // canonical can carry several provider codes for the same country and
    // frequency (BIS CPI_IDX vs CPI_YOY, WB NY.GDP.MKTP.CD vs NY.GDP.MKTP.KD …).
    // Using `indicator.code` alone produced duplicate ids in the payload.
    const providerCode = String(s.indicator || canon);
    const id = `${s.dataset}_${iso3}_${providerCode.replace(/[^A-Za-z0-9]+/g, "_")}${s.frequency ? "_" + s.frequency : ""}`;

    return {
      id,
      series_id: s.series_id,
      dataset: s.dataset,
      dataset_meta: dataset,
      country,
      // `code` stays canonical (frontend contract: pickSeries("CPI")),
      // `provider_code` exposes the real provider code (CPI_IDX / CPI_YOY …).
      indicator: { ...indicator, provider_code: providerCode },
      unit: profile.display_unit || indicator.unit_hint || s.unit || null,
      series_kind: profile.kind,               // index | rate | percent | level
      unit_origin: profile.origin,
      // ⭐ P1: متن کامل واحد از core.db (`series.unit`) هم فرستاده می‌شود.
      // چرا: سری‌های محاسباتی DERIVED روش ساختشان را در همین ستون حمل می‌کنند
      //   مثال: "% (derived: trimmed-mean YoY of 12 COICOP divisions, tau=2)"
      // و فرانت‌اند برای شفافیت «رسمی در برابر محاسباتی» به آن نیاز دارد.
      unit_raw: s.unit || null,
      frequency: s.frequency,
      // P3: کادنس واقعی (مثلاً BIS استرالیا «ماهانه» اعلام می‌شود ولی فصلی است)
      cadence: s.cadence || this._cadenceOf(s.series_id, s.frequency),
      // P2: رتبهٔ کیفیت منبع (۰ = بهتر) + برچسب خوانا — برای شفافیت در UI
      quality_rank:
        s.quality_rank ?? qualityRankOf(s.dataset, s.indicator),
      quality_label: s.quality_label ?? qualityLabelOf(s.dataset, s.indicator),
      source: s.source || null,
      latest: { date: s.date, value: Number(s.value), mom, yoy },
      trend: {
        direction: stats.direction,
        strength: stats.strength,
        momentum: stats.momentum != null ? Number(stats.momentum.toFixed(4)) : null,
        volatility: stats.volatility != null ? Number(stats.volatility.toFixed(4)) : null,
        slope_3m: stats.slope_3m,
        slope_6m: stats.slope_6m,
        slope_12m: stats.slope_12m,
      },
      risk_flags: {
        // (P2) spec contract — three booleans.
        high_volatility: risk.high_volatility,
        sharp_reversal: risk.sharp_reversal,
        // abnormal_momentum = vol_spike: latest |step| > 2.5x window vol.
        abnormal_momentum: risk.vol_spike,
        // Rich detail kept after the spec contract (dashboard extras).
        vol_spike: risk.vol_spike,
        near_peak: risk.near_peak,
        near_trough: risk.near_trough,
        has_risk: risk.has_risk,
        notes: risk.notes,
      },
      history: {
        full: history.map((r) => ({ date: r.date, value: Number(r.value) })),
        display: display.map((r) => ({ date: r.date, value: Number(r.value) })),
      },
    };
  }

  /**
   * buildGroup({ group, canons, theme? }) -> professional dashboard payload.
   * @param {string} group  - group key (e.g. "1A_inflation")
   * @param {string[]} canons - canonical indicators (CPI, CORE_CPI, PPI)
   */
  buildGroup(group, canons, opts = {}) {
    const canonSet = new Set(canons);
    const buckets = [];
    let available = 0;
    for (const ds of DATASETS) {
      const codes = this._codesForDataset(ds, canons);
      if (codes.length === 0) continue;
      const items = this._candidatesOfDataset(ds, codes, canonSet);
      if (items.length === 0) continue;
      available += items.length;
      buckets.push({ ds, items });
    }

    // RULE (source fair-share): the cap must be >= the number of eligible
    // sources so every source always gets its first-series share.
    const maxConfigured = Number.isFinite(opts.limit) ? opts.limit : MAX_SERIES;
    const baseCap = Math.max(maxConfigured, buckets.length);

    // ---- P5 + P2: یک نمایندهٔ «تازه‌تر/باکیفیت‌تر» per (کشور، canonical) ----
    // قواعد (به ترتیب):
    //   ۱) تازگی فراتر از باند (۳ ماه) همیشه برنده است ⇒ اصلاح P1 حفظ می‌شود
    //   ۲) داخل باند: کیفیت منبع (Eurostat HICP-ANR > FRED > OECD TXCP01 > DERIVED)
    //   ۳) سپس تازه‌تر · ۴) رسمی مقدم بر مشتق · ۵) ترتیب DATASETS
    const dedupeCanons = new Set(opts.freshPerCanon ?? DEFAULT_FRESH_CANONS);
    if (dedupeCanons.size > 0 && !opts.keepDuplicates) {
      const best = new Map();
      const band = QUALITY_FRESHNESS_BAND_MONTHS;
      const isBetter = (a, b) => {
        if (!b) return true;
        const ma = this._monthIndex(a.date);
        const mb = this._monthIndex(b.date);
        if (ma !== null && mb !== null) {
          // تازگی فراتر از باند: «تازه» همیشه برنده است (کیفیت بی‌اثر می‌شود)
          if (ma - mb > band) return true; // a بسیار تازه‌تر
          if (mb - ma > band) return false; // b بسیار تازه‌تر
        } else {
          const da = String(a.date);
          const db = String(b.date);
          if (da !== db) return da > db;
        }
        const qa = a.quality_rank ?? qualityRankOf(a.dataset, a.indicator);
        const qb = b.quality_rank ?? qualityRankOf(b.dataset, b.indicator);
        if (qa !== qb) return qa < qb;
        if (ma !== null && mb !== null && ma !== mb) return ma > mb;
        const ra = a.dataset === "DERIVED" ? 1 : 0;
        const rb = b.dataset === "DERIVED" ? 1 : 0;
        if (ra !== rb) return ra < rb;
        return DATASETS.indexOf(a.dataset) < DATASETS.indexOf(b.dataset);
      };
      for (const b of buckets) {
        for (const it of b.items) {
          if (!dedupeCanons.has(it.canon)) continue;
          const key = `${registry.toISO3(it.country, b.ds)}|${it.canon}`;
          if (isBetter(it, best.get(key))) best.set(key, it);
        }
      }
      const winners = new Set(best.values());
      for (const b of buckets) {
        b.items = b.items.filter((it) => !dedupeCanons.has(it.canon) || winners.has(it));
      }
    }

    // Selection strategy:
    //   opts.mode === "countries" -> country-first (one series per country),
    //       cap raised to at least the number of priority countries so the
    //       dashboard can chart EVERY major country. (chart-per-country)
    //   default                    -> source-fair round-robin (legacy).
    let chosen;
    let countriesCovered = null;
    if (opts.mode === "countries") {
      // Count distinct ISO3 countries available in the candidate pool so the
      // cap can cover all of them (plus room for a Core/PPI per country).
      const distinctCountries = new Set();
      for (const b of buckets) {
        for (const it of b.items) distinctCountries.add(registry.toISO3(it.country, b.ds));
      }
      const nCountries = distinctCountries.size;
      // cap = base + one extra per country (allows a 2nd indicator each),
      // bounded so we don't explode the payload.
      const cap = Math.max(baseCap, Math.min(nCountries * 2, baseCap + nCountries));
      const res = this._countryBalanced(buckets, cap);
      chosen = res.chosen;
      countriesCovered = res.covered;
    } else {
      chosen = this._canonBalanced(buckets, canons, baseCap);
    }

    const series = chosen.map((s) => this._enrich(s));
    const summary = buildGroupSummary(series);

    return {
      group,
      meta: {
        title: opts.title || group,
        canonical_indicators: canons,
        max_series: chosen.length,
        eligible_sources: buckets.length,
        mode: opts.mode || "sources",
        countries_covered: countriesCovered ?? summary?.coverage?.countries ?? null,
        // P4: بریدگی‌های شناخته‌شدهٔ منبع برای canonicalهای همین گروه
        // (مثال: CPI آمریکا 2025-10 منتشر نشد) — فرانت‌اند آن را روی چارت
        // به‌صورت نشانگر عمودی + برچسب رسم می‌کند (بدون پر کردن ساختگی).
        known_gaps: KNOWN_GAPS.filter((g) => canons.includes(g.canon)),
        generated_at: new Date().toISOString(),
      },
      summary,
      available,
      series_count: series.length,
      series,
    };
  }
}

// ------------------------------------------------------------------
// module-level convenience (one shared read-only connection lifecycle)
// ------------------------------------------------------------------
const picker = new Picker();

function buildGroup(group, canons, opts) {
  try {
    return picker.buildGroup(group, canons, opts);
  } finally {
    // connection stays open for repeated calls (readonly). The API
    // server keeps one process; a single open handle is fine.
  }
}

module.exports = {
  buildGroup,
  Picker,
  MAX_SERIES,
  DISPLAY_POINTS,
  DATASETS,
};
