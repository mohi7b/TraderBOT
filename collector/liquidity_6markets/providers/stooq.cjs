/* ============================================================
 * File: collector/liquidity_6markets/providers/stooq.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   Stooq's light quote endpoint — the second, independent venue for
 *   FX / metals / indices / yields, which is what turns "a price" into
 *   a *cross-market spread*. It answers with one CSV line:
 *
 *     Symbol,Date,Time,Open,High,Low,Close,Volume
 *     EURUSD,2026-08-31,22:00:00,1.08310,1.08400,1.08200,1.08350,12345
 *
 *   "N/D" means "no data" in Stooq's dialect and is treated as null —
 *   never as zero.
 * ============================================================ */

const ID = "stooq";

function buildUrl(instrument, { providerSymbol, config }) {
    const url = new URL(config.baseUrl);
    url.searchParams.set("s", providerSymbol);
    url.searchParams.set("f", "sd2t2ohlcv");
    url.searchParams.set("h", "");
    url.searchParams.set("e", "csv");
    return url.toString();
}

function numberOrNull(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (text === "" || text.toUpperCase() === "N/D") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

/** "2026-08-31" + "22:00:00" → epoch ms (UTC), or null. */
function timestampOf(dateText, timeText) {
    if (!dateText) return null;
    const iso = `${String(dateText).trim()}T${(timeText || "00:00:00").trim()}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
}

function parse(data, { providerSymbol = null } = {}) {
    if (typeof data !== "string") return null;

    const lines = data.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) return null;

    const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    const cells = lines[1].split(",").map((cell) => cell.trim());
    const at = (name) => {
        const index = header.indexOf(name);
        return index === -1 ? null : cells[index];
    };

    const close = numberOrNull(at("close"));
    const open = numberOrNull(at("open"));
    const price = close === null ? open : close;
    if (price === null || price <= 0) return null;

    return {
        providerSymbol,
        price,
        open,
        high: numberOrNull(at("high")),
        low: numberOrNull(at("low")),
        close,
        volume: numberOrNull(at("volume")),
        barInterval: "1d",
        timestamp: timestampOf(at("date"), at("time"))
    };
}

module.exports = { id: ID, kind: "csv", buildUrl, parse, numberOrNull, timestampOf };
