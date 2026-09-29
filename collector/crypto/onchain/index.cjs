/* ============================================================
 * File: collector/crypto/onchain/index.cjs
 * Section: collector/crypto/onchain
 * Version: 1.0.0
 *
 * Role:
 *   Public surface of the on-chain collector. This is the file the rest of
 *   the system (or a test) imports:
 *
 *     const onchain = require("./collector/crypto/onchain/index.cjs");
 *     const collector = onchain.createCollector({ bus });
 *     await collector.run({ polls: 3 });
 *     collector.status();
 *
 *   Every reading leaves as the standard envelope with sourceType "onchain"
 *   and marketType null (an exchange reserve is not a trade), so the frame is
 *   the same one the realtime, historical, derivatives and liquidity
 *   collectors publish, and analytics-engine needs no special case.
 * ============================================================ */

const reading = require("./core/reading.cjs");
const subject = require("./core/subject.cjs");
const { ONCHAIN_MARKET, readingEnvelope, createOnchainBridge, createReadingPublisher } = require("./core/bus-bridge.cjs");
const { createFeedClient } = require("./core/feed-client.cjs");
const { createOrchestrator, DEFAULT_INTERVAL_MS, MIN_FAILURE_BACKOFF_MS, FAILURE_BACKOFF_CAP_MS, MAX_FOLLOW_UPS_PER_POLL } = require("./core/orchestrator.cjs");

const { ONCHAIN_SECTION, PROVIDER_CONFIG, PROVIDER_IDS, providerConfig, apiKeyFor, providerReadiness } = require("./config/providers.cjs");
const { createProviderRegistry, DEFAULT_PROVIDERS, PROVIDER_KINDS, prepareRequest, assertProvider } = require("./providers/index.cjs");
const { SUBJECT_GROUPS, GROUP_IDS, createSubjectCatalog, defaultCatalog } = require("./subjects/index.cjs");
const { SUBSYSTEM_IDS, createSubsystems, eventTypesOf, subsystemForTask } = require("./subsystems/index.cjs");

/** The orchestrator with everything defaulted — the usual entry point. */
function createCollector(options = {}) {
    return createOrchestrator(options);
}

module.exports = {
    /* build */
    createCollector,
    createOrchestrator,
    createFeedClient,
    createProviderRegistry,
    createSubjectCatalog,
    defaultCatalog,
    createSubsystems,
    createOnchainBridge,
    createReadingPublisher,

    /* data */
    readingEnvelope,
    createReading: reading.createReading,
    EVENT_TYPES: reading.EVENT_TYPES,
    ONCHAIN_MARKET,
    DEFAULT_INTERVAL_MS,
    MIN_FAILURE_BACKOFF_MS,
    FAILURE_BACKOFF_CAP_MS,
    MAX_FOLLOW_UPS_PER_POLL,

    /* vocabulary + subjects */
    ...subject,
    SUBJECT_GROUPS,
    GROUP_IDS,
    SUBSYSTEM_IDS,
    eventTypesOf,
    subsystemForTask,

    /* providers */
    ONCHAIN_SECTION,
    PROVIDER_CONFIG,
    PROVIDER_IDS,
    PROVIDER_KINDS,
    DEFAULT_PROVIDERS,
    providerConfig,
    apiKeyFor,
    providerReadiness,
    prepareRequest,
    assertProvider
};
