/* ============================================================
 * File: secrets/core/cipher.cjs
 * Section: secrets/core (Phase 5 — the vault)
 * Version: 1.0.0
 *
 * Role:
 *   One room, one lock. AES-256-GCM, an authenticated mode, so a value that was
 *   edited in the database does not come back wrong — it does not come back at
 *   all. `seal` and `open` are the only two ways in, and the key never leaves
 *   this file.
 *
 *   A key is either 32 raw bytes (the deployment case: material from a KMS, or
 *   read once from the environment) or a passphrase with a salt (the local
 *   case), stretched with scrypt — the same KDF the password layer uses, so
 *   there is one story about deriving key material in this repository.
 *
 *   The cost of a failure is asymmetric, and the format says so out loud: a
 *   wrong key, a flipped byte in the database and a value written by another
 *   vault all come back as the SAME refusal (`bad-key`). Which of the three it
 *   was is not something a caller — or someone holding the database file —
 *   gets to learn from this layer.
 *
 *   What this file does not do is promise more than a scripting runtime can
 *   keep: a plaintext `string` cannot be wiped from the heap in V8, so `open`
 *   hands one back and the caller decides how long it lives. The intermediate
 *   buffers this file makes are wiped; the returned string is not pretended to
 *   be.
 *
 * Run: node secrets/tests/vault.test.cjs
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, refuse, accept, fail } = require("../../identity/core/errors.cjs");

const ALGORITHM = "aes-256-gcm";
const PREFIX = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const MIN_PASSPHRASE = 32;
const SCRYPT = Object.freeze({ N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/** base64url, because the whole sealed value has to survive a TEXT column. */
const b64 = (buffer) => buffer.toString("base64url");

/**
 * Node's base64url decoder is forgiving — it will accept `%%%%` as `""` — so a
 * decode is only trusted when it round-trips back to exactly what came in.
 */
function tryDecode(text) {
    if (typeof text !== "string" || text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
    const buffer = Buffer.from(text, "base64url");
    return b64(buffer) === text ? buffer : null;
}

/** `v1$iv$tag$body`, or `null` when the text is not this format at all. */
function split(sealed) {
    if (typeof sealed !== "string") return null;
    const parts = sealed.split("$");
    if (parts.length !== 4 || parts[0] !== PREFIX) return null;

    const iv = tryDecode(parts[1]);
    const tag = tryDecode(parts[2]);
    const body = tryDecode(parts[3]);
    if (!iv || !tag || !body) return null;
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || body.length < 1) return null;

    return [iv, tag, body];
}

/**
 * A key, as 32 bytes of AES-256 material. Raw bytes are taken as given; a
 * passphrase is never a key on its own, so it is stretched against a salt.
 */
function resolveKey(key, salt) {
    if (Buffer.isBuffer(key)) {
        if (key.length !== KEY_BYTES) {
            fail(CODES.NO_VAULT_KEY, `a raw vault key is exactly ${KEY_BYTES} bytes of AES-256 material`);
        }
        return { material: Buffer.from(key), derived: "raw" };
    }

    if (typeof key === "string") {
        if (key.length < MIN_PASSPHRASE) {
            fail(CODES.NO_VAULT_KEY, `a vault passphrase is at least ${MIN_PASSPHRASE} characters, or the key is ${KEY_BYTES} raw bytes`);
        }
        if (!Buffer.isBuffer(salt) || salt.length < SALT_BYTES) {
            fail(CODES.NO_VAULT_KEY, `a passphrase is stretched with a salt of at least ${SALT_BYTES} bytes`);
        }
        return { material: crypto.scryptSync(key, salt, KEY_BYTES, SCRYPT), derived: "scrypt" };
    }

    fail(CODES.NO_VAULT_KEY, `the vault is given ${KEY_BYTES} raw bytes, or a passphrase and a salt`);
}

/**
 * The lock. `id` is a fingerprint of the key and not the key: it is what a
 * rotation log names and what a stored row records, so a value sealed under an
 * older key can be recognised as such without ever showing the key.
 */
function createCipher(options = {}) {
    const { key, salt, keyId } = options;
    const { material, derived } = resolveKey(key, salt);

    const id = typeof keyId === "string" && keyId.length > 0
        ? keyId
        : crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);

    /** Plaintext in, one self-describing string out. */
    function seal(plaintext) {
        if (typeof plaintext !== "string" || plaintext.length === 0) {
            fail(CODES.BAD_ENTRY, "a secret is a non-empty string");
        }

        const iv = crypto.randomBytes(IV_BYTES);
        const cipher = crypto.createCipheriv(ALGORITHM, material, iv);
        const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const sealed = [PREFIX, b64(iv), b64(cipher.getAuthTag()), b64(body)].join("$");

        body.fill(0);
        iv.fill(0);

        return sealed;
    }

    /**
     * One string in, the value or a refusal out. Every failure is the same
     * failure, on purpose: the tag decided, and this file adds no hint about
     * which of the ways it was.
     */
    function open(sealed) {
        const parts = split(sealed);
        if (!parts) {
            return refuse(CODES.BAD_KEY, "this is not a sealed value in a format this vault writes");
        }

        const [iv, tag, body] = parts;
        try {
            const decipher = crypto.createDecipheriv(ALGORITHM, material, iv);
            decipher.setAuthTag(tag);
            const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
            const value = plaintext.toString("utf8");
            plaintext.fill(0);
            return accept({ value });
        } catch {
            return refuse(CODES.BAD_KEY, "the sealed value did not authenticate against this key");
        }
    }

    return Object.freeze({
        id,
        algorithm: ALGORITHM,
        prefix: PREFIX,
        derived,
        keyBytes: KEY_BYTES,
        seal,
        open
    });
}

module.exports = {
    createCipher,
    resolveKey,
    ALGORITHM,
    PREFIX,
    KEY_BYTES,
    IV_BYTES,
    TAG_BYTES,
    SALT_BYTES,
    MIN_PASSPHRASE
};

