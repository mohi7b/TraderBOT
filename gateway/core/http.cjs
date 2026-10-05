/* ============================================================
 * File: gateway/core/http.cjs
 * Section: gateway/core (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   The translation layer, and the only place in this repository that knows
 *   what an HTTP status code is. Everything above it answers with the same
 *   `{ ok: true }` / `{ ok: false, code }` vocabulary identity and the vault
 *   already speak; everything below it is a socket. The mapping lives here so
 *   that no middleware has to invent a number, and so that one table can be
 *   read to see every answer this API is capable of giving.
 *
 *   Two rules in this file are deliberate and worth naming:
 *
 *     1. A refusal may not say everything the layer below said. Identity
 *        attributes a failed login to a user and a workspace — for the audit
 *        chain, never for the wire, because an answer that confirms an account
 *        exists is an oracle. `publicRefusal` is where that promise is kept,
 *        and it is kept in one place rather than at every refusal site.
 *
 *     2. A response is written once. `send` refuses to write a second time, so
 *        a late error handler cannot append a body to an answer already on the
 *        wire and turn a clean 404 into a corrupt reply.
 * ============================================================ */

const { CODES, refuse } = require("../../identity/core/errors.cjs");

/** A refusal the caller may see: its code and its own words, and nothing else. */
const WITHHELD = Object.freeze([
    "actorUserId",   /* who it was, for the chain */
    "workspaceId",   /* which tenant, for the chain */
    "meta",          /* the chain's private note on the entry */
    "value",         /* a secret in the clear */
    "ciphertext",    /* a secret sealed, which is just as sensitive */
    "passwordHash",
    "tokenHash",
    "access",
    "refresh"
]);

const STATUS_BY_CODE = Object.freeze({
    /* the door's own refusals */
    [CODES.BAD_REQUEST]: 400,
    [CODES.BAD_ENTRY]: 400,
    [CODES.BODY_TOO_LARGE]: 413,
    [CODES.RATE_LIMITED]: 429,
    [CODES.NO_ROUTE]: 404,
    [CODES.WRONG_METHOD]: 405,
    [CODES.INTERNAL_ERROR]: 500,

    /* identity's, unchanged: the door does not re-name them */
    [CODES.INVALID_EMAIL]: 400,
    [CODES.WEAK_PASSWORD]: 400,
    [CODES.EMAIL_TAKEN]: 409,
    [CODES.USER_NOT_FOUND]: 404,
    [CODES.INVALID_CREDENTIALS]: 401,
    [CODES.USER_DISABLED]: 403,
    [CODES.TOKEN_MISSING]: 401,
    [CODES.TOKEN_INVALID]: 401,
    [CODES.TOKEN_EXPIRED]: 401,
    [CODES.REFRESH_MISSING]: 400,
    [CODES.REFRESH_INVALID]: 401,
    [CODES.REFRESH_EXPIRED]: 401,
    [CODES.REFRESH_REUSE]: 401,
    [CODES.WORKSPACE_NOT_FOUND]: 404,
    [CODES.NO_MEMBERSHIP]: 403,
    [CODES.TENANT_MISMATCH]: 403,
    [CODES.FORBIDDEN]: 403,
    [CODES.UNKNOWN_ROLE]: 400,
    [CODES.OUTRANKED]: 403,
    [CODES.LAST_OWNER]: 403,
    [CODES.ALREADY_MEMBER]: 409,
    [CODES.NOT_A_MEMBER]: 409,
    [CODES.MEMBER_LIMIT]: 409,

    /* the vault's */
    [CODES.SECRET_NOT_FOUND]: 404,
    [CODES.SECRET_REVOKED]: 409,
    [CODES.PROVIDER_UNKNOWN]: 400,
    [CODES.BAD_KEY]: 422,

    /* wiring bugs. If one of these ever reaches a caller it is this layer
     * failing, not the caller asking badly — so it answers 500 and says so. */
    [CODES.NO_DB]: 500,
    [CODES.NO_CLOCK]: 500,
    [CODES.NO_SECRET]: 500,
    [CODES.SECRET_TOO_SHORT]: 500,
    [CODES.NO_KEY]: 500,
    [CODES.NO_VAULT_KEY]: 501,
    [CODES.UNKNOWN_PERMISSION]: 500
});

/** What a caller is told about a refusal: enough to act, never enough to probe. */
function publicRefusal(result) {
    const body = { ok: false, code: result.code, message: result.message || "" };
    for (const [key, value] of Object.entries(result)) {
        if (key === "ok" || key === "code" || key === "message") continue;
        if (WITHHELD.includes(key)) continue;
        body[key] = value;
    }
    return Object.freeze(body);
}

function statusFor(code) {
    return STATUS_BY_CODE[code] || 500;
}

/** `Bearer x` and nothing else. A scheme this API does not speak is not a token. */
function credentialsOf(req, header) {
    const raw = req.headers[header];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
        return Object.freeze({ present: false, scheme: null, token: null });
    }
    const value = String(raw).trim();
    const space = value.indexOf(" ");
    if (space < 0) return Object.freeze({ present: true, scheme: value, token: null });
    const scheme = value.slice(0, space);
    const token = value.slice(space + 1).trim();
    return Object.freeze({
        present: true,
        scheme,
        token: scheme.toLowerCase() === "bearer" && token.length > 0 ? token : null
    });
}

