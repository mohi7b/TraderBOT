// Historical Server Layer — Normalizer (S1 · single source of truth)
//
// Why a dedicated normalizer (and why here)?
//   The chart domain needs ONE normalization contract: ascending order, no
//   duplicates, no future candles, an honest gap report — and the Analysis
//   Layer (A3) must never see a dirty or incomplete candle. Raw rows come from
//   SQLite (the source of truth); this module is the only place that decides
//   what a "clean" series is. The frontend TAMC layer now only maps the axis to
//   New-York close (display), it does not re-normalize data.
//
// Two entry points:
//   · normalize1m(rows, opts)      -> raw 1m rows  -> { candles, report }
//   · normalizeBuckets(rows, opts) -> aggregated    -> { closed, forming, ... }
//
// Rules (version 1.0.0, documented + golden-tested):
//   1. non-finite OHLC              -> dropped, counted (`droppedInvalid`)
//   2. timestamp > nowMs            -> dropped, counted (`droppedFuture`)
//   3. exact duplicate timestamps   -> first kept, counted (`duplicates`)
//   4. ascending order enforced     -> sorted by timestamp (stable)
//   5. gaps                         -> reported, NEVER filled with synthetic candles
//   6. coveragePct = kept / (kept + missingBars)
//   7. bucket split                 -> closed (bar ended) vs forming (still open)

const NORMALIZER_VERSION = "1.0.0";

const MINUTE_MS = 60_000;

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function isValidCandle(row) {
    return (
        row &&
        isFiniteNumber(Number(row.timestamp)) &&
        isFiniteNumber(Number(row.open)) &&
        isFiniteNumber(Number(row.high)) &&
        isFiniteNumber(Number(row.low)) &&
        isFiniteNumber(Number(row.close))
    );
}

// Shared core: sort, dedupe, drop future, collect gaps.
function normalizeSeries(rows, { nowMs, barSpacingMs, dropFuture = true } = {}) {
    const report = {
        version: NORMALIZER_VERSION,
        input: Array.isArray(rows) ? rows.length : 0,
        kept: 0,
        droppedInvalid: 0,
        droppedFuture: 0,
        duplicates: 0,
        firstTimestamp: null,
        lastTimestamp: null,
        barSpacingMs,
        gaps: [],
        missingBars: 0,
        coveragePct: 0,
    };
    if (!Array.isArray(rows) || rows.length === 0) return { candles: [], report };

    const invalid = [];
    const valid = [];
    for (const row of rows) {
        if (!isValidCandle(row)) invalid.push(row);
        else valid.push(row);
    }
    report.droppedInvalid = invalid.length;
    valid.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

    const kept = [];
    let lastTs = null;
    for (const row of valid) {
        const ts = Number(row.timestamp);
        if (lastTs !== null && ts === lastTs) {
            report.duplicates += 1;
            continue;
        }
        if (dropFuture && Number.isFinite(nowMs) && ts > nowMs) {
            report.droppedFuture += 1;
            continue;
        }
        kept.push(row);
        lastTs = ts;
    }

    // Gap report: a step > 1.5 bars is a real hole (no synthetic candle is made).
    if (Number.isFinite(barSpacingMs) && barSpacingMs > 0) {
        const threshold = barSpacingMs * 1.5;
        for (let i = 1; i < kept.length; i += 1) {
            const prev = Number(kept[i - 1].timestamp);
            const cur = Number(kept[i].timestamp);
            const step = cur - prev;
            if (step > threshold) {
                const missing = Math.max(0, Math.round(step / barSpacingMs) - 1);
                report.missingBars += missing;
                if (report.gaps.length < 50) {
                    report.gaps.push({ from: prev, to: cur, missingBars: missing });
                }
            }
        }
    }

    report.kept = kept.length;
    report.firstTimestamp = kept.length ? Number(kept[0].timestamp) : null;
    report.lastTimestamp = kept.length ? Number(kept[kept.length - 1].timestamp) : null;
    const expected = kept.length + report.missingBars;
    report.coveragePct = expected > 0 ? Math.round((kept.length / expected) * 10000) / 100 : 0;

    return { candles: kept, report };
}

// Raw 1m rows -> clean 1m rows (A3 input at the finest level).
function normalize1m(rows, { nowMs = Date.now() } = {}) {
    return normalizeSeries(rows, { nowMs, barSpacingMs: MINUTE_MS, dropFuture: true });
}

// Aggregated buckets -> { closed, forming } + gap report.
// A bucket is `closed` when its bar has fully ended (timestamp + width <= now).
function normalizeBuckets(rows, { nowMs = Date.now(), tfWidthMs = MINUTE_MS } = {}) {
    const { candles, report } = normalizeSeries(rows, {
        nowMs,
        barSpacingMs: tfWidthMs,
        // The forming bucket legitimately extends past `now`: keep it, then split.
        dropFuture: false,
    });
    const closed = [];
    let forming = null;
    for (const candle of candles) {
        const end = Number(candle.timestamp) + tfWidthMs;
        if (end <= nowMs) closed.push(candle);
        else forming = candle; // only the (single) tail bucket can be forming
    }
    report.closedCount = closed.length;
    report.forming = Boolean(forming);
    return { closed, forming, report };
}

module.exports = {
    NORMALIZER_VERSION,
    MINUTE_MS,
    normalize1m,
    normalizeBuckets,
};
