/* ============================================================
 * File: gateway/core/config.cjs
 * Section: gateway/core (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   Every number this layer obeys, in one place, all of them injected — the
 *   same rule identity and the vault follow for their clock. Nothing here
 *   reads `process.env`: a deployment supplies its own numbers, a test
 *   supplies small ones, and neither has to reach into a module to find out
 *   what a request is allowed to cost.
 *
 *   Three of these defaults are decisions, not conveniences:
 *
 *     maxBodyBytes   a key is a string, not a file: the door refuses to read
 *                    a body larger than a pinned ceiling instead of buffering
 *                    whatever a caller sends;
 *     ip             the bucket an unauthenticated caller pays from, taken
 *                    BEFORE identity is asked anything — a flood must not
 *                    become a database read;
 *     workspace      the bucket a tenant pays from, taken after the token said
 *                    which tenant it is, so one noisy workspace cannot spend
 *                    another workspace's budget.
 *
 *   A number that is not a number is a wiring bug (`bad-entry`, thrown), never
 *   a silent fallback: a gateway that quietly runs with a limit nobody asked
 *   for is a gateway whose limits cannot be reasoned about.
 * ============================================================ */

const { CODES, fail } = require("../../identity/core/errors.cjs");

const DEFAULTS = Object.freeze({
    host: "127.0.0.1",
    /* 0 asks the operating system for a free port, which is what a test wants. */
    port: 0,
    maxBodyBytes: 16 * 1024,
    requestTimeoutMs: 15_000,
    headersTimeoutMs: 20_000,
    keepAliveTimeoutMs: 5_000,
    tenantHeader: "x-tenant-id",
    authorizationHeader: "authorization",
    /* `X-Forwarded-For` is believed only when a deployment says it terminates
     * the connection itself; otherwise the socket's address is the caller. */
    trustProxy: false,
    maxBuckets: 10_000,
    ip: Object.freeze({ capacity: 120, refillPerSec: 2 }),
    workspace: Object.freeze({ capacity: 240, refillPerSec: 8 })
});

function positive(value, what, { min = 0 } = {}) {
    if (!Number.isFinite(value) || value <= min) {
        fail(CODES.BAD_ENTRY, `${what} is a number greater than ${min}`);
    }
    return value;
}

function text(value, what) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(CODES.BAD_ENTRY, `${what} is a non-empty string`);
    }
    return value;
}

/** One bucket's shape, checked: a capacity of zero is a door that never opens. */
function bucket(value, what) {
    if (!value || typeof value !== "object") {
        fail(CODES.BAD_ENTRY, `${what} is an object of capacity and refillPerSec`);
    }
    return Object.freeze({
        capacity: positive(value.capacity, `${what}.capacity`),
        refillPerSec: positive(value.refillPerSec, `${what}.refillPerSec`)
    });
}

/**
 * The defaults, with whatever a deployment overrode on top — frozen, checked,
 * and never shared: two gateways in one process must not read each other's
 * budget because one of them was handed a smaller one.
 */
function compileConfig(overrides = {}) {
    if (!overrides || typeof overrides !== "object") {
        fail(CODES.BAD_ENTRY, "the gateway's config is an object of overrides");
    }

    const merged = { ...DEFAULTS, ...overrides };
    const port = merged.port;
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        fail(CODES.BAD_ENTRY, "port is an integer between 0 and 65535");
    }

    return Object.freeze({
        host: text(merged.host, "host"),
        port,
        maxBodyBytes: positive(merged.maxBodyBytes, "maxBodyBytes"),
        requestTimeoutMs: positive(merged.requestTimeoutMs, "requestTimeoutMs"),
        headersTimeoutMs: positive(merged.headersTimeoutMs, "headersTimeoutMs"),
        keepAliveTimeoutMs: positive(merged.keepAliveTimeoutMs, "keepAliveTimeoutMs"),
        tenantHeader: text(merged.tenantHeader, "tenantHeader").toLowerCase(),
        authorizationHeader: text(merged.authorizationHeader, "authorizationHeader").toLowerCase(),
        trustProxy: Boolean(merged.trustProxy),
        maxBuckets: positive(merged.maxBuckets, "maxBuckets"),
        ip: bucket(merged.ip, "ip"),
        workspace: bucket(merged.workspace, "workspace")
    });
}

module.exports = { DEFAULTS, compileConfig };
