# Candle Storage Engine — 1m candles in monthly Parquet

This folder turns the downloader's per-symbol SQLite (`candles_1m.db`, one row per
minute per venue) into files a columnar reader can scan:

```
<root>/crypto/<exchange>/<SYMBOL>/1m/<YYYY-MM>.parquet      # root = <repo>/data/historical
    crypto/binance_spot/BTCUSDT/1m/2017-10.parquet
    crypto/okx_futures/ETHUSDT/1m/2025-01.parquet
```

`<exchange>` is the downloader's own key — `<venue>_<spot|futures>` — so a spot file
and a futures file can never be confused for one another.

## Three promises the engine enforces

| promise | how |
| --- | --- |
| **A file holds exactly its month.** | A row whose timestamp is outside the month it is written to is *refused* (with a reason), never silently filed away. |
| **A write is atomic.** | Rows go to a `.tmp-<pid>-<month>.parquet` and are renamed only after the Parquet footer is closed: a reader sees the old file or the new one, never half a month. |
| **A number is a number or null.** | Prices must be positive, `high >= low` and `open`/`close` inside the range; a missing `volume`/`quoteVolume`/`trades` stays `null`, never `0`. |

Rewriting a month *replaces* it (a month file is the truth, not a merge of every past
write), and an empty month is not a file at all.

## Commands

```bash
cd <repo>

# See what is in one database, without writing anything
node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --exchange okx_spot --dry-run --limit 3

# Migrate one month of one venue
node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --exchange okx_spot --month 2025-01

# Migrate one whole dataset (a venue's spot or futures series)
node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --exchange binance_spot

# Migrate everything in the file (all 10 venue keys) — this is the long one
node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT

# The same, resumable: months already on disk are left exactly as they are
node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --skip-existing
```

Flags: `--db <file>` (default `<repo>/collector/crypto/historical/crypto/<SYMBOL>/candles_1m.db`),
`--symbol`, `--exchange`, `--month`, `--root`, `--compression SNAPPY|GZIP|UNCOMPRESSED`,
`--limit <n>` (months, for a first look), `--dry-run`, `--skip-existing` (a month that is
already on disk is not rewritten), `--strict` (refuse the whole month instead of reporting
the bad rows).

Re-running is safe: the same rows produce the same file, byte for byte.

## Programmatic use

```js
const { openStore } = require("./collector/crypto/historical/storage/candle-store.cjs");
const { openCandleSource } = require("./collector/crypto/historical/storage/sqlite-candle-source.cjs");

const store = openStore({});                                  // root = data/historical
const candles = await store.readMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01" });
const window  = await store.readRange({ exchange: "binance_spot", symbol: "BTCUSDT", from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
const summary = store.stats("binance_spot", "BTCUSDT");       // months, bytes, first/last
```

`openCandleSource` is read-only and answers one month at a time
(`datasets()`, `boundsOf()`, `months()`, `countMonth()`, `readMonth()`), so a 4.3 GB
database never has to fit in memory. Both `datasets()` and `months()` use the
`(symbol, exchange, timestamp_raw)` primary key when they are given both halves of the
key — and `months()` *verifies* every month in the range with an indexed count, so a
month that was never collected stays absent instead of being interpolated.

## Measured on the real BTCUSDT database (4.3 GB, 37M rows, 2017→2026)

The whole symbol, migrated once (10 datasets, 840 collected months):

```
[compact] binance_futures/BTCUSDT: 85 months, 3,707,188 rows read, 85 files, 149.1 MB, 0 refused
[compact] binance_spot/BTCUSDT:   107 months, 4,673,493 rows read, 107 files, 199.8 MB, 0 refused
[compact] bitget_futures/BTCUSDT:  87 months, 3,777,053 rows read,  87 files, 126.3 MB, 37,204 refused
[compact] bitget_spot/BTCUSDT:     99 months, 4,270,400 rows read,  99 files, 156.4 MB, 0 refused
[compact] bybit_futures/BTCUSDT:   79 months, 3,420,071 rows read,  79 files,  91.0 MB, 0 refused
[compact] bybit_spot/BTCUSDT:      63 months, 2,747,507 rows read,  63 files,  88.8 MB, 0 refused
[compact] kucoin_futures/BTCUSDT:  22 months,   949,797 rows read,  22 files,  33.4 MB, 0 refused
[compact] kucoin_spot/BTCUSDT:    108 months, 4,438,462 rows read, 108 files, 173.1 MB, 0 refused
[compact] okx_futures/BTCUSDT:     82 months, 3,553,465 rows read,  82 files, 124.4 MB, 0 refused
[compact] okx_spot/BTCUSDT:       105 months, 4,519,050 rows read, 105 files, 172.4 MB, 0 refused
[compact] done in 1,124,170 ms: 836 files, 1.28 GB, 37204 refused rows
```

That is **840 of 840 collected months on disk (1.29 GB), 18.7 minutes end to end**, i.e.
~1.3 s per month and ~0.03 s per 1,000 rows — on one core, with the database being read
month by month (`--skip-existing` was what made the run resumable; it left the four files
of earlier single-month runs alone).

Single-month spot checks, read back through the Parquet store and compared row by row with
SQLite (sha256 over `timestamp|open|high|low|close|volume|quoteVolume|trades`):

```
binance_spot  2017-08: 21,360 sqlite rows = 21,360 parquet rows   identical   (first, partial month)
binance_spot  2026-09: 36,266         = 36,266                   identical   (newest month)
okx_spot      2025-01: 44,491         = 44,491                   identical
kucoin_futures 2024-12: 44,494        = 44,494                   identical
bybit_spot    2021-07: 37,161         = 37,161                   identical
bitget_futures 2020-11: 42,912        ≠ 40,687                   as promised (see below)
```

### Reading it back is cheap, too

Parquet month files, read through `store.readMonth()` on this machine:

```
binance_spot/2017-08: 21,360 rows in 291 ms   (73 rows/ms)
binance_spot/2025-01: 44,640 rows in 235 ms   (190 rows/ms)
binance_spot/2026-09: 36,266 rows in 186 ms   (195 rows/ms)
binance_spot 2025 (12 months, 525,600 rows): 2.1 s via readRange()
```

So a year of one-minute candles for one venue is a two-second read, and
`readRange()` walks month by month, so memory stays bounded by one month.

### The one honest difference: 37,204 refused rows

Every refusal comes from **bitget_futures**, and every one of them is the same defect:
`open` outside the bar's own `high`/`low` range (or a close outside it). Counted straight
from the database:

```sql
select count(*) from candles_1m
 where exchange = 'bitget_futures'
   and (open > high or open < low or close > high or close < low);
-- 37,204 of 3,777,053 rows (0.98%) — 2,225 of them in 2020-11 alone
```

The store refuses them (with the reason on stdout, one line per row) instead of writing a
bar that could never have happened — which is exactly why the whole-symbol count is
37,204 refused rows and not 37,204 quietly repaired ones. A caller who wants that data
anyway can read it from SQLite; a caller who wants a trustworthy archive gets the Parquet
files.

## Tests

```bash
node --test collector/crypto/historical/storage/test/
```

Twelve tests, offline: the layout contract, month isolation, atomic/rewriting writes,
null honesty, GZIP round-trip, the SQLite column mapping, gap detection, the command's
flags, and the resumable `--skip-existing` path — all against a real (small) SQLite file
built with better-sqlite3.
