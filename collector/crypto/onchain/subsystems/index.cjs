/* ============================================================
 * File: collector/crypto/onchain/subsystems/index.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   The four capsules of the on-chain collector, built together so that the
 *   orchestrator never has to know which of them exists:
 *
 *     whale_tracker      reserves, blocks, whales, network metrics
 *     stablecoin_flow    how many dollars sit on-chain (and on which chains)
 *     lending_rates      what those dollars are paid to stay
 *     institutional_flow the listed funds, quoted twice
 *
 *   One capsule owns one answer: a task belongs to exactly one subsystem, so a
 *   provider answer can never be turned into two contradictory readings, and
 *   the plan (tasks) has one source per event type.
 * ============================================================ */

const whaleTracker = require("./whale_tracker.cjs");
const stablecoinFlow = require("./stablecoin_flow.cjs");
const lendingRates = require("./lending_rates.cjs");
const institutionalFlow = require("./institutional_flow.cjs");

/** Building order is also report order: measure, plumbing, price, custody. */
const SUBSYSTEM_IDS = Object.freeze([
    whaleTracker.ID,
    stablecoinFlow.ID,
    lendingRates.ID,
    institutionalFlow.ID
]);

/**
 * @param {object} options
 * @param {object} options.catalog the subject catalog (funds need it to plan tasks)
 * @param {object} [options.whale]        whale_tracker options
 * @param {object} [options.stablecoins]  stablecoin_flow options
 * @param {object} [options.lending]      lending_rates options
 * @param {object} [options.institutional] institutional_flow options
 */
function createSubsystems({ catalog, whale = {}, stablecoins = {}, lending = {}, institutional = {} } = {}) {
    return [
        whaleTracker.createWhaleTracker(whale),
        stablecoinFlow.createStablecoinFlow(stablecoins),
        lendingRates.createLendingRates(lending),
        institutionalFlow.createInstitutionalFlow({ catalog, ...institutional })
    ];
}

/** Every event type the given subsystems may publish, without duplicates. */
function eventTypesOf(subsystems) {
    return [...new Set((subsystems || []).flatMap((subsystem) => [...subsystem.eventTypes]))];
}

/** The subsystem that owns a task id, or null. */
function subsystemForTask(subsystems, taskId) {
    for (const subsystem of subsystems || []) {
        if (subsystem.tasks().some((task) => task.taskId === taskId)) return subsystem;
    }
    return null;
}

module.exports = { SUBSYSTEM_IDS, createSubsystems, eventTypesOf, subsystemForTask };
