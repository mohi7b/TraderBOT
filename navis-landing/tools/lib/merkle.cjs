#!/usr/bin/env node
/*
 * Merkle helper for the Vesting claim campaigns.
 *
 *   leaf      = keccak256(bytes.concat(keccak256(abi.encode(uint256 campaignId,
 *                                                          address account,
 *                                                          uint256 amount))))
 *   hashPair  = keccak256(sorted(a, b))            <- OpenZeppelin convention
 *   tree      = sorted leaves, odd node duplicated at every level
 *
 * The three facts above are the *contract* side of the campaigns: they mirror
 * {Vesting-campaignLeaf} and {MerkleProof-verify} of navis-contracts. The admin
 * console rebuilds the very same tree in the browser with `ethers`, so a root
 * computed here, in the console or on chain is byte-identical for the same
 * allocation sheet and campaign id.
 *
 * The module is deliberately dependency-free (no `ethers`, no npm): the landing
 * tools and the harness run on a bare `node`, while the hardhat scripts of
 * navis-contracts reach across through `scripts/lib/merkle.js`, a thin
 * re-export of this file.
 *
 *   const merkle = require("./lib/merkle.cjs");
 *   const tree = merkle.buildTree(merkle.parseAllocations("0xab…,1000"), 3);
 *   tree.root              // "0x…"      -> createCampaign(name, role, root, …)
 *   tree.entries[0].proof  // ["0x…"]    -> claim(campaignId, amount, proof)
 */

"use strict";

/* ------------------------------------------------------------------ */
/*                        Keccak-256 (FIPS-202)                       */
/* ------------------------------------------------------------------ */

/// 24 round constants of the Keccak-f[1600] permutation.
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/// Rho rotation offsets, lane index = x + 5 * y.
const ROTATIONS = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const MASK64 = (1n << 64n) - 1n;
const RATE = 136; // 1600 - 2 * 256 bits, in bytes: the keccak-256 rate

/// Rotate a 64-bit lane left by `shift` bits.
function rotateLeft(value, shift) {
  const bits = BigInt(shift);
  if (bits === 0n) { return value & MASK64; }
  return ((value << bits) | (value >> (64n - bits))) & MASK64;
}

/// One application of the Keccak-f[1600] permutation over 25 lanes.
function keccakF(lanes) {
  const state = lanes.slice();
  const column = new Array(5);
  const sheet = new Array(25);

  for (let round = 0; round < 24; round += 1) {
    // theta
    for (let x = 0; x < 5; x += 1) {
      column[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const parity = column[(x + 4) % 5] ^ rotateLeft(column[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ parity) & MASK64;
      }
    }
    // rho + pi
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        sheet[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft(state[x + 5 * y], ROTATIONS[x + 5 * y]);
      }
    }
    // chi
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] = (sheet[x + 5 * y] ^
          (((~sheet[((x + 1) % 5) + 5 * y]) & MASK64) & sheet[((x + 2) % 5) + 5 * y])) & MASK64;
      }
    }
    // iota
    state[0] = (state[0] ^ ROUND_CONSTANTS[round]) & MASK64;
  }
  return state;
}

/// Normalises the accepted inputs (Uint8Array / Array / hex string) to bytes.
function toBytes(value) {
  if (value instanceof Uint8Array) { return value; }
  if (Array.isArray(value)) { return Uint8Array.from(value); }
  if (typeof value === "string") {
    const clean = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
      throw new TypeError("merkle: expected hex bytes, got " + JSON.stringify(value));
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  throw new TypeError("merkle: expected bytes");
}

/// `0x…` (lower case) rendering of a byte array.
function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return "0x" + out;
}

/**
 * Keccak-256 of `input` (the Ethereum flavour: `0x01` padding, not SHA3-256).
 * @param {Uint8Array|Array<number>|string} input Bytes or a `0x…` hex string.
 * @returns {string} `0x` + 64 hex characters.
 */
function keccak256(input) {
  const message = toBytes(input);
  const padded = new Uint8Array(Math.ceil((message.length + 1) / RATE) * RATE);
  padded.set(message);
  padded[message.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const lanes = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let lane = 0; lane < RATE / 8; lane += 1) {
      let value = 0n;
      for (let byte = 7; byte >= 0; byte -= 1) {
        value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      }
      lanes[lane] ^= value;
    }
    const permuted = keccakF(lanes);
    for (let lane = 0; lane < 25; lane += 1) { lanes[lane] = permuted[lane]; }
  }

  const digest = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) {
    let value = lanes[lane];
    for (let byte = 0; byte < 8; byte += 1) {
      digest[lane * 8 + byte] = Number(value & 0xffn);
      value >>= 8n;
    }
  }
  return toHex(digest);
}

