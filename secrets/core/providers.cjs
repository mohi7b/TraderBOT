/* ============================================================
 * File: secrets/core/providers.cjs
 * Section: secrets/core (Phase 5 — the vault)
 * Version: 1.0.0
 *
 * Role:
 *   Which venues the vault is allowed to hold a key for. A credential is
 *   addressed as `provider:label` — `binance:main`, `okx:paper` — and a
 *   provider that is not on this list is refused with `provider-unknown`
 *   instead of quietly stored, so a typo in a route cannot create a second,
 *   unreachable copy of a live exchange key.
 *
 *   The list is the same canonical order the collector and the venue adapters
 *   already use (`collector/crypto/derivatives/config/derivatives.cjs`,
 *   `collector/crypto/realtime/config/exchanges.cjs`): five venues, spelled the
 *   way they are spelled everywhere else in this repository. It is a default
 *   and not a law — `createVault({ providers })` takes its own list, which is
 *   how an integration test names a venue that does not exist yet.
 * ============================================================ */

const PROVIDERS = Object.freeze(["binance", "bybit", "bitget", "kucoin", "okx"]);

/** Labels are namespaced inside a provider, so one venue can hold several keys. */
const DEFAULT_LABEL = "default";

function isProvider(id, providers = PROVIDERS) {
    return typeof id === "string" && providers.includes(id);
}

function isLabel(label) {
    return typeof label === "string" && /^[a-z0-9][a-z0-9._-]{0,31}$/.test(label);
}

module.exports = { PROVIDERS, DEFAULT_LABEL, isProvider, isLabel };
