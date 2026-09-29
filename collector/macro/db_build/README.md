# Macro DB Builder (offline)

Builds the consolidated macro database directly from the 6 offline CSV
folders:

| dataset   | source folder            | input format                          |
|-----------|--------------------------|---------------------------------------|
| BIS       | `offline/bis/`           | BIS wide CSVs (dims + date columns)   |
| IMF       | `offline/imf/`           | `ISO3,...,Year,Value` (annual)        |
| WB        | `offline/worldbank/`     | `WDICSV.csv` (wide years, annual)     |
| OECD      | `offline/oecd/`          | tidy `REF_AREA,INDICATOR,...`         |
| FRED      | `offline/fred/`          | tidy `REF_AREA,INDICATOR,...`         |
| EUROSTAT  | `offline/eurostat/`      | tidy `REF_AREA,INDICATOR,...`         |

## Usage

```bash
node collector/macro/db_build/main_offline_loader.cjs            # build / update
node collector/macro/db_build/main_offline_loader.cjs --fresh    # rebuild from scratch
node collector/macro/db_build/main_offline_loader.cjs --vacuum   # also VACUUM (slow, needs 2x disk)
node collector/macro/db_build/main_offline_loader.cjs --only=OECD        # one dataset only
node collector/macro/db_build/main_offline_loader.cjs --max-files=2      # limit files per source (testing)
```

Output: `collector/macro/db/macro.db`

## Schema (3 tables)

```sql
series(series_id TEXT PRIMARY KEY, dataset, country, indicator, frequency, unit, source)
data  (series_id, date, value REAL, revision_id INT, valid_from, valid_to)
sources(source_id TEXT PRIMARY KEY, name, url, update_frequency, last_update)
```

Indexes: `idx_series_id` on `data(series_id)`, `idx_date` on `data(date)`,
plus an extra composite `idx_data_series_date(series_id, date)`.

## series_id

```
<dataset>.<country>.<indicator>.<frequency>
```

e.g. `BIS.US.CREDIT.M`, `IMF.IRN.NGDPD.A`, `OECD.DEU.CPI_YOY.M`,
`FRED.USA.M2SL.M`, `EUROSTAT.FRA.HICP_ANR.M`, `WB.USA.NY.GDP.MKTP.CD.A`.

Frequency letters: `M` monthly, `Q` quarterly, `A` annual, `D` daily, `W` weekly.

Notes:
- Eurostat 2-letter `REF_AREA` codes are mapped to ISO3 (`BE` → `BEL`).
- BIS uses its own 2-letter country codes (`US`, `GB`, `JP`, ...).
- The indicator for each BIS `WS_*` dataset is a short readable code
  (`WS_CBS_PUB` → `CREDIT`, `WS_DSR` → `DEBT_SERVICE_RATIO`, ...).
  Because a BIS dataset collapses many sub-series into one series_id,
  per-observation "first value wins" applies (staging de-duplication).

## BIS measure-aware loading (P0 fix — 2026-09-19)

Some BIS datasets hold **more than one measure per (country, frequency)** inside
the same `*_csv_col` dump; the only discriminator is the `UNIT_MEASURE` column.

`WS_LONG_CPI` is the critical case:

| UNIT_MEASURE | label | indicator |
|---|---|---|
| `628` | Index, 2010 = 100 | **CPI_IDX** (kind: index) |
| `771` | Year-on-year changes, in per cent | **CPI_YOY** (kind: rate) |

Before this fix every row was mapped to indicator `CPI`, so both measures
produced the **same** `series_id` (`BIS.<ISO2>.CPI.<FREQ>`) and the staging
de-dup (*first value wins per (series_id, date)*) mixed index levels with YoY
rates — the stored value type then depended on the **row order inside the CSV**
(`BIS.US.CPI.M` started as an index in 1913 and continued as a rate from 1914).
See `MACRO_DATA_INVENTORY.md` §5.

Now:
- `normalize.cjs` exports `BIS_MEASURE_INDICATORS` + `bisIndicator(datasetCode, unitMeasure)`
- `main_offline_loader.cjs` resolves the indicator **per row** ⇒
  `BIS.US.CPI_IDX.M` and `BIS.US.CPI_YOY.M` are separate series.
- `core_db/build/build_core_db.cjs` selects `BIS: ["CPI_IDX","CPI_YOY"]`.
- `backend/catalog/registry.cjs` classifies them as `index` / `rate`.

### Migrating an existing DB (no full rebuild)

```bash
cd collector/macro
node db_build/migrate_bis_cpi_measures.cjs --dry-run   # simulate, write nothing
node db_build/migrate_bis_cpi_measures.cjs             # write the 252 new series
node core_db/build/build_core_db.cjs --fresh          # rebuild the curated DB
# then restart the API (registry/picker changes are read at boot):
node backend/boot.cjs
```

The migration only touches `WS_LONG_CPI`; it **never deletes** anything. The 126
legacy `BIS.*.CPI.*` series stay in the main DB and are simply no longer selected
by the core build.

## Revision / time-validity rules

On every load (`INSERT OR IGNORE` semantics):

1. A brand-new `(series_id, date)` is inserted with `revision_id = 1`,
   `valid_from = today`, `valid_to = NULL`.
2. A re-published value identical to the current one is ignored (idempotent).
3. A changed value closes the previous version
   (`UPDATE data SET valid_to = today WHERE valid_to IS NULL ...`) and inserts
   a new revision with `revision_id + 1`, `valid_from = today`, `valid_to = NULL`.

So `valid_to IS NULL` always identifies the current value, and the full
revision history is preserved.

## Performance notes

The loader is built for low-RAM hosts (streams CSVs row by row) and slow
disks (bulk `.import` into SQLite, in-RAM journal, indexes created after the
merge, hash-join merge instead of correlated subqueries).
