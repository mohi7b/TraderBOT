/* ============================================================
 * File: identity/core/tokens.cjs
 * Section: identity/core
 * Version: 1.0.0
 *
 * Role:
 *   Two kinds of proof, and the difference between them is the point:
 *
 *     an ACCESS token   a signed, self-describing fact ("this user, in this
 *                       workspace, with this role, until this second"). It is
 *                       verified without touching the database, and it is
 *                       short-lived because it cannot be recalled.
 *     a REFRESH token   opaque random bytes. It says nothing at all, so it
 *                       cannot be forged into a fact; the database is the
 *                       only thing that can recognise it (by its SHA-256).
 *
 *   HS256 by hand (`createHmac` + `timingSafeEqual`) because `jsonwebtoken`
 *   and `jose` are not installed and the roadmap allows zero new
 *   dependencies — the algorithm is 40 lines and the hard part is not the
 *   signing, it is refusing everything else:
 *
 *     - the signature is checked BEFORE any claim is read, so an unsigned
 *       payload is never trusted even for an instant;
 *     - `alg` is pinned, so `alg: "none"` and an algorithm swap are both a
 *       plain `token-invalid`;
 *     - every segment must round-trip through base64url, so whitespace,
 *       padding tricks and non-canonical encodings are refused;
 *     - `exp`/`nbf`/`iat` come from the INJECTED clock, never `Date.now()`.
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, refuse, fail } = require("./errors.cjs");

const ALGORITHM = "HS256";
const ACCESS_TYPE = "access";
const MIN_SECRET_BYTES = 32;
const DEFAULT_TTL_SEC = 15 * 60;
const DEFAULT_SKEW_SEC = 30;
const SEGMENTS = 3;
const OPAQUE_BYTES = 32;

function encodeSegment(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Canonical base64url JSON, or null. A padded or spaced segment is not one. */
function decodeSegment(segment) {
    if (typeof segment !== "string" || !segment.length) return null;
    let buffer;
    try {
        buffer = Buffer.from(segment, "base64url");
    } catch (error) {
        return null;
    }
    if (buffer.toString("base64url") !== segment) return null;
    try {
        const value = JSON.parse(buffer.toString("utf8"));
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (error) {
        return null;
    }
}

/** Random bytes that mean nothing — the refresh token's whole body. */
function createOpaqueToken() {
    return crypto.randomBytes(OPAQUE_BYTES).toString("base64url");
}

/** What the database stores instead of the token itself. */
function hashToken(token) {
    return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function createSigner(options = {}) {
    const {
        secret,
        keyId = "k1",
        now,
        ttlSec = DEFAULT_TTL_SEC,
        skewSec = DEFAULT_SKEW_SEC,
        issuer = "traderbot"
    } = options;

    if (typeof secret !== "string" && !Buffer.isBuffer(secret)) {
        fail(CODES.NO_SECRET, "a signing secret is required");
    }
    const key = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8");
    if (key.length < MIN_SECRET_BYTES) {
        fail(CODES.SECRET_TOO_SHORT, `a signing secret is at least ${MIN_SECRET_BYTES} bytes`);
    }
    if (typeof now !== "function") {
        fail(CODES.NO_CLOCK, "a clock is injected, never read");
    }

    const state = { signed: 0, verified: 0 };

    function signature(payload) {
        return crypto.createHmac("sha256", key).update(payload).digest("base64url");
    }

    function seconds() {
        return Math.floor(now() / 1000);
    }

    function ttlOf(overrides) {
        return Number.isFinite(overrides.ttlSec) ? Number(overrides.ttlSec) : ttlSec;
    }

    /**
     * Sign one access token. `claims` are merged first, so a caller sets
     * `sub`/`wid`/`role`/`jti`; `iss`/`typ`/`iat`/`exp` are this layer's to
     * decide and cannot be overridden by a caller.
     */
    function sign(claims = {}, overrides = {}) {
        const at = seconds();
        const header = { alg: ALGORITHM, typ: "JWT", kid: keyId };
        const body = {
            ...claims,
            iss: issuer,
            typ: ACCESS_TYPE,
            kid: keyId,
            iat: at,
            exp: at + ttlOf(overrides),
            jti: claims.jti || crypto.randomUUID()
        };

        const head = encodeSegment(header);
        const payload = encodeSegment(body);
        state.signed += 1;

        return `${head}.${payload}.${signature(`${head}.${payload}`)}`;
    }

    /** When a token signed right now would expire — the session row's twin. */
    function expiresAt(overrides = {}) {
        return now() + ttlOf(overrides) * 1000;
    }

    /**
     * Verify one access token. The signature is checked first, on the raw
     * segments, before a single claim is parsed — an unsigned payload is never
     * trusted, not even for an instant. Returns `{ ok: true, claims, header }`
     * or a refusal naming exactly what was wrong.
     */
    function verify(token) {
        if (typeof token !== "string" || !token.trim().length) {
            return refuse(CODES.TOKEN_MISSING, "an access token is required");
        }

        const parts = token.trim().split(".");
        if (parts.length !== SEGMENTS || parts.some((part) => !part.length)) {
            return refuse(CODES.TOKEN_INVALID, "an access token has three segments");
        }

        const [head, payload, given] = parts;
        const expected = crypto.createHmac("sha256", key).update(`${head}.${payload}`).digest();
        const presented = Buffer.from(given, "base64url");
        if (presented.length !== expected.length || !crypto.timingSafeEqual(expected, presented)) {
            return refuse(CODES.TOKEN_INVALID, "the signature does not match");
        }

        const header = decodeSegment(head);
        const claims = decodeSegment(payload);
        if (!header || !claims) {
            return refuse(CODES.TOKEN_INVALID, "a segment is not canonical base64url JSON");
        }
        if (header.alg !== ALGORITHM) {
            return refuse(CODES.TOKEN_INVALID, `alg must be ${ALGORITHM}`, { alg: header.alg ?? null });
        }
        if (header.kid !== keyId) {
            return refuse(CODES.TOKEN_INVALID, "this key is not the one that signed it", { kid: header.kid ?? null });
        }
        if (claims.iss !== issuer) {
            return refuse(CODES.TOKEN_INVALID, "the issuer is not this gateway's");
        }
        if (claims.typ !== ACCESS_TYPE) {
            return refuse(CODES.TOKEN_INVALID, "only an access token is accepted here", { typ: claims.typ ?? null });
        }

        const at = seconds();
        if (!Number.isFinite(claims.exp)) {
            return refuse(CODES.TOKEN_INVALID, "a token without an expiry is not a token");
        }
        if (at > claims.exp + skewSec) {
            return refuse(CODES.TOKEN_EXPIRED, "the access token has expired", { expiredAt: claims.exp * 1000 });
        }
        if (Number.isFinite(claims.nbf) && at + skewSec < claims.nbf) {
            return refuse(CODES.TOKEN_INVALID, "the access token is not valid yet");
        }
        if (Number.isFinite(claims.iat) && claims.iat > at + skewSec) {
            return refuse(CODES.TOKEN_INVALID, "the access token was issued in the future");
        }

        state.verified += 1;
        return Object.freeze({
            ok: true,
            claims: Object.freeze({ ...claims }),
            header: Object.freeze({ ...header })
        });
    }

    return Object.freeze({
        sign,
        verify,
        expiresAt,
        alg: ALGORITHM,
        keyId,
        issuer,
        ttlSec,
        counts: () => Object.freeze({ signed: state.signed, verified: state.verified })
    });
}

module.exports = {
    createSigner,
    createOpaqueToken,
    hashToken,
    ALGORITHM,
    ACCESS_TYPE,
    MIN_SECRET_BYTES,
    DEFAULT_TTL_SEC,
    DEFAULT_SKEW_SEC
};
