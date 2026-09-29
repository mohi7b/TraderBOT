/* ============================================================
 * File: collector/liquidity_6markets/providers/index.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   The provider registry, and the one place where "which URL do I call
 *   for this instrument" is decided. Everything else in the module asks
 *   the registry for a *prepared request*:
 *
 *     { ok: true, url, parse: "json"|"text", providerSymbol }
 *     { ok: false, reason: "..." }        ← missing key / unknown symbol
 *
 *   That single seam is what makes the module testable without a network
 *   and extensible without touching the collector: a new venue is a
 *   provider object plus one line in DEFAULT_PROVIDERS.
 * ============================================================ */

const yahoo = require("./yahoo.cjs");
const stooq = require("./stooq.cjs");
const twelvedata = require("./twelvedata.cjs");
const alphavantage = require("./alphavantage.cjs");
const fred = require("./fred.cjs");
const binance = require("./binance.cjs");
const okx = require("./okx.cjs");

const { providerConfig, apiKeyFor } = require("../config/providers.cjs");
const { symbolFor } = require("../core/instrument.cjs");

const DEFAULT_PROVIDERS = Object.freeze([yahoo, stooq, twelvedata, alphavantage, fred, binance, okx]);

const PROVIDER_KINDS = Object.freeze(["json", "csv"]);

function assertProvider(provider) {
    if (!provider || typeof provider.id !== "string" || provider.id.trim() === "") {
        throw new TypeError("provider.id is required");
    }
    if (!PROVIDER_KINDS.includes(provider.kind)) {
        throw new RangeError(`provider ${provider.id}: kind must be one of ${PROVIDER_KINDS.join("|")}`);
    }
    if (typeof provider.buildUrl !== "function" || typeof provider.parse !== "function") {
        throw new TypeError(`provider ${provider.id}: buildUrl and parse are required`);
    }
    return provider;
}

/** Can this provider serve that instrument at all? (key + spelling) */
function prepareRequest(provider, instrument, { env = process.env } = {}) {
    const providerSymbol = symbolFor(instrument, provider.id);
    if (providerSymbol === null) return { ok: false, reason: `"${provider.id}" cannot quote ${instrument.id}` };

    const config = providerConfig(provider.id);
    const apiKey = apiKeyFor(provider.id, env);
    if (config.apiKeyEnv && !apiKey) return { ok: false, reason: `missing ${config.apiKeyEnv} for "${provider.id}"` };

    const url = provider.buildUrl(instrument, { providerSymbol, apiKey, config });
    if (typeof url !== "string" || url === "") return { ok: false, reason: `"${provider.id}" produced no URL` };

    return { ok: true, url, parse: provider.kind === "csv" ? "text" : "json", providerSymbol, providerId: provider.id };
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

    return {
        register,
        has: (providerId) => byId.has(providerId),
        get(providerId) {
            const provider = byId.get(providerId);
            if (!provider) throw new RangeError(`unknown provider "${providerId}" (registered: ${[...byId.keys()].join(", ")})`);
            return provider;
        },
        ids: () => [...byId.keys()],
        list: () => [...byId.values()],
        /** Providers that carry the given asset class (from config/providers.cjs). */
        forAssetClass(assetClass) {
            return [...byId.values()].filter((provider) => {
                const config = providerConfig(provider.id);
                return !config.markets || config.markets.includes(assetClass);
            });
        },
        request(providerId, instrument, options = {}) {
            const provider = byId.get(providerId);
            if (!provider) throw new RangeError(`unknown provider "${providerId}" (registered: ${[...byId.keys()].join(", ")})`);
            return prepareRequest(provider, instrument, options);
        }
    };
}

module.exports = { DEFAULT_PROVIDERS, PROVIDER_KINDS, assertProvider, prepareRequest, createProviderRegistry };
