# Macro Core DB

A lightweight, secondary database derived from the main macro database
(`collector/macro/db/macro.db`) for fast reads by the **Query Engine** and
**Chart Engine**.

| | |
|---|---|
| **Source** | `collector/macro/db/macro.db` (read-only, never modified) |
| **Output** | `collector/macro/core_db/core.db` |
| **Rows kept** | only Tier 1 + Tier 2 countries × 20 canonical macro indicators × M/Q/A frequencies |
| **Schema** | identical 3-table layout: `series`, `data`, `sources` |

---

## Folder layout

```
collector/macro/core_db/
├── build/
│   ├── build_core_db.cjs        # build script (better-sqlite3, prepared statements)
│   ├── package.json             # build dependency (better-sqlite3)
│   ├── node_modules/            # installed by `npm install` (build-time only)
│   └── filters/
│       ├── countries.json       # Tier 1 + Tier 2 (ISO3) — 17 countries
│       ├── indicators.json      # canonical macro indicators (20) — POLICY_RATE · YIELD_10Y · GDP_GROWTH · MARKET_GLOBAL …
│       └── frequencies.json     # M | Q | A
├── logs/                        # build logs (core_build_<timestamp>.log)
├── core.db                      # the generated core database
└── README.md
```

## Usage

```bash
cd collector/macro/core_db/build
npm install                        # once — installs better-sqlite3

node build_core_db.cjs             # build core.db (rebuilt if already present)
node build_core_db.cjs --fresh     # explicit rebuild
node build_core_db.cjs --count-only  # dry run: report matching counts, write nothing
```

The build logs go to `collector/macro/core_db/logs/core_build_<timestamp>.log`
and are also printed to the console.

## Filters

- **countries.json** — Tier 1 + Tier 2 (ISO3): `USA, CHN, JPN, DEU, GBR, FRA,
  ITA, CAN, AUS, KOR, IND, TUR, MEX, BRA, RUS, SAU, ZAF`.
  BIS stores countries as 2-letter codes, so the build translates them
  (`USA→US`, `DEU→DE`, …) via `COUNTRY_ALIAS` inside the build script.
- **indicators.json** — `GDP, CPI, CORE_CPI, PPI, UNEMP, EMP, M1, M2, PMI,
  CLI, IND_PROD, EXPORT, IMPORT`. Each canonical indicator maps to the exact
  provider codes stored in the main DB via `INDICATOR_MAP` in the build script
  (e.g. `GDP → OECD: GDP_YOY / FRED: GDP, GDPC1 / WB: NY.GDP.* / …`).
- **frequencies.json** — `M, Q, A`. Daily/weekly (`D/W`) and any other
  frequencies are excluded.

## Schema (identical to the main DB)

```sql
series(series_id TEXT PRIMARY KEY, dataset, country, indicator, frequency, unit, source)
data  (series_id, date, value REAL, revision_id, valid_from, valid_to)
sources(source_id TEXT PRIMARY KEY, name, url, update_frequency, last_update)
```

Full revision history is preserved for every selected series
(`valid_to IS NULL` = current value). Indexes:

```sql
idx_series_id          ON data(series_id)
idx_date               ON data(date)
idx_data_series_date   ON data(series_id, date)
idx_series_lookup      ON series(dataset, country, indicator, frequency)
```

## Safety rules

- The main DB is opened **read-only** (`better-sqlite3 { readonly: true }`)
  and is verified before/after the build (row counts are logged) — nothing is
  ever deleted, rewritten or vacuumed.
- All row access uses **prepared statements** with bound parameters
  (`better-sqlite3`).
- **No `LIKE` is used at all** — matching uses exact per-dataset
  `IN (...)` lists built from the JSON filters (no leading-`%` wildcard scans).
- Indexes are created **after** the data load (single pass, no index
  maintenance during the copy).
- The copy is memory-bounded (per-series reads via the main DB's
  `idx_series_id` index, batched transactions).

## Expected size

Initial estimate was **~1.0–1.3 GB**, but the strict
17-country × 13-indicator × M/Q/A filter keeps only a small slice of the
12M-row source table — the real output is far smaller (tens of MB), which is
exactly what makes the Query/Chart Engines **5–10× faster**: a fully indexed
DB that fits in page cache.

## Notes / limitations

- **PMI** has no matching series in the current main DB (no provider publishes
  it yet) — the code is kept in the filter list for future datasets.
