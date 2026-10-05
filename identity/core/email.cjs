/* ============================================================
 * File: identity/core/email.cjs
 * Section: identity/core
 * Version: 1.0.0
 *
 * Role:
 *   An address, canonicalised once, so that "A@Example.com" and
 *   "a@example.com" cannot become two accounts — the same reason
 *   `execution-engine` canonicalises a symbol before it judges it.
 *
 *   The normal form is what gets the UNIQUE index; the written form is what
 *   the person sees. Nothing here is clever: no plus-tag stripping, no
 *   Gmail dots, because a system that silently rewrites an address owns a
 *   mailbox it does not own.
 * ============================================================ */

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function isPlainString(value) {
    return typeof value === "string" && value.length > 0;
}

/** The address as written, trimmed — or null when it is not an address at all. */
function normalizeEmail(value) {
    if (!isPlainString(value)) return null;
    const trimmed = value.trim();
    if (!trimmed.length || trimmed.length > MAX_EMAIL_LENGTH) return null;
    const at = trimmed.lastIndexOf("@");
    if (at <= 0 || at === trimmed.length - 1) return null;
    if (trimmed.slice(0, at).length > MAX_LOCAL_LENGTH) return null;
    if (!EMAIL_PATTERN.test(trimmed)) return null;
    return trimmed;
}

/** What the UNIQUE index holds: the same address, one spelling. */
function canonicalEmail(value) {
    const normalized = normalizeEmail(value);
    return normalized ? normalized.toLowerCase() : null;
}

function isEmail(value) {
    return normalizeEmail(value) !== null;
}

/** A workspace slug: lowercase, dashes, never empty, never a path. */
function slugify(value, fallback = "workspace") {
    const source = isPlainString(value) ? value : "";
    const slug = source
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return slug || fallback;
}

module.exports = { normalizeEmail, canonicalEmail, isEmail, slugify, MAX_EMAIL_LENGTH };
