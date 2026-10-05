/* ============================================================
 * File: identity/core/password.cjs
 * Section: identity/core
 * Version: 1.0.0
 *
 * Role:
 *   A password is never stored, only the cost of guessing it.
 *
 *   Why scrypt and not argon2id/bcrypt (the roadmap's first choice): neither
 *   is installed on this box and argon2 needs a native build; Node 20 ships
 *   scrypt, which is memory-hard, and OWASP accepts it. Measured here
 *   (Node 20.20.2): N=2^15 → 77ms, N=2^17 → 301ms. The interactive login
 *   path uses 2^15; the parameters travel INSIDE the hash string, so a hash
 *   written today is still verifiable after the cost is raised
 *   (`needsRehash` is how the upgrade happens, on the next successful login).
 *
 *   `maxmem` is not optional: scrypt needs 128*N*r bytes = 33.5MB at 2^15,
 *   which is exactly over Node's 32MB default. Leaving it out is the classic
 *   "works on my parameters" bug.
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, refuse } = require("./errors.cjs");

const ALGORITHM = "scrypt";
const PARAMETERS = Object.freeze({ N: 1 << 15, r: 8, p: 1, keylen: 32, saltBytes: 16 });
const MAXMEM = 64 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 1024;
const PARTS = 6;

let dummy = null;

function encode({ N, r, p }, salt, hash) {
    return [ALGORITHM, N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

/**
 * Read a hash back, including its own cost parameters. Returns null for
 * anything that is not one of ours — a malformed hash is never a match.
 */
function parse(encoded) {
    if (typeof encoded !== "string") return null;
    const parts = encoded.split("$");
    if (parts.length !== PARTS) return null;

    const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = parts;
    if (algorithm !== ALGORITHM) return null;

    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (!Number.isInteger(N) || N < 1 << 12 || N > 1 << 20 || (N & (N - 1)) !== 0) return null;
    if (!Number.isInteger(r) || r < 1 || r > 32) return null;
    if (!Number.isInteger(p) || p < 1 || p > 16) return null;

    const salt = Buffer.from(rawSalt, "base64url");
    const hash = Buffer.from(rawHash, "base64url");
    if (salt.length < 8 || hash.length < 16) return null;

    return Object.freeze({ N, r, p, salt, hash });
}

function costOf(encoded) {
    const parsed = parse(encoded);
    return parsed ? { N: parsed.N, r: parsed.r, p: parsed.p, keylen: parsed.hash.length } : null;
}

function derive(password, parsed, keylen) {
    return crypto.scryptSync(password, parsed.salt, keylen, {
        N: parsed.N,
        r: parsed.r,
        p: parsed.p,
        maxmem: MAXMEM
    });
}

/** A password worth hashing — or the refusal that says why it is not. */
function checkPassword(password, options = {}) {
    const minLength = Number(options.minLength) > 0 ? Number(options.minLength) : MIN_PASSWORD_LENGTH;

    if (typeof password !== "string") {
        return refuse(CODES.WEAK_PASSWORD, "a password is a string", { detail: "not-a-string" });
    }
    if ([...password].length < minLength) {
        return refuse(CODES.WEAK_PASSWORD, `a password is at least ${minLength} characters`, {
            detail: "too-short",
            minLength
        });
    }
    if (password.trim().length === 0) {
        return refuse(CODES.WEAK_PASSWORD, "a password is not only spaces", { detail: "blank" });
    }
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
        return refuse(CODES.WEAK_PASSWORD, `a password is at most ${MAX_PASSWORD_BYTES} bytes`, {
            detail: "too-long"
        });
    }
    return null;
}

/**
 * Hash a password. Returns `{ ok: true, encoded }` or the refusal from
 * `checkPassword` — never a hash of a password the rules already rejected.
 */
function hashPassword(password, options = {}) {
    const problem = checkPassword(password, options);
    if (problem) return problem;

    const parameters = { ...PARAMETERS, ...(options.parameters || {}) };
    const salt = crypto.randomBytes(parameters.saltBytes);
    const hash = crypto.scryptSync(password, salt, parameters.keylen, {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: MAXMEM
    });

    return Object.freeze({ ok: true, encoded: encode(parameters, salt, hash), algorithm: ALGORITHM });
}

/**
 * Verify against a stored hash, in constant time. A hash we cannot parse, or
 * a password that is not a string, is `false` — never an exception, and never
 * a truthy accident.
 */
function verifyPassword(password, encoded) {
    const parsed = parse(encoded);
    if (!parsed) return false;
    if (typeof password !== "string" || !password.length) return false;

    let candidate;
    try {
        candidate = derive(password, parsed, parsed.hash.length);
    } catch (error) {
        return false;
    }
    if (candidate.length !== parsed.hash.length) return false;
    return crypto.timingSafeEqual(candidate, parsed.hash);
}

/** True when the stored hash is older/cheaper than what the layer now writes. */
function needsRehash(encoded, options = {}) {
    const parsed = parse(encoded);
    if (!parsed) return true;

    const target = { ...PARAMETERS, ...(options.parameters || {}) };
    return (
        parsed.N < target.N ||
        parsed.r !== target.r ||
        parsed.p !== target.p ||
        parsed.hash.length !== target.keylen
    );
}

/**
 * A hash of a password nobody has, for the unknown-address path: verifying
 * against nothing still costs what verifying against something costs, so a
 * login attempt cannot discover which addresses exist by timing it.
 */
function dummyHash() {
    if (!dummy) {
        const salt = Buffer.alloc(PARAMETERS.saltBytes, 7);
        const hash = crypto.scryptSync("no-such-password", salt, PARAMETERS.keylen, {
            N: PARAMETERS.N,
            r: PARAMETERS.r,
            p: PARAMETERS.p,
            maxmem: MAXMEM
        });
        dummy = encode(PARAMETERS, salt, hash);
    }
    return dummy;
}

function isPasswordHash(value) {
    return parse(value) !== null;
}

module.exports = {
    ALGORITHM,
    PARAMETERS,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_BYTES,
    checkPassword,
    hashPassword,
    verifyPassword,
    needsRehash,
    dummyHash,
    isPasswordHash,
    costOf,
    parse
};
