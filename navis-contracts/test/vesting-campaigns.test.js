// SPDX-License-Identifier: MIT
/**
 * @file On-chain contract of the Merkle claim campaigns of {Vesting}.
 *
 * @notice A campaign joins three independent implementations of the very same
 *         tree: the contract ({Vesting-campaignLeaf} plus the OpenZeppelin
 *         {MerkleProof}), the browser console of navis-landing (`ethers`) and the
 *         shared helper `navis-landing/tools/lib/merkle.cjs` that the console,
 *         `scripts/campaign.js` and the hardhat scripts all use. A drift between
 *         any two of them would either reject every valid proof or - worse -
 *         accept one the owner never published, so this suite pins the helper
 *         against the on-chain verifier instead of trusting either side:
 *
 *         * {Vesting-campaignLeaf} is compared value by value with the helper and
 *           with a hand-rolled `ethers` encoding;
 *         * a root built by the helper is handed to {Vesting-createCampaign} and
 *           every member of the sheet then claims through {Vesting-claim} with
 *           the proof the helper produced, so the OpenZeppelin sorted-pair and
 *           odd-node-duplication rules are validated by the contract itself;
 *         * the guard rails of a campaign (window, active flag, budget, replay,
 *           cancellation) and the {Vesting-KEEPER_ROLE} entry points
 *           ({Vesting-claimFor}, {Vesting-releaseBatch}) are exercised as well.
 */
"use strict";

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/// The single Merkle implementation of the repository, shared with the landing tools.
const merkle = require("../scripts/lib/merkle");

const E18 = 10n ** 18n;

/// Custody the deployment script hands to the vesting module (1,000,000 NAVIS).
const RESERVE = 1_000_000n * E18;

/// One allocation, in the shape {merkle:buildTree} expects.
const allocation = (account, amount) => ({ account, amount, label: "" });

/**
 * Deploys the token and the vesting module and funds the custody: the state
 * every campaign of this file starts from.
 */
async function fixture() {
  const [owner, alice, bob, carol, dave, keeper, stranger] = await ethers.getSigners();

  const token = await ethers.deployContract("NAVToken", [owner.address]);
  const vesting = await ethers.deployContract("Vesting", [
    owner.address,
    await token.getAddress(),
  ]);
  await token.mintDirect(await vesting.getAddress(), RESERVE);

  return { token, vesting, owner, alice, bob, carol, dave, keeper, stranger };
}

/// Opens a campaign for `root` and returns its id (creation order).
async function openCampaign(vesting, owner, root, budget, start = 0n, end = 0n) {
  await vesting
    .connect(owner)
    .createCampaign("Test Campaign", "community", root, start, end, budget);
  return (await vesting.campaignCount()) - 1n;
}

