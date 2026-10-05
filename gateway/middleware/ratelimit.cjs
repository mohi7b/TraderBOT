/* ============================================================
 * File: gateway/middleware/ratelimit.cjs
 * Section: gateway/middleware (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   The two budgets a request pays from, and the order they are paid in.
 *
 *     address    first, before identity is asked anything at all: a flood from
 *                an address must not become a database read, so the cheapest
 *                question in the system is asked before the most expensive one.
 *                Every caller has an address, including one with no token;
 *
 *     workspace  after the token said which tenant it is: one noisy workspace
 *                cannot spend another workspace's budget, and an anonymous
 *                caller cannot spend any tenant's.
 *
 *   A request that is refused by the route table still pays the address budget
 *   — an unmatched path is exactly what a scanner sends — but a route that
 *   declares `limits: false` (the liveness probe) pays nothing, because a door
 *   that rate-limits its own heartbeat reports an outage during one.
 * ============================================================ */

const { accept } = require("../../identity/core/errors.cjs");
const { addressOf } = require("../core/http.cjs");
const { createRateLimiter } = require("../core/ratelimit.cjs");

function createDoorLimits(options = {}) {
    const {
        now,
        ip,
        workspace,
        maxBuckets,
        trustProxy = false
    } = options;

    const addresses = createRateLimiter({
        now,
        capacity: ip.capacity,
        refillPerSec: ip.refillPerSec,
        maxBuckets,
        name: "ip"
    });
    const workspaces = createRateLimiter({
        now,
        capacity: workspace.capacity,
        refillPerSec: workspace.refillPerSec,
        maxBuckets,
        name: "workspace"
    });

    /** The bucket every caller has, taken before anything is looked up. */
    function takeAddress(req) {
        const address = addressOf(req, { trustProxy });
        const taken = addresses.take(`ip:${address}`);
        return taken.ok ? accept({ ...taken, address }) : taken;
    }

    /** The bucket the tenant pays from, taken once the token named it. */
    function takeWorkspace(workspaceId) {
        return workspaces.take(`ws:${workspaceId}`);
    }

    return Object.freeze({
        takeAddress,
        takeWorkspace,
        addressOf: (req) => addressOf(req, { trustProxy }),
        limits: Object.freeze({ ip, workspace, maxBuckets, trustProxy }),
        stats: () => Object.freeze({ ip: addresses.stats(), workspace: workspaces.stats() })
    });
}

module.exports = { createDoorLimits };