/* ------------------------------------------------------------------ */
/*                         ABI encoding helpers                       */
/* ------------------------------------------------------------------ */

/// `abi.encode` word (32 bytes, big endian) of an unsigned integer or address.
function word(value, bytes) {
  const size = bytes || 32;
  let text;
  if (typeof value === "bigint") {
    if (value < 0n || value >= (1n << BigInt(size * 8))) {
      throw new RangeError("merkle: value out of range for uint" + String(size * 8));
    }
    text = value.toString(16);
  } else {
    const raw = String(value == null ? "" : value);
    const digits = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
    if (!/^[0-9a-fA-F]*$/.test(digits) || digits.length > size * 2) {
      throw new TypeError("merkle: not a uint/address: " + JSON.stringify(value));
    }
    text = digits.toLowerCase();
  }
  return text.padStart(size * 2, "0");
}

/// `abi.encode(uint256, address, uint256)`: three static 32-byte words.
function encodeLeafInput(campaignId, account, amount) {
  const id = typeof campaignId === "bigint" ? campaignId : BigInt(String(campaignId));
  const value = typeof amount === "bigint" ? amount : BigInt(String(amount));
  // the address occupies a whole 32-byte word, left padded
  return "0x" + word(id, 32) + word(account, 32) + word(value, 32);
}

/* ------------------------------------------------------------------ */
/*                              the tree                              */
/* ------------------------------------------------------------------ */

/// Lower-case hex without the `0x` prefix: the sort/comparison key of a node.
const bare = (hash) => String(hash).toLowerCase().replace(/^0x/, "");

/// Whether two hashes are the same bytes32, whatever their spelling.
function sameBytes(left, right) {
  return bare(left) === bare(right);
}

/// `keccak256(a ++ b)` over the two hashes in ascending order (OZ `_hashPair`).
function hashPair(left, right) {
  const a = bare(left);
  const b = bare(right);
  return keccak256(a <= b ? a + b : b + a);
}

/**
 * Leaf of one allocation, exactly as {Vesting-campaignLeaf} computes it:
 * `keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))))`.
 * @param {number|bigint|string} campaignId Campaign the allocation belongs to.
 * @param {string} account Beneficiary wallet.
 * @param {bigint} amount NAVIS of the allocation in base units (1e18).
 * @returns {string} `0x…` bytes32 leaf.
 */
function campaignLeaf(campaignId, account, amount) {
  return keccak256(keccak256(encodeLeafInput(campaignId, account, amount)));
}

/// The sorted level of a tree, as the OpenZeppelin verifier expects it.
function sortedLeaves(leaves) {
  return leaves.map(bare).sort();
}

/// Root of a list of leaves; a single leaf is its own root.
function merkleRoot(leaves) {
  if (!leaves || !leaves.length) { throw new Error("merkle: the tree is empty"); }
  let level = sortedLeaves(leaves);
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      // an odd node is paired with itself, the OpenZeppelin convention
      const sibling = level[index + 1] === undefined ? level[index] : level[index + 1];
      next.push(bare(hashPair(level[index], sibling)));
    }
    level = next;
  }
  return "0x" + level[0];
}

/// Sibling hashes of `leaf`, in the order {MerkleProof-verify} consumes them.
function merkleProof(leaves, leaf) {
  if (!leaves || !leaves.length) { throw new Error("merkle: the tree is empty"); }
  let level = sortedLeaves(leaves);
  let cursor = level.indexOf(bare(leaf));
  if (cursor < 0) { throw new Error("merkle: leaf is not part of the tree"); }
  const proof = [];
  while (level.length > 1) {
    const sibling = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
    // a missing sibling (odd level) is the node itself
    proof.push("0x" + (level[sibling] === undefined ? level[cursor] : level[sibling]));
    const next = [];
    for (let at = 0; at < level.length; at += 2) {
      const twin = level[at + 1] === undefined ? level[at] : level[at + 1];
      next.push(bare(hashPair(level[at], twin)));
    }
    level = next;
    cursor = Math.floor(cursor / 2);
  }
  return proof;
}