/** The socket's peer, or the first hop of a forwarded chain a deployment trusts. */
function addressOf(req, { trustProxy = false } = {}) {
    if (trustProxy) {
        const forwarded = req.headers["x-forwarded-for"];
        if (forwarded) {
            const first = String(forwarded).split(",")[0].trim();
            if (first.length > 0) return first;
        }
    }
    const address = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
    /* IPv4-mapped IPv6 is one caller, not two: `::ffff:127.0.0.1` is `127.0.0.1`. */
    return address.startsWith("::ffff:") ? address.slice(7) : address;
}

/** The path, decoded a segment at a time, or a refusal if it was never a path. */
function pathOf(url) {
    const raw = String(url || "/");
    const cut = raw.indexOf("?");
    const pathname = cut < 0 ? raw : raw.slice(0, cut);
    const queryText = cut < 0 ? "" : raw.slice(cut + 1);

    const segments = [];
    for (const segment of pathname.split("/")) {
        if (segment === "") continue;
        try {
            segments.push(decodeURIComponent(segment));
        } catch {
            return refuse(CODES.BAD_REQUEST, "the path was not percent-encoded correctly");
        }
    }

    const query = {};
    for (const pair of queryText.split("&")) {
        if (pair === "") continue;
        const equals = pair.indexOf("=");
        const key = equals < 0 ? pair : pair.slice(0, equals);
        const value = equals < 0 ? "" : pair.slice(equals + 1);
        try {
            const name = decodeURIComponent(key.replace(/\+/g, " "));
            if (!(name in query)) query[name] = decodeURIComponent(value.replace(/\+/g, " "));
        } catch {
            return refuse(CODES.BAD_REQUEST, "the query string was not percent-encoded correctly");
        }
    }

    return { ok: true, path: `/${segments.join("/")}`, segments, query: Object.freeze(query) };
}

/**
 * The whole body, or a refusal — never a truncated one. A body that grows past
 * the ceiling stops being read at the ceiling and is answered as too large,
 * which is the difference between a door and a shredder.
 */
function readBody(req, { maxBytes }) {
    return new Promise((resolve) => {
        const chunks = [];
        let length = 0;
        let settled = false;

        const done = (result) => {
            if (settled) return;
            settled = true;
            req.removeListener("data", onData);
            req.removeListener("end", onEnd);
            req.removeListener("error", onError);
            req.removeListener("aborted", onAborted);
            resolve(result);
        };

        function onData(chunk) {
            length += chunk.length;
            if (length > maxBytes) {
                done(refuse(CODES.BODY_TOO_LARGE, `a body is at most ${maxBytes} bytes`));
                return;
            }
            chunks.push(chunk);
        }

        const onEnd = () => done({ ok: true, text: Buffer.concat(chunks).toString("utf8"), bytes: length });
        const onError = () => done(refuse(CODES.BAD_REQUEST, "the body could not be read"));
        const onAborted = () => done(refuse(CODES.BAD_REQUEST, "the request ended before its body did"));

        req.on("data", onData);
        req.on("end", onEnd);
        req.on("error", onError);
        req.on("aborted", onAborted);
    });
}

/** JSON in, object out. An empty body is an empty object, not an error. */
async function readJson(req, { maxBytes }) {
    const raw = await readBody(req, { maxBytes });
    if (!raw.ok) return raw;
    if (raw.text.trim() === "") return { ok: true, body: Object.freeze({}), bytes: 0 };

    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (type !== "" && !type.includes("application/json") && !type.includes("+json")) {
        return refuse(CODES.BAD_REQUEST, "the body of a write is JSON");
    }

    let parsed;
    try {
        parsed = JSON.parse(raw.text);
    } catch {
        return refuse(CODES.BAD_REQUEST, "the body was not JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return refuse(CODES.BAD_REQUEST, "a body is a JSON object of fields");
    }
    return { ok: true, body: Object.freeze(parsed), bytes: raw.bytes };
}

const answered = new WeakSet();

/** Drain whatever is left of the request so a keep-alive socket stays usable. */
function drain(req) {
    if (typeof req.resume === "function") req.resume();
}

/** One response, once. Returns false if this response already has a body. */
function send(res, { status, body, headers = {} }) {
    if (answered.has(res) || res.writableEnded) return false;
    answered.add(res);

    const text = JSON.stringify(body === undefined ? null : body);
    const payload = Buffer.from(text, "utf8");
    const all = {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(payload.length),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...headers
    };

    for (const [name, value] of Object.entries(all)) {
        if (value !== undefined && value !== null) res.setHeader(name, value);
    }
    res.writeHead(status);
    res.end(payload);
    return true;
}

function alreadyAnswered(res) {
    return answered.has(res);
}

module.exports = {
    WITHHELD,
    STATUS_BY_CODE,
    publicRefusal,
    statusFor,
    credentialsOf,
    addressOf,
    pathOf,
    readBody,
    readJson,
    drain,
    send,
    alreadyAnswered
};
