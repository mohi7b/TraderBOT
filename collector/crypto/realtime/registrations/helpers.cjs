/* ============================================================
 * File: collector/crypto/realtime/registrations/helpers.cjs
 * Section: collector/crypto/realtime/registrations
 *
 * Role:
 *   Small builders shared by the spot/futures registration tables.
 *   They keep the tables declarative and make the legacy execution
 *   order explicit through `priority`.
 * ============================================================ */

const NOOP = () => {};

/**
 * Build a group of module descriptors.
 *
 * @param {object}   options
 * @param {string}   options.market    "spot" | "futures"
 * @param {string}   options.name      group name (price/depth/candles/...)
 * @param {function} [options.guard]   legacy inline `if (...)` as a predicate
 * @param {number}   options.start     priority of the first module
 * @param {Array}    options.entries   [[alias, moduleFn], ...] in legacy order
 */
function group({ market, name, guard = null, start, entries }) {
    return entries.map(([alias, run], index) => ({
        id: `${market}.${name}.${alias}`,
        market,
        group: name,
        priority: start + index,
        when: guard,
        healthEvent: null,
        run: (ctx) => run(ctx)
    }));
}

/**
 * A group health marker: legacy handlers called
 * `emitHealth("price")` / `("depth")` / ... once before the group ran.
 * The marker keeps the group guard so it fires exactly when the group
 * would have fired, and it publishes the same event payload.
 */
function marker({ market, name, guard = null, priority, healthEvent }) {
    return {
        id: `${market}.${name}.marker`,
        market,
        group: name,
        priority,
        when: guard,
        healthEvent,
        description: `group health marker for ${market}/${name}`,
        run: NOOP
    };
}

module.exports = { group, marker, NOOP };
