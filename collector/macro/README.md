# Macro Backend — Professional Engine (Dashboard / API / CLI)

Production macro engine that turns `core.db` into Bloomberg‑style group
outputs for **Inflation / Growth / Labor** — with dashboard‑grade JSON,
unit correctness, ISO3 normalization, English metadata (multilingual
structure ready), and REST + CLI entry points.

> Runtime note: run every command from inside `collector/macro/`.

---

## 1. Project structure

```
collector/macro/
├── backend/
│   ├── picker.cjs / core/picker_lib.cjs # Picker engine (core logic)
│   ├── modules/{inflation,growth,labor}.cjs # group builders
│   ├── processors/{trend,risk,summary}.cjs
│   ├── catalog/registry.cjs            # ISO3 + unit/kind catalog
│   ├── http.cjs                        # HTTP layer (REST, reusable start())
│   └── boot.cjs                        # server entry (node boot.cjs)
├── cli.cjs                             # terminal viewer (CLI/TUI)
├── core_db/ ... /core.db               # curated relational DB (read-only)
├── db/macro.db                         # raw provider DB (read-only)
├── offline/                            # provider offline CSV / datamappers
├── tools/
│   ├── _c_smoke.cjs                    # engine smoke test
│   ├── unit_registry_build.cjs / resolve.cjs
│   ├── unit_registry.json / boundaries...
│   └── *_build / *_resolve scripts
├── api/server.cjs                      # (optional legacy) query/DSL endpoint
├── query/                              # ChartEngine / DSL service
├── config/keys.json
└── p2.txt                              # Bloomberg‑style output spec
```

---

## 2. Run the API

```bash
cd /root/TraderBOT/collector/macro
node backend/boot.cjs            # → http://127.0.0.1:4001
```

Health / groups / group payload:

```bash
curl -s http://127.0.0.1:4001/api/health
curl -s http://127.0.0.1:4001/api/groups
curl -s http://127.0.0.1:4001/api/group/inflation | head -c 400
```

Run only **one** server (avoid port conflict).

---

## 3. Run the CLI

```bash
cd /root/TraderBOT/collector/macro
node cli.cjs groups                 # list groups + coverage
node cli.cjs view inflation         # clean ASCII table (country dedup)
node cli.cjs view growth
node cli.cjs raw growth             # full JSON of a group
node cli.cjs serve 4001             # start shared HTTP runtime
node cli.cjs health
```

`view` shows one series per country and hides hard outliers (announced
as `HIDDEN n outlier series`).

---

## 4. Unit Registry

`backend/catalog/registry.cjs` → `dataset::code -> {unit, kind}`.

| kind      | MoM / YoY meaning                       |
| --------- | --------------------------------------- |
| `index`   | % change (level index)                  |
| `level`   | % change (absolute nominal/volume)      |
| `rate`|percent | change‑in‑rate (stored value is already %) |

Index + level ⇒ MoM/YoY as **% change**;
rate/percent ⇒ **change‑in‑rate**.
Summary averages only growth‑like series. See
`tools/unit_registry_boundaries.md`.

Known catalog: canonical families, IMF/BIS code rules (`_PCH`, `*_GDP`,
`EREER/ENEER`, BIS overrides) — e.g. `OECD::INDPRO` is treated as index.
Non‑dashboard codes (e.g. the ~1498 WB raw helper codes) intentionally
stay `unit:null` unless a provider file supplies a real unit.

---

## 5. Picker

```
canonical → INDICATOR_MAP → provider codes
  → candidate series from core.db (min points gate)
  → balanced round‑robin (≤ MAX_SERIES=10)
  → seriesProfile (registry) → unit/kind
  → mom/yoy per kind + trend + risk
  → group summary
```

Output per series (p2 spec):

