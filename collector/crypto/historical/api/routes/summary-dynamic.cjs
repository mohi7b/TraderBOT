// GET /summary/:symbol/:tf
// Dynamically builds a market summary from raw 1m data. Optional query params:
//   ?exchange=<key>   filter to a specific exchange; defaults to the most-populated.
//   ?from=<ms>&to=<ms>  inclusive epoch-ms window.
const { buildSummary } = require("../../_engine/summary-dynamic/build-summary.cjs");
const { assertTf } = require("../../_engine/timeframe/utils.cjs");

function assertSymbol(symbol) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol is required");
    return symbol.trim().toUpperCase();
}

async function summaryHandler({ symbol, tf }, ctx = {}) {
    const resolvedSymbol = assertSymbol(symbol);
    const resolvedTf = assertTf(tf);

    const from = ctx.query && ctx.query.from !== undefined && ctx.query.from !== "" ? Number(ctx.query.from) : null;
    const to = ctx.query && ctx.query.to !== undefined && ctx.query.to !== "" ? Number(ctx.query.to) : null;
    const exchange = ctx.query && ctx.query.exchange ? String(ctx.query.exchange) : null;

    if (from !== null && !Number.isInteger(from)) throw new TypeError("from must be an integer epoch-ms");
    if (to !== null && !Number.isInteger(to)) throw new TypeError("to must be an integer epoch-ms");

    return buildSummary(resolvedSymbol, resolvedTf, { exchange, from, to, rootDir: ctx.rootDir });
}

module.exports = { summaryHandler };
