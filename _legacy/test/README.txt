_legacy/test — tests of retired code
====================================

These tests go with modules that were retired from the live tree and
archived under _legacy/ (see _legacy/DESIGN.md). They are NOT part of
the live suite: test/ now contains only tests of code that runs.

Nothing here is loaded by collector/, orchestrator/ or frontend/ — a
test here only matters if somebody deliberately revives its subject.

| test                          | subject (archived)                                | retired    |
|-------------------------------|---------------------------------------------------|------------|
| candle-resampler.test.cjs     | _legacy/historical/aggregator/candle-resampler.cjs | 2026-08-24 |
| retention-policy.test.cjs     | _legacy/historical/retention-policy.cjs            | 2026-08-24 |

Run one:
    node _legacy/test/candle-resampler.test.cjs
    node _legacy/test/retention-policy.test.cjs

Requires inside these files are relative to _legacy/test, i.e.
`../historical/...` resolves to _legacy/historical/... They were rewritten
when the files moved out of test/ (Phase-2 step 1) so that the archived
pair still proves itself instead of failing with MODULE_NOT_FOUND.

Retention note: the live 1m/5m/... retention is enforced by the
historical section itself (collector/crypto/historical/_engine), not by
retention-policy.cjs.
