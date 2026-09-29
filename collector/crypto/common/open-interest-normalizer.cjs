function firstFinite(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return null;
}

function normalizeOpenInterest({ exchange, payload = {} } = {}) {
    const oiContracts = firstFinite(payload.oiContracts, payload.oi, payload.openInterest);
    const oiBase = firstFinite(payload.oiBase, payload.oiCcy, payload.holdingAmount);
    const oiUsd = firstFinite(payload.oiUsd);

    return {
        exchange: exchange || "unknown",
        oiContracts,
        oiBase,
        oiUsd,
        aggregateEligible: oiUsd !== null
    };
}

module.exports = { normalizeOpenInterest };
