// SPDX-License-Identifier: MIT
/**
 * @file The campaign Merkle helper, shared with the landing tools.
 *
 * @notice The leaf / root rules must be identical on every side of a campaign:
 *         the contract ({Vesting-campaignLeaf}), the admin console (browser
 *         `ethers`) and the scripts here. Rather than keeping three copies in
 *         sync, the landing workspace owns the single dependency-free
 *         implementation and this file re-exports it:
 *
 *           navis-landing/tools/lib/merkle.cjs
 *               leaf     = keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))))
 *               hashPair = keccak256(sorted(a, b))          (OpenZeppelin rule)
 *               tree     = sorted leaves, odd node duplicated at every level
 *
 *         The landing tools keep it free of npm imports on purpose: they run on
 *         a bare `node`, and so do the scripts that use it through this bridge.
 *         The cross-package `require` follows the same pattern as
 *         {descriptorFor} of `scripts/deploy-and-record.js`, which already reads
 *         and writes the landing workspace by path.
 *
 *           const merkle = require("./lib/merkle");
 *           const tree = merkle.buildTree(merkle.parseAllocations(sheet), campaignId);
 *
 * @dev    `scripts/campaign.js` is the CLI built on top; `npx hardhat test`
 *         proves the root against the on-chain {Vesting-campaignLeaf} so a drift
 *         of either side fails the suite instead of a distribution.
 */

"use strict";

const path = require("path");

module.exports = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "navis-landing",
  "tools",
  "lib",
  "merkle.cjs"
));
