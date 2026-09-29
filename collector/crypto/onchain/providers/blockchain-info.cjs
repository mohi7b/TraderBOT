/* ============================================================
 * File: collector/crypto/onchain/providers/blockchain-info.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   Blockchain.com's chart API — the slow, official-ish backbone of a
 *   network reading. It answers with a daily series, so the collector keeps
 *   the last point *and* the one before it: a supply that grew is more
 *   informative than a supply.
 *
 *     supply         /charts/total-bitcoins                BTC in circulation
 *     tx-volume-usd  /charts/estimated-transaction-volume-usd  value moved per day
 *
 *   Verified live (2026-09): both answer http 200 with
 *   {"status":"ok","period":"day","values":[{"x":epochSeconds,"y":value}]}.
 *
 *   The chart is asked for two weeks even though only two points are used:
 *   a shorter window can come back with a single point on a slow day, and a
 *   delta with no second point would be null for no good reason.
 * ============================================================ */

const { numberOrNull } = require("../core/reading.cjs");

const ID = "blockchain-info";

const endpoints = Object.freeze({
    supply: Object.freeze({ path: "/charts/total-bitcoins" }),
    "tx-volume-usd": Object.freeze({ path: "/charts/estimated-transaction-volume-usd" })
});

const TIMESPAN = "2weeks";

function buildUrl({ endpoint, config }) {
    if (!Object.prototype.hasOwnProperty.call(endpoints, endpoint)) return null;
    const url = new URL(`${config.baseUrl}${endpoints[endpoint].path}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("timespan", TIMESPAN);
    return url.toString();
}

/** Last two usable points of a chart series. */
function pointsOf(data) {
    const values = data && Array.isArray(data.values) ? data.values : [];
    const points = values
        .map((point) => ({ at: numberOrNull(point && point.x), value: numberOrNull(point && point.y) }))
        .filter((point) => point.at !== null && point.value !== null);
    return points.slice(-2);
}

function parse({ endpoint, data }) {
    if (!Object.prototype.hasOwnProperty.call(endpoints, endpoint)) return [];
    const points = pointsOf(data);
    if (points.length === 0) return [];

    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const row = {
        key: "BTC",
        at: latest.at * 1000,
        prevAt: previous ? previous.at * 1000 : null,
        source: "blockchain.com chart"
    };

    if (endpoint === "supply") {
        row.supplyBtc = latest.value;
        row.prevSupplyBtc = previous ? previous.value : null;
    } else {
        row.txVolumeUsd = latest.value;
        row.prevTxVolumeUsd = previous ? previous.value : null;
    }

    return [row];
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse, pointsOf };