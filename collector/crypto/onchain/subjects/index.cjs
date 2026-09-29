/* ============================================================
 * File: collector/crypto/onchain/subjects/index.cjs
 * Section: collector/crypto/onchain/subjects
 * Version: 1.0.0
 *
 * Role:
 *   The subject catalog: the four groups (chains, holders, stablecoins,
 *   funds) and the subjects inside each. A catalog is data, not behaviour —
 *   a test or a single-group deployment can build one with a subset, and
 *   "how much do we actually cover" is `coverage()` rather than a claim in
 *   a comment.
 *
 *   Every subject id is unique across all groups, so a reading can never be
 *   ambiguous about what it is about.
 * ============================================================ */

const chains = require("./chains.cjs");
const holders = require("./holders.cjs");
const stablecoins = require("./stablecoins.cjs");
const funds = require("./funds.cjs");

/** The groups, in the order the module grows: measure → custody → plumbing → funds. */
const SUBJECT_GROUPS = Object.freeze([chains, holders, stablecoins, funds]);

/** Directory ids (also the provenance words). */
const GROUP_IDS = Object.freeze(SUBJECT_GROUPS.map((group) => group.GROUP_ID));

/**
 * @param {object} [options]
 * @param {Array} [options.groups]      group modules (default: all four)
 * @param {Array} [options.subjects]    extra subjects to append
 */
function createSubjectCatalog({ groups = SUBJECT_GROUPS, subjects = [] } = {}) {
    const groupList = groups.map((group) => Object.freeze({
        id: group.GROUP_ID,
        kind: group.SUBJECT_KIND,
        subjects: Object.freeze(group.SUBJECTS)
    }));

    const all = [];
    for (const group of groupList) all.push(...group.subjects);
    all.push(...subjects);

    const byId = new Map();
    for (const subject of all) {
        if (byId.has(subject.id)) throw new Error(`duplicate subject id "${subject.id}"`);
        byId.set(subject.id, subject);
    }

    return {
        groups: () => groupList.map((group) => group.id),
        groupModules: () => groupList,
        subjects: () => all,
        ids: () => [...byId.keys()],
        size: () => byId.size,
        has: (id) => byId.has(id),
        get(id) {
            const subject = byId.get(id);
            if (!subject) throw new RangeError(`unknown subject "${id}"`);
            return subject;
        },
        find(id) {
            return byId.get(id) || null;
        },
        /** Subjects of one group (by directory id or by kind). */
        ofGroup(groupId) {
            const group = groupList.find((entry) => entry.id === groupId || entry.kind === groupId);
            return group ? [...group.subjects] : [];
        },
        ofKind(kind) {
            return all.filter((subject) => subject.kind === kind);
        },
        /** Counts per group — the honest version of "we cover everything". */
        coverage() {
            return groupList.map((group) => Object.freeze({
                group: group.id,
                kind: group.kind,
                subjects: group.subjects.length,
                providers: new Set(group.subjects.flatMap((subject) => Object.keys(subject.symbols))).size
            }));
        }
    };
}

/** The default catalog: one chain, twelve holders, eight stablecoins, fifteen funds. */
function defaultCatalog() {
    return createSubjectCatalog();
}

module.exports = { SUBJECT_GROUPS, GROUP_IDS, createSubjectCatalog, defaultCatalog };