```json
{
  "group": "1A_inflation",
  "summary": { "global_trend": "cooling", "avg_yoy": 7.74, "avg_mom": 0.98 },
  "series": [{
    "id": "DATASET_ISO3_CANON", "dataset": "…",
    "country": { "code": "USA", "name": "United States" },
    "indicator": { "code": "CPI", "label": "…", "category": "…" },
    "unit": "…", "frequency": "M",
    "latest": { "date": "2026-07", "value": 332.8, "mom": 0.07, "yoy": 3.3 },
    "trend": { "direction": "up|down|flat", "strength": "weak|medium|strong",
               "slope_3m": 0, "slope_6m": 0, "slope_12m": 0,
               "momentum": 0, "volatility": 0 },
    "history": { "full": [ "… 5y …" ], "display": [ "… 3y …" ] },
    "risk_flags": { "high_volatility": false, "sharp_reversal": false,
                    "abnormal_momentum": false }
  }]
}
```

---

## 6. Groups

| Key         | Canonical indicators            | Theme        |
| ----------- | ------------------------------- | ------------ |
| `1A_inflation` | CPI, CORE_CPI, PPI, **GDP_DEFL** | Inflation |
| `1B_growth`    | GDP, IND_PROD, RETAIL_SALES    | Growth    |
| `1C_labor`     | UNEMP, EMP                     | Labor     |

Up to 10 balanced series per group; country dedup enforced in CLI view.

> **P2‑2 breadth — data‑driven (Path 1).** Anchors stay fixed (p2 spec rule 1).
> Breadth only activates for series that genuinely exist in `core.db`. Today only
> **GDP_DEFL** (WB `NY.GDP.DEFL.KD.ZG`, YoY %, annual) is available, so it is the
> sole inflation breadth member. Retail Sales, Job Openings, CPI Food/Energy/
> Median, Wage Growth, Inflation Expectations etc. are **not** in core.db —
> tracked as an upstream ingest backlog (see `HANDOFF.md`), never force‑picked.

---

## 7. Sample outputs

CLI — `view inflation`:

```text
[1A_inflation] Inflation   trend=cooling
   avg_mom=-0.98  avg_yoy=-3.14  countries=[AUS,BRA,DEU,KOR,USA]  as_of=2031  (HIDDEN 1 outlier)
Dataset   Country  Indicator  Kind    Freq  Value     MoM%   YoY%  Trend  As of
--------------------------------------------------------------------------------
BIS       BRA      CPI        index   M      4.44    -4.3   -15   down   2026-07
FRED      USA      CPI        index   M    332.81     0.1    3.3   down   2026-07
EUROSTAT  DEU      CPI        rate    M        2     -0.6   -0.8   down   2025-12
…

```

CLI — `view growth`: `[1B_growth] Growth trend=mixed  avg_mom=-0.7 avg_yoy=-0.9 …`.

API — health: `{ "status":"ok", "groups":[ "1A_inflation","1B_growth","1C_labor"] }`

---

## 8. REST routes

| Route                    | Description                |
| ------------------------ | -------------------------- |
| `GET /api/health`        | ping + groups              |
| `GET /api/groups`        | group metadata             |
| `GET /api/inflation`     | full inflation payload     |
| `GET /api/growth`        | full growth payload        |
| `GET /api/labor`         | full labor payload         |
| `GET /api/group/<slug>`  | alias of one group         |

JSON + open CORS, default port **4001**.

---

## 9. CLI commands

`groups` · `view <group>` · `raw <group>` · `serve [port]` · `health`.

---

## 10. Smoke test

```bash
cd /root/TraderBOT/collector/macro
node tools/_c_smoke.cjs
```

Expect index/level series with small **%** MoM/YoY (not raw big diffs) and
rate series as change‑in‑rate (e.g. `FRED_USA_CPI_M` ~ yoy 3.3).

---

## 11. Architecture

```
offline (IMF/BIS/OECD…) → db/macro.db → core_db → core.db
                                              │
                                              ▼
                           backend/picker_lib (Picker, registry-based)
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                backend/http.cjs + boot.cjs      cli.cjs (view/raw/serve)
                       (REST D1)                        (D2)
```

Single build path shared by REST & CLI — no parallel logic.
