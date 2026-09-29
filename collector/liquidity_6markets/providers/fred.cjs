/* ============================================================
 * File: collector/liquidity_6markets/providers/fred.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   FRED (St. Louis Fed) series observations — the macro leg of the six
 *   markets. It is the only source here that speaks the language of
 *   bonds, credit and housing with real, official numbers:
 *
 *     DGS10 / DGS2          US Treasury yields (%)  → bonds
 *     BAMLH0A0HYM2          US high-yield OAS (%)   → credit
 *     MORTGAGE30US          US 30-year mortgage (%) → real estate
 *     CSUSHPINSA            Case-Shiller home price → real estate
 *     DTWEXBGS              trade-weighted USD      → forex context
 *
 *   These are *levels*, not liquidity streams, so the reading carries
 *   no depth and no bid/ask, and the instrument asks for a long
 *   freshness window (see instruments/bonds.cjs). A "." value is FRED
 *   for "missing observation" and must never become 0.
 * ============================================================ */

const ID = "fred";

function buildUrl(instrument, { providerSymbol, apiKey, config }) {
    const url = new URL(config.baseUrl);
    url.searchParams.set("series_id", providerSymbol);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "2");
    return url.toString();
}

function numberOrNull(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim();
    if (text === "" || text === ".") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

function parse(data, { providerSymbol = null } = {}) {
    const observations = data && Array.isArray(data.observations) ? data.observations : null;
    if (!observations || observations.length === 0) return null;

    /* The list is newest-first; the newest row with a real value wins. */
    let latest = null;
    let previous = null;
    for (const row of observations) {
        const value = numberOrNull(row && row.value);
        if (value === null) continue;
        if (latest === null) latest = { value, date: row.date };
        else if (previous === null) previous = { value, date: row.date };
    }
    if (!latest) return null;

    const parsedDate = Date.parse(`${latest.date}T00:00:00Z`);

    return {
        providerSymbol,
        price: latest.value,
        close: latest.value,
        open: null,
        high: null,
        low: null,
        volume: null,
        barInterval: "1d",
        timestamp: Number.isFinite(parsedDate) ? parsedDate : null,
        previousValue: previous ? previous.value : null,
        previousDate: previous ? previous.date : null
    };
}

module.exports = { id: ID, kind: "json", requiresKey: true, buildUrl, parse, numberOrNull };
