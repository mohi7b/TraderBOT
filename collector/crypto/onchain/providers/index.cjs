/* ============================================================
 * File: collector/crypto/onchain/providers/index.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   The provider registry, and the one place where "which URL answers this
 *   question" is decided. Everything else asks for a *prepared request*:
 *
 *     { ok: true, url, parse: "json", providerId, endpoint }
 *     { ok: false, reason: "..." }   ← unknown endpoint / missing key
 *
 *   On-chain providers are *list-shaped*: one request answers about many
 *   subjects (88 exchanges, 427 stablecoins, 17,153 pools). So a provider
 *   normalises the provider's own vocabulary into our field names and hands
 *   back rows; deciding which row is about which tracked subject is the
 *   subsystem's job. A provider never invents a subject.
 * ============================================================ */

const defillama = require("./defillama.cjs");
const stablecoins = require("./stablecoins.cjs");
const yields = require("./yields.cjs");
const mempool = require("./mempool.cjs");
const blockchainInfo = require("./blockchain-info.cjs");
const yahoo = require("./yahoo.cjs");
const nasdaq = require("./nasdaq.cjs");

const { providerConfig, apiKeyFor } = require("../config/providers.cjs");

const DEFAULT_PROVIDERS = Object.freeze([defillama, stablecoins, yields, mempool, blockchainInfo, yahoo, nasdaq]);

const PROVIDER_KINDS = Object.freeze(["json"]);

function assertProvider(provider) {
    if (!provider || typeof provider.id !== "string" || provider.id.trim() === "") {
        throw new TypeError("provider.id is required");
    }
    if (!PROVIDER_KINDS.includes(provider.kind)) {
        throw new RangeError(`provider ${provider.id}: kind must be one of ${PROVIDER_KINDS.join("|")}`);
    }
    if (!provider.endpoints || typeof provider.endpoints !== "object" || Object.keys(provider.endpoints).length === 0) {
        throw new TypeError(`provider ${provider.id}: endpoints is required`);
    }
    if (typeof provider.buildUrl !== "function" || typeof provider.parse !== "function") {
        throw new TypeError(`provider ${provider.id}: buildUrl and parse are required`);
    }
    return provider;
}

/**
 * Can this provider answer that question right now?
 * @param {object} provider
 * @param {{endpoint:string, params?:object, subject?:object|null}} request
 * @param {{env?:object}} [options]
 */
function prepareRequest(provider, request = {}, { env = process.env } = {}) {
    const endpoint = request.endpoint;
    if (!Object.prototype.hasOwnProperty.call(provider.endpoints, endpoint)) {
        const known = Object.keys(provider.endpoints).join(", ");
        return { ok: false, reason: `provider "${provider.id}" has no endpoint "${endpoint}" (known: ${known})` };
    }

    const config = providerConfig(provider.id);
    const apiKey = apiKeyFor(provider.id, env);
    if (config.apiKeyEnv && !apiKey) {
        return { ok: false, reason: `missing ${config.apiKeyEnv} for "${provider.id}"` };
    }

    const url = provider.buildUrl({
        endpoint,
        params: request.params || {},
        subject: request.subject || null,
        config,
        apiKey
    });
    if (typeof url !== "string" || url === "") {
        return { ok: false, reason: `"${provider.id}/${endpoint}" produced no URL for this request` };
    }

    return { ok: true, url, parse: "json", providerId: provider.id, endpoint, headers: provider.headers || {} };
}

/**
 * @param {object} [options] providers: extra/replacement provider objects
 */
function createProviderRegistry({ providers = DEFAULT_PROVIDERS } = {}) {
    const byId = new Map();

    function register(provider) {
        const checked = assertProvider(provider);
        byId.set(checked.id, checked);
        return checked.id;
    }

    for (const provider of providers) register(provider);

    function get(providerId) {
        const provider = byId.get(providerId);
        if (!provider) throw new RangeError(`unknown provider "${providerId}" (registered: ${[...byId.keys()].join(", ")})`);
        return provider;
    }

    return {
        register,
        has: (providerId) => byId.has(providerId),
        get,
        ids: () => [...byId.keys()],
        list: () => [...byId.values()],
        /** The questions this registry knows how to ask. */
        tasks() {
            return [...byId.values()].flatMap((provider) => Object.keys(provider.endpoints)
                .map((endpoint) => Object.freeze({ providerId: provider.id, endpoint })));
        },
        request(providerId, request = {}, options = {}) {
            return prepareRequest(get(providerId), request, options);
        },
        /**
         * Provider payload → normalised rows. Never throws: a payload that
         * does not look like what the provider promised is a value too.
         * @returns {{ok:boolean, rows:Array, reason:string|null}}
         */
        parse(providerId, data, request = {}) {
            const provider = get(providerId);
            const endpoint = request.endpoint;
            if (!Object.prototype.hasOwnProperty.call(provider.endpoints, endpoint)) {
                return { ok: false, rows: [], reason: `"${providerId}" has no endpoint "${endpoint}"` };
            }
            try {
                const rows = provider.parse({ endpoint, data, params: request.params || {}, subject: request.subject || null });
                if (!Array.isArray(rows)) {
                    return { ok: false, rows: [], reason: `"${providerId}/${endpoint}" produced no rows` };
                }
                return { ok: true, rows, reason: null };
            } catch (err) {
                return { ok: false, rows: [], reason: `"${providerId}/${endpoint}" could not be read: ${err && err.message ? err.message : err}` };
            }
        }
    };
}

module.exports = { DEFAULT_PROVIDERS, PROVIDER_KINDS, assertProvider, prepareRequest, createProviderRegistry };
