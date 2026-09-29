# HANDOFF — Macro Backend (single source of truth)

> Single handoff doc. Companion runtime doc: `README.md` (same folder).

## Status

| Phase | Title                    | State |
| ----- | ------------------------ | ----- |
| A     | unit / series-kind catalog            | ✅ |
| B     | Picker + enrich                       | ✅ |
| C     | MoM/YoY %, level filtering, smoke     | ✅ |
| D1    | REST (`backend/http.cjs`/`boot.cjs`)  | ✅ |
| D2    | CLI (`cli.cjs`)                       | ✅ |
| E     | country dedup + outlier + header      | ✅ |
| P2‑1  | schema compliance (p2 spec)           | ✅ (schema fields live in output) |
| P2‑2  | group indicator breadth (p2 spec)     | ✅ Path‑1 (data‑driven) |

## Quick run (copy/paste)



Most of the JSON shape already matches (history 5/3, trend block, summary,
ISO3, English). Remaining deltas and plan:

- **P2‑1 (schema) — DONE.** `country.name`, `indicator.label/category`, and
  `risk_flags.abnormal_momentum` are live in the emitted payload.
- **P2‑2 (breadth) — DONE (decision: Path‑1, data‑driven).** Canonical families
  stay **fixed** (spec rule 1). Breadth activates **only** for series that
  actually exist in `core.db`. Executed in this pass:
  - **Inflation** gained **`GDP_DEFL`** (WB `NY.GDP.DEFL.KD.ZG`; YoY %, annual,
    17 countries × 65 pts). Load-bearing change wired everywhere:
    cli GROUPS, `modules/inflation.cjs`, `backend/http.cjs` builders, plus the
    upstream core build path (filters `indicators.json` + `INDICATOR_MAP` +
    `registry.cjs`).
  - **core.db rebuilt** cleanly (main `db/macro.db` untouched — read-only)
    `series=1,425 data=98,952`. Post-rebuild verifiable output:
    `codes: CPI , CORE_CPI , PPI , GDP_DEFL` (e.g. AUS −0.28% / BRA 1.65% as-of 2025).

### P2‑2 breadth → **future ingest‑task gaps** (data absent upstream, not yet in macro.core.db)

Verified absent → **recorded as ingest backlog**, NOT forced into output:

- Inflation: CPI Food / Energy / Services / Goods, Trimmed Mean, Median CPI,
  Import/Export price index, HICP (only via EU members subset), Wage Inflation
  (IMF ULC present=0 rows), Inflation Expectations.
- Growth: Retail Sales, Output Index, (Manufacturing output not a separate
  index; only WB value‑added under IND_PROD family already).
- Labor: Job Openings, Wage Growth.

These need an **upstream** macro.db ingest (e.g. FRED full catalogue / BLS)
before they can surface; they are data gaps, not code gaps.

