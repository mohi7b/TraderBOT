// Standard JSON envelopes used by the API.
function ok(data) {
    return Object.freeze({ ok: true, data });
}

function error(message, status = 400) {
    return Object.freeze({ ok: false, error: message, status });
}

// Formats an epoch-ms timestamp as "YYYY-MM-DDTHH:mm:ss.sssZ" (ISO 8601), or null.
function formatTimestamp(epochMs) {
    if (!Number.isInteger(epochMs)) return null;
    return new Date(epochMs).toISOString();
}

module.exports = { ok, error, formatTimestamp };
