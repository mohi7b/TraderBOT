# Unit Registry — Coverage & Boundaries (D3)

Authoritative-ish Unit Registry, scoped to what can be guaranteed from
offline sources that actually exist. Written after the A/B/C + D2 audit.

## What the registry is

A unit/kind layer keyed by `dataset::code` consumed by the Backend
(`seriesProfile` in `backend/catalog/registry.cjs`) to turn raw values
into a meaningful dashboard unit and to compute MoM/YoY consistently:

- `unit`   : display string ("YoY %", "Index (CPI)", "% of GDP", ...)
- `kind`   : index | rate | percent | level   (drives mom/yoy math)

Single source of truth for the series that reach the dashboard (core /
canonical families + curated OECD/FRED/eurostat/IMF/BIS series).

## Evidence base — offline sources do NOT all carry units

Audit of every offline "datamapper" we ship:

| Source                         | Rows     | `Units`/unit column present         |
| ------------------------------ | -------- | ----------------------------------- |
| IMF `ifs_sdmx_datamapper.csv`  | 114,458  | column exists but 0 / 0 rows filled |
| IMF `gfs_sdmx_datamapper.csv`  | 47,373   | column exists but 0 / 0 rows filled |
| WB `WDI_CSV/WDISeries.csv`     | (WDI)    | no reliable unit column             |
| BIS / OECD / EUROSTAT / FRED   | (small)  | unit implicit in curated family feeds only |

Conclusion: the provider offline "datamappers" map **codes**, not units.
So a unit cannot be lifted from them wholesale; it is derived from
catalog families + domain code rules + explicit overrides.

## Resolution pathways actually used

1. **canonical (catalog)** — the 13 macro indicator families
   (CPI, PPI, GDP, ..., CLI, EXPORT/IMPORT, money/labour). Unit/kind come
   from `INDICATOR_META` in `registry.cjs`. `unit_registry.json` reports
   **83** distinct canonical codes across datasets.

2. **pattern / domain IMF & BIS** — code-suffix semantics known from the
   IMF/IFS & BIS vocabulary:
   - IMF `_PCH`      → `YoY %`, kind `rate`
   - IMF `*_GDP/_NGDP/_GDP_PT` → `% of GDP`, kind `percent`
   - IMF `EREER|ENEER` → `Index (EER)`, kind `index`
   - BIS headers like CREDIT_GAP, DEBT_SERVICE_RATIO, PROPERTY_PRICES …
   `unit_registry_resolve.cjs` resolves **24** such codes.

3. **explicit overrides** — misleading numeric units & dual codes:
   - `BIS::PAYMENT_DEVICES/PARTICIPATION/SHARE_PRICES` (numeric-unit dummies)
     → authoritative real unit (`override_final` = 3 codes).
   - `OECD::INDPRO` stored value is an **index** (2015=100) → forced to
     `kind:index, "Index (Ind. Prod.)"` so MoM/YoY are % and comparable in
     the growth group (was mis-flagged as generic level).

## What stays unresolved (by design)

Codes outside the curated dashboard families have no trustworthy offline
unit source. They are **explicitly left** `unit:null` rather than guessed:

| dataset   | unresolved (aggregated distinct) |
| --------- | -------------------------------- |
| WB        | 1498 (non-core helper indicators)|
| BIS       | ~24                              |
| OECD      | ~12                              |
| IMF       | ~12                              |
| FRED      | ~12                              |
| EUROSTAT  | ~7                               |

These are not part of the `core.db` chart pipeline / group summaries, so
they do not affect the API/CLI outputs. Filling them safely will require
a provider file that actually stores a unit/units column per indicator.

`tools/_manual_unresolved.txt` lists representative keys for follow-up.

## Integration status

- `dataset::code -> unit/kind` used by `picker_lib` via `seriesProfile()`.
- MoM/YoY for `index`+`level` series = % change; for `rate`/`percent`
  series = change-in-rate. Group summary averages only growth-like series.
- Unit Registry snapshot: `tools/unit_registry.json`.
  Provider resolve trial: `tools/unit_registry_resolved.json`.

## Boundaries (decision rules)

- We assert a unit/kind **only when** a catalog family, a known code
  pattern, or an explicit provider override justifies it.
- Anything else is reported as `needs_manual` (never fabricated).
- Core-dashboard unit layer is complete and validated (Phase C smoke).