describe("Vesting / claim campaigns", function () {
  describe("campaignLeaf", function () {
    it("hashes exactly like the shared Merkle helper", async function () {
      const { vesting, alice, bob, carol, dave } = await fixture();

      const cases = [
        [0n, alice.address, 1n],
        [1n, bob.address, E18],
        [42n, carol.address, 123456789n],
        [7n, dave.address, (2n ** 128n) - 1n],
      ];

      for (const [id, account, amount] of cases) {
        expect(await vesting.campaignLeaf(id, account, amount))
          .to.equal(merkle.campaignLeaf(id, account, amount));
      }
    });

    it("matches the double keccak the browser console builds with ethers", async function () {
      const { vesting, alice } = await fixture();

      const id = 9n;
      const amount = 5n * E18;
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256"],
        [id, alice.address, amount],
      );
      const expected = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));

      expect(await vesting.campaignLeaf(id, alice.address, amount)).to.equal(expected);
    });

    it("folds the campaign id, the wallet and the amount into the leaf", async function () {
      const { vesting, alice, bob } = await fixture();

      const amount = 100n * E18;
      const leaf = await vesting.campaignLeaf(0n, alice.address, amount);

      // a leaf of another campaign, wallet or amount can never collide with it
      const otherCampaign = await vesting.campaignLeaf(1n, alice.address, amount);
      const otherWallet = await vesting.campaignLeaf(0n, bob.address, amount);
      const otherAmount = await vesting.campaignLeaf(0n, alice.address, amount + 1n);

      for (const neighbour of [otherCampaign, otherWallet, otherAmount]) {
        expect(neighbour).to.not.equal(leaf);
      }
      // and the helper reproduces each of them, so the id really is inside
      expect(merkle.campaignLeaf(1n, alice.address, amount)).to.equal(otherCampaign);
      expect(merkle.campaignLeaf(0n, bob.address, amount)).to.equal(otherWallet);
    });
  });

  describe("roots built by the shared helper", function () {
    it("pays every member of a sheet with the proof the helper produced", async function () {
      const { token, vesting, owner, alice, bob, carol } = await fixture();

      const rows = [
        allocation(alice.address, 100n * E18),
        allocation(bob.address, 250n * E18),
        allocation(carol.address, 50n * E18),
      ];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, tree.total);
      expect(id).to.equal(0n);

      const signers = [alice, bob, carol];
      for (const [index, entry] of tree.entries.entries()) {
        await expect(vesting.connect(signers[index]).claim(id, entry.amount, entry.proof))
          .to.emit(vesting, "CampaignClaimed")
          .withArgs(id, entry.account, signers[index].address, entry.amount);
        expect(await token.balanceOf(entry.account)).to.equal(entry.amount);
      }

      // the book of the campaign is complete and empty in the same breath
      expect(await vesting.campaignMemberCount(id)).to.equal(3n);
      expect(await vesting.campaignMemberAt(id, 2n)).to.equal(carol.address);
      expect(await vesting.campaignRemaining(id)).to.equal(0n);
      expect(await vesting.campaignClaimedAmount(id, alice.address)).to.equal(100n * E18);
      expect(await vesting.isCampaignClaimed(id, bob.address)).to.equal(true);
      expect(await vesting.campaignReserved()).to.equal(0n);
    });

    it("accepts the root of odd and even sheets alike", async function () {
      const { vesting, owner, alice, bob, carol, dave, keeper } = await fixture();
      const wallets = [alice, bob, carol, dave, keeper];

      for (const size of [1, 2, 3, 5]) {
        const rows = wallets
          .slice(0, size)
          .map((wallet, index) => allocation(wallet.address, BigInt(index + 1) * E18));
        const next = Number(await vesting.campaignCount());
        const tree = merkle.buildTree(rows, next);

        const id = await openCampaign(vesting, owner, tree.root, tree.total);
        expect(id).to.equal(BigInt(next));

        // the last member sits under the node an odd level has to duplicate
        const entry = tree.entries[size - 1];
        if (size === 1) {
          expect(tree.root).to.equal(tree.leaves[0]);
        } else {
          expect(entry.proof.length).to.be.greaterThan(0);
        }
        await vesting.connect(wallets[size - 1]).claim(id, entry.amount, entry.proof);
        expect(await vesting.campaignClaimedAmount(id, entry.account)).to.equal(entry.amount);
      }
    });

    it("rejects a proof that was built for another campaign id", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const first = merkle.buildTree(rows, 0);
      const second = merkle.buildTree(rows, 1);

      // one campaign per id, each with the root of its own sheet
      expect(await openCampaign(vesting, owner, first.root, first.total)).to.equal(0n);
      expect(await openCampaign(vesting, owner, second.root, second.total)).to.equal(1n);

      const entry = first.entries[0];
      // the same proof under the wrong id is worthless ...
      await expect(vesting.connect(alice).claim(1n, entry.amount, entry.proof)).to.be.revertedWith(
        "Vesting: invalid merkle proof",
      );
      // ... and pays out under the id it was hashed for
      await vesting.connect(alice).claim(0n, entry.amount, entry.proof);
      expect(await vesting.campaignClaimedAmount(0n, alice.address)).to.equal(entry.amount);
    });
  });

  describe("the guard rails of a claim", function () {
    it("pays a wallet only once", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, tree.total);
      const entry = tree.entries[0];

      await vesting.connect(alice).claim(id, entry.amount, entry.proof);
      await expect(vesting.connect(alice).claim(id, entry.amount, entry.proof)).to.be.revertedWith(
        "Vesting: allocation already claimed",
      );
      // the register did not book a second member either
      expect(await vesting.campaignMemberCount(id)).to.equal(1n);
    });

    it("refuses a tampered amount, an empty proof and an unknown campaign", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, tree.total);
      const entry = tree.entries[0];

      await expect(vesting.connect(alice).claim(id, entry.amount + 1n, entry.proof)).to.be.revertedWith(
        "Vesting: invalid merkle proof",
      );
      await expect(vesting.connect(alice).claim(id, entry.amount, [])).to.be.revertedWith(
        "Vesting: invalid merkle proof",
      );
      await expect(vesting.connect(alice).claim(9n, entry.amount, entry.proof)).to.be.revertedWith(
        "Vesting: invalid campaign id",
      );
      await expect(vesting.connect(alice).claim(id, 0n, entry.proof)).to.be.revertedWith(
        "Vesting: amount must be greater than zero",
      );
    });

    it("never pays more than the budget the owner reserved", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 250n * E18), allocation(bob.address, 50n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, 100n * E18);

      await expect(vesting.connect(alice).claim(id, 250n * E18, tree.entries[0].proof)).to.be.revertedWith(
        "Vesting: amount exceeds the campaign budget",
      );
      // the smaller allocation still fits
      await vesting.connect(bob).claim(id, 50n * E18, tree.entries[1].proof);
      expect(await vesting.campaignRemaining(id)).to.equal(50n * E18);
    });

    it("holds the claim inside the published window", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const now = await time.latest();
      const id = await openCampaign(
        vesting,
        owner,
        tree.root,
        tree.total,
        BigInt(now + 3600),
        BigInt(now + 7200),
      );

      const early = tree.entries[0];
      await expect(vesting.connect(alice).claim(id, early.amount, early.proof)).to.be.revertedWith(
        "Vesting: campaign has not started",
      );

      await time.increaseTo(now + 3601);
      await vesting.connect(alice).claim(id, early.amount, early.proof);

      const late = tree.entries[1];
      await time.increaseTo(now + 7201);
      await expect(vesting.connect(bob).claim(id, late.amount, late.proof)).to.be.revertedWith(
        "Vesting: campaign has ended",
      );
    });

    it("stops while the campaign is paused and only resumes when reopened", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, tree.total);
      const entry = tree.entries[0];

      await vesting.connect(owner).setCampaignActive(id, false);
      await expect(vesting.connect(alice).claim(id, entry.amount, entry.proof)).to.be.revertedWith(
        "Vesting: campaign is not active",
      );

      // opening it again lets the very same proof through
      await vesting.connect(owner).setCampaignActive(id, true);
      await vesting.connect(alice).claim(id, entry.amount, entry.proof);
      expect(await vesting.isCampaignClaimed(id, alice.address)).to.equal(true);
    });

    it("closes a cancelled campaign for good", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, tree.total);

      await vesting.connect(owner).cancelCampaign(id);
      const entry = tree.entries[0];
      await expect(vesting.connect(alice).claim(id, entry.amount, entry.proof)).to.be.revertedWith(
        "Vesting: campaign was cancelled",
      );
      await expect(vesting.connect(owner).setCampaignActive(id, true)).to.be.revertedWith(
        "Vesting: campaign was cancelled",
      );
    });
  });

  describe("campaign administration", function () {
    it("reserves the budget out of the free balance", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, 300n * E18);

      expect(await vesting.campaignReserved()).to.equal(300n * E18);
      expect(await vesting.freeBalance()).to.equal(RESERVE - 300n * E18);
      expect(await vesting.roleAllocated("community")).to.equal(300n * E18);

      // the reservation can no longer be promised to a manual schedule
      await expect(
        vesting
          .connect(owner)
          .createSchedule(alice.address, "team", RESERVE - 100n * E18, 0, 0, 86400, false),
      ).to.be.revertedWith("Vesting: unallocated balance too low");

      // a claim moves the tokens out without changing the free balance: the
      // budget shrinks by exactly what left the custody
      await vesting.connect(alice).claim(id, 10n * E18, tree.entries[0].proof);
      expect(await vesting.campaignReserved()).to.equal(290n * E18);
      expect(await vesting.freeBalance()).to.equal(RESERVE - 300n * E18);
      expect(await vesting.vestingBalance()).to.equal(RESERVE - 10n * E18);
    });

    it("frees the unclaimed part of a cancelled campaign", async function () {
      const { vesting, owner, alice, bob } = await fixture();

      const rows = [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)];
      const tree = merkle.buildTree(rows, 0);
      const id = await openCampaign(vesting, owner, tree.root, 100n * E18);
      await vesting.connect(alice).claim(id, 10n * E18, tree.entries[0].proof);

      await expect(vesting.connect(owner).cancelCampaign(id))
        .to.emit(vesting, "CampaignCancelled")
        .withArgs(id, 90n * E18);

      expect(await vesting.campaignReserved()).to.equal(0n);
      expect(await vesting.campaignRemaining(id)).to.equal(0n);
      expect(await vesting.freeBalance()).to.equal(RESERVE - 10n * E18);
      // the bucket keeps only what really reached the members
      expect(await vesting.roleAllocated("community")).to.equal(10n * E18);

      const campaign = await vesting.getCampaign(id);
      expect(campaign.name).to.equal("Test Campaign");
      expect(campaign.budget).to.equal(10n * E18);
      expect(campaign.active).to.equal(false);
      expect(campaign.cancelled).to.equal(true);

      await expect(vesting.connect(owner).cancelCampaign(id)).to.be.revertedWith(
        "Vesting: campaign was cancelled",
      );
    });

    it("re-points the root and the window of a running campaign", async function () {
      const { vesting, owner, alice, bob, carol } = await fixture();

      const first = merkle.buildTree(
        [allocation(alice.address, 10n * E18), allocation(bob.address, 20n * E18)],
        0,
      );
      const id = await openCampaign(vesting, owner, first.root, 100n * E18);

      // the extension keeps the previous members and adds one
      const extended = merkle.buildTree(
        [
          allocation(alice.address, 10n * E18),
          allocation(bob.address, 20n * E18),
          allocation(carol.address, 30n * E18),
        ],
        0,
      );
      await expect(vesting.connect(owner).setCampaignRoot(id, extended.root)).to.emit(
        vesting,
        "CampaignUpdated",
      );
      await vesting.connect(carol).claim(id, 30n * E18, extended.entries[2].proof);

      // a leaf of a sheet that was never published stays worthless
      const alien = merkle.buildTree([allocation(carol.address, 5n * E18)], 0);
      await expect(vesting.connect(bob).claim(id, 5n * E18, alien.entries[0].proof)).to.be.revertedWith(
        "Vesting: invalid merkle proof",
      );

      const now = await time.latest();
      await expect(
        vesting.connect(owner).setCampaignWindow(id, BigInt(now + 100), BigInt(now + 50)),
      ).to.be.revertedWith("Vesting: campaign window is inverted");

      await vesting.connect(owner).setCampaignWindow(id, BigInt(now + 1000), 0);
      const campaign = await vesting.getCampaign(id);
      expect(campaign.start).to.equal(BigInt(now + 1000));
      expect(campaign.end).to.equal(0n);

      // an open-ended window still keeps the campaign shut before its start
      await expect(vesting.connect(alice).claim(id, 10n * E18, extended.entries[0].proof)).to.be.revertedWith(
        "Vesting: campaign has not started",
      );
    });