- If you need more series, widen `INDICATOR_MAP` (build script) or the filter
  JSON files, then rebuild — the main DB is never touched.

### Documented filter exception (`FILTER_EXCEPTIONS`)

`verifyFilters()` accepts a small, explicit allowlist of series that are
**intentionally** copied although they are not in `filters/*.json`:

| dataset | country | indicator | why |
|---|---|---|---|
| `BIS` | `XM` | `POLICY_RATE` | ECB policy rate for the euro area. BIS stopped the national DEU/FRA/ITA policy-rate series in **1998-12** and publishes the ECB rate under `XM` afterwards. `XM` is **not** added to `countries.json` on purpose (it would break the "17 countries" list everywhere) — the copy block + this allowlist keep the two in sync. |

Each accepted entry is printed in the build log as
`filter exception (documented): …` so the build never silently passes.

### Quarterly GDP growth (`GDP_GROWTH`, 2026-09-22)

- Dedicated canon so the **quarterly** growth series are not mixed with the annual
  IMF/WB GDP-level series under the generic `GDP` canon (which made the growth
  chart pick annual levels/forecasts and lose the quarterly line).
- Sources: OECD `GDP_VPV_YOY` (YoY %) · `GDP_VPV_QOQ` (QoQ %) · `GDP_YOY` ·
  Eurostat `GDP_CLV_PCH_SM` (QoQ %, SA) · FRED `GDPC1` (real GDP **level**, USA).
- `kind = percent` for the OECD/Eurostat codes (`SERIES_KIND_EXPLICIT`), `index`
  for `FRED::GDPC1` ⇒ no double YoY transform; the frontend derives whatever is
  missing (level ⇒ YoY/QoQ, QoQ chain ⇒ level) inside `lib/macro/growth.ts`.
- Coverage: quarters exist for **all 17** countries, but usable history (≥ 8
  points **and** last quarter within 6 quarters) exists for ~11; `CAN/GBR/KOR/SAU`
  have 1 point and `MEX`/`RUS` stopped years ago ⇒ the chart shows its empty state
  and the signals fall back to `—` (never a stale number).
- ⚠️ `GDP_GROWTH` is intentionally **not** in `DEFAULT_FRESH_CANONS`: the growth
  chart needs *both* the YoY and QoQ series of the same country, and the
  one-series-per-canon dedupe would drop one of them.

### Global market series (`MARKET_GLOBAL`, 2026-09-23)

- Feeds the **Financial Conditions** chart (FAS): `VIXCLS` (vol) ·
  `DTWEXBGS` (broad USD) · `SP500` (equity) · `BAMLC0A0CM` (IG credit spread OAS) ·
  `M2SL` (liquidity, US M2).
- ⚠️ **None of these are country series** — they are global/US benchmarks and are
  read for every country (the series' own country is `USA`). The chart labels
  them as global in its tooltips and meta row.
- ⚠️ FRED publishes them **daily**, and core.db only copies `M/Q/A`
  (`frequencies.json`) ⇒ the offline downloader aggregates them to **monthly**
  (last observation of each month, `aggregate: "monthly"`). Without that step no
  row would reach the charts (verified: 0 rows copied).
- `kind`: `percent` for the spread, `index` for DXY/SP500/M2, `level` for VIX
  (`SERIES_KIND_EXPLICIT`) ⇒ no accidental YoY transform.
- Coverage: all five series are complete and fresh (last month ≤ 1 month old);
  the frontend still applies a 6-month staleness guard per input.

### 10-year bond yields (`YIELD_10Y`, 2026-09-22)

- Source: **FRED** (`IRLTLT01{ISO2}M156N` = OECD re-publication + `DGS10` for
  the US). Downloaded by `offline/fred/download_fred_offline.cjs`
  (`metric: "long_term_rate"`), loaded by `--only=FRED`.
- Coverage: **12 of 17** countries (AUS · CAN · DEU · FRA · IND · ITA · JPN ·
  KOR · MEX · USA · ZAF (+RUS stale)); **BRA · CHN · SAU · TUR** have no series
  on FRED (404) ⇒ no rows here on purpose (no fabricated values).
- `kind = rate` (`SERIES_KIND_EXPLICIT["FRED::YIELD_10Y"]`) ⇒ raw % values,
  never a YoY transform.
- **RUS** rows exist but end at `2018-06`; the frontend `latestOfCanon()` has an
  **18-month staleness guard** so stale yields are never shown as "today".