/// Replays `proof` bottom-up: the client-side twin of `MerkleProof.verify`.
function verifyProof(proof, root, leaf) {
  let computed = bare(leaf);
  for (const step of proof || []) {
    computed = bare(hashPair(computed, step));
  }
  return computed === bare(root);
}

/* ------------------------------------------------------------------ */
/*                        allocation sheets                           */
/* ------------------------------------------------------------------ */

/// `"1,000.5"` -> `1000005000000000000000n` (base units of `decimals`).
function toBaseUnits(text, decimals) {
  const scale = decimals === undefined || decimals === null ? 18 : Number(decimals);
  const clean = String(text == null ? "" : text).replace(/[,\s_]/g, "");
  if (clean === "" || clean === "." || !/^\d*\.?\d*$/.test(clean)) { return null; }
  const parts = clean.split(".");
  const fraction = (parts[1] || "").slice(0, scale).padEnd(scale, "0");
  return BigInt((parts[0] || "0") + fraction);
}

/// A first column that matches one of these is treated as a header, not a wallet.
const CSV_HEADER = /^(address|account|wallet|beneficiary|recipient|آدرس|کیف)/i;

/**
 * Parses an allocation sheet: one `account,amount[,label]` per line, `#`
 * comments and blank lines ignored, a header row recognised and skipped.
 * Commas, semicolons and tabs separate the columns; a line with a single
 * separator of any kind (`0x… 1000`) works too. Because the comma is a
 * separator it cannot double as a thousands delimiter inside an amount.
 * @param {string} text Sheet body.
 * @returns {Array<{account: string, amount: bigint, label: string, line: number}>}
 */
function parseAllocations(text, decimals) {
  const rows = [];
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) { return; }
    let parts = line.split(/[,;\t]+/).map((part) => part.trim()).filter((part) => part !== "");
    if (parts.length < 2) {
      parts = line.split(/\s+/).filter((part) => part !== "");
    }
    if (CSV_HEADER.test(parts[0] || "")) { return; }
    if (parts.length < 2) {
      throw new Error("merkle: line " + String(index + 1) + ": expected `address,amount`");
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(parts[0])) {
      throw new Error("merkle: line " + String(index + 1) + ": not an address: " + parts[0]);
    }
    const amount = toBaseUnits(parts[1], decimals);
    if (amount === null || amount <= 0n) {
      throw new Error("merkle: line " + String(index + 1) + ": amount must be greater than zero");
    }
    rows.push({ account: parts[0], amount, label: parts[2] || "", line: index + 1 });
  });

  if (!rows.length) { throw new Error("merkle: the allocation sheet is empty"); }
  const seen = new Set();
  rows.forEach((row) => {
    const key = row.account.toLowerCase();
    if (seen.has(key)) {
      throw new Error("merkle: line " + String(row.line) + ": duplicate allocation for " + row.account);
    }
    seen.add(key);
  });
  return rows;
}

/**
 * Builds the campaign tree of `rows`: the root for `createCampaign` and one
 * proof per member for `claim` / `claimFor`.
 * @param {Array<{account: string, amount: bigint, label?: string}>} rows Allocations.
 * @param {number|bigint|string} campaignId Id the campaign will get on chain.
 * @returns {{campaignId: string, root: string, leaves: Array<string>, total: bigint,
 *            entries: Array<{account: string, amount: bigint, label: string,
 *            leaf: string, proof: Array<string>}>}}
 */
function buildTree(rows, campaignId) {
  if (!rows || !rows.length) { throw new Error("merkle: no allocations"); }
  const id = BigInt(String(campaignId));
  const leaves = rows.map((row) => campaignLeaf(id, row.account, row.amount));
  const root = merkleRoot(leaves);
  const total = rows.reduce((sum, row) => sum + row.amount, 0n);
  const entries = rows.map((row, index) => ({
    account: row.account,
    amount: row.amount,
    label: row.label || "",
    leaf: leaves[index],
    proof: merkleProof(leaves, leaves[index]),
  }));
  return { campaignId: id.toString(), root, leaves, total, entries };
}

module.exports = {
  RATE,
  keccak256,
  encodeLeafInput,
  hashPair,
  sameBytes,
  campaignLeaf,
  merkleRoot,
  merkleProof,
  verifyProof,
  toBaseUnits,
  parseAllocations,
  buildTree,
};


