# Macro Query Engine

> **Phase 1 — Scaffolding only.** This module contains the folder structure,
> empty function skeletons (stubs) and design documentation. **No executable
> logic, no database connection.** Implementation starts in Phase 2.

The Macro Query Engine is the query layer on top of the consolidated macro
database (`collector/macro/db/macro.db`). It lets callers ask for macro series
(e.g. CPI, GDP, credit, money supply) with a simple query string, a target
frequency and a time range, and returns a normalized, aligned result table.

---

## Directory Structure

```
collector/macro/query/
├── engine/
│   ├── query_engine.cjs        # Public entry point — orchestrates the pipeline
│   ├── query_executor.cjs      # Runs parsed queries against the macro DB
│   ├── frequency_converter.cjs # Resamples series between frequencies
│   └── merger.cjs              # Aligns & merges multiple series on a date axis
├── parser/
│   └── query_parser.cjs        # Converts raw query string → structured query object
├── utils/
│   ├── date_utils.cjs          # Date normalization & period math
│   ├── frequency_utils.cjs     # Frequency normalization & validation
│   └── validation_utils.cjs    # Query / series / range / frequency validation
├── tests/
│   ├── parser.test.cjs         # Tests for the parser
│   ├── executor.test.cjs       # Tests for the executor
│   ├── converter.test.cjs      # Tests for the frequency converter
│   └── merger.test.cjs         # Tests for the merger
└── README.md                   # This document
```

---

## Architecture Overview

The Query Engine is a small **pipeline** of four stages. Data flows strictly
top-to-bottom, and each stage has a single responsibility.

```
                     ┌───────────────────────┐
                     │      CALLER           │
                     │  query string / obj   │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
   parser/           │    query_parser       │
   query_parser.cjs  │  raw string → object  │
                     └───────────┬───────────┘
                                 │ parsed query
                                 ▼
   utils/            ┌───────────────────────┐
   validation_utils  │   validate query      │
                     └───────────┬───────────┘
                                 │ valid query
                                 ▼
                     ┌───────────────────────┐
   engine/           │    query_executor     │
   query_executor    │  query → raw rows     │
                     └───────────┬───────────┘
                                 │ raw series rows
                                 ▼
                     ┌───────────────────────┐
   engine/           │ frequency_converter   │
   frequency_converter │ native → target freq │
                     └───────────┬───────────┘
                                 │ converted rows
                                 ▼
                     ┌───────────────────────┐
   engine/           │       merger          │
   merger.cjs        │  align + join series  │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │  normalized result    │
                     │  (aligned table)      │
                     └───────────────────────┘
```

`query_engine.cjs` is the only module the outside world touches. It wires the
other modules together, so callers never deal with the individual stages.

---

## Component Responsibilities

### `engine/query_engine.cjs` — Orchestrator (public entry point)
- Accepts a raw query string **or** a pre-parsed query object.
- Runs the full pipeline: **parse → validate → execute → convert → merge**.
- Returns a single normalized result object to the caller.
- Provides `runSeriesQuery()` as a low-level convenience for internal users.

### `parser/query_parser.cjs` — Query DSL
- Parses a raw query string into a structured query object:
  ```
  {
    series:         [{ dataset, country, indicator, frequency }],
    timeRange:      { start, end },        // UTC ISO
    targetFrequency: "M" | "Q" | "A" | ...,
    filters:        { key: value },
    raw:            "original string"
  }
  ```
- Planned DSL example (Phase 2):
  ```
  SELECT CPI.US.M, GDP.US.Q FROM 2010-01-01 TO 2025-12-31 FREQUENCY A
  ```

### `utils/validation_utils.cjs` — Guard rail
- Validates the parsed query object before execution.
- Validates series ids, time ranges and frequencies.
- Returns lists of error strings; an empty list means the query is valid.

### `engine/query_executor.cjs` — Data access
- Executes validated queries against `collector/macro/db/macro.db`.
- Supports single-series and multi-series queries.
- Applies time-range filtering, limits and ordering.
- Returns **raw** rows; it never converts or merges.

### `engine/frequency_converter.cjs` — Resampling
- Converts a series from its native frequency to a requested one.
- Supported frequencies: **D**aily, **W**eekly, **M**onthly, **Q**uarterly,
  **A**nnual.
- Buckets rows by period (month / quarter / year) and aggregates with a chosen
  method (`last`, `mean`, `sum`, `first`).

### `engine/merger.cjs` — Alignment & joining
- Merges several converted series into one aligned table.
- Builds a common sorted date axis from all series.
- Supports `outer` (all dates) and `inner` (only common dates) joins, with a
  configurable fill value for missing observations.

### `utils/date_utils.cjs` — Date math
- Normalizes date inputs to UTC ISO.
- Computes period starts/ends (`getPeriodStart`, `getPeriodEnd`).
- Period arithmetic (`addPeriod`) used by resampling.

### `utils/frequency_utils.cjs` — Frequency handling
- Normalizes frequency labels (`monthly` / `MONTH` / `M` → `M`).
- Validates frequencies and maps them to period keys.

---

## Data Model Contract

The engine works with rows in a canonical shape (defined by the existing DB
build — see `collector/macro/db_build/README.md`):

```js
{
  series_id: "BIS.US.CREDIT.M",   // <dataset>.<country>.<indicator>.<frequency>
  date:      "2024-01-01",        // observation date
  value:     123.45,              // numeric value
  // optional metadata: unit, revision_id, source, ...
}
```

Series ids use the pattern `<dataset>.<country>.<indicator>.<frequency>`
(e.g. `IMF.IRN.NGDPD.A`, `OECD.DEU.CPI_YOY.M`, `FRED.USA.M2SL.M`).

---

## Result Shape (planned)

`runQuery()` will return:

```js
{
  query:     { ...original parsed query },
  status:    "ok" | "partial" | "error",
  errors:    [ "..." ],                 // non-fatal issues, if any
  frequency: "A",                       // actual frequency of the result
  rows: [
    { date: "2024-01-01", CPI_US_M: 3.2, GDP_US_Q: 5.1 },
    ...
  ]
}
```

---

## Testing Strategy

| Test file              | Covers                                            |
|------------------------|---------------------------------------------------|
| `parser.test.cjs`      | Query string → structured object, clauses, errors |
| `executor.test.cjs`    | Single/multi series fetch, filtering, limits      |
| `converter.test.cjs`   | Frequency resampling + aggregation methods        |
| `merger.test.cjs`      | Date-axis alignment, join modes, missing values   |

Planned runner (Phase 2):

```bash
node --test collector/macro/query/tests/
```

---

## Roadmap

| Phase | Scope                                                            |
|-------|------------------------------------------------------------------|
| **1** | Folder structure, stub functions, architecture documentation ✅  |
| **2** | Parser + validation implementation and tests                     |
| **3** | Executor (DB access layer) + tests                               |
| **4** | Frequency converter + tests                                      |
| **5** | Merger + engine orchestration + end-to-end tests                 |

---

## Conventions

- CommonJS (`.cjs`) — consistent with the rest of `collector/`.
- Header comment block in every file: `Project / File / Description / Author`.
- Each module exposes a named `module.exports` object.
- No side effects at `require` time (no DB connections, no file writes).
