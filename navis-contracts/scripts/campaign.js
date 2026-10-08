// SPDX-License-Identifier: MIT
const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ */
/*                          NETWORK SELECTION                         */
/* ------------------------------------------------------------------ */

/**
 * `--network` value of the command line, or null when it was not given.
 *
 * @param {string[]} argv Arguments after the script path.
 * @returns {string|null}
 */
function selectedNetwork(argv) {
  const index = argv.findIndex(
    (token) => token === "--network" || token.startsWith("--network=")
  );
  if (index < 0) {
    return null;
  }
  const [, inline] = argv[index].split("=");
  const value = inline !== undefined ? inline : argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

// `hardhat run` refuses to forward a command line ("HH305: Unrecognized param
// --"), so this script is meant to run on plain `node`. The runtime environment
// loaded just below reads its network from `HARDHAT_NETWORK` when there is no
// CLI around, so the flag is translated into that variable *before* the first
// `require("hardhat")` and the command line keeps the shape `hardhat run` would
// have accepted. Under `npx hardhat run` the requested environment is already
// registered and this assignment is simply ignored.
const NETWORK = selectedNetwork(process.argv);
if (NETWORK) {
  process.env.HARDHAT_NETWORK = NETWORK;
}

const hre = require("hardhat");

const merkle = require("./lib/merkle");

const { ethers } = hre;

/**
 * @file Merkle claim campaign tooling for {Vesting}.
 *
 * @notice Every step of an automated distribution, from the allocation sheet to
 *         the on-chain payout, in one reproducible place. The tree is always
 *         built with the rules of {Vesting-campaignLeaf} and {MerkleProof}:
 *
 *             leaf     = keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))))
 *             hashPair = keccak256(sorted(a, b))
 *
 *         so a root computed here, in the admin console of the landing page or by
 *         the contract itself is the same bytes for the same sheet and id.
 *
 * @dev    The campaign id is part of the leaf, so the tree must be built with
 *         the id the campaign *will* have: `campaignCount()` at creation time.
 *         The CLI always reads it from the contract, which is why the admin
 *         console can accept the same sheet before and after the call.
 *
 *         Allocation sheet: one `address,amount[,label]` per line, `#` comments
 *         allowed, blank lines ignored, a header row skipped. Amounts are whole
 *         NAVIS (18 decimals unless `--decimals` says otherwise).
 *
 *         Proof file (`proofs.json`): the root, the budget and one `{account,
 *         amount, proof}` per member. It is the hand-off artefact — the admin
 *         console exports the same shape, and {verify} / {claim} consume it.
 *
 * Usage
 *
 *     node scripts/campaign.js plan    <sheet.csv> [--id N] [--out proofs.json]
 *     node scripts/campaign.js create  <sheet.csv> --name "Airdrop" [--role community]
 *                                     [--budget 100000] [--start-days 0] [--end-days 30]
 *                                     [--out proofs.json]
 *     node scripts/campaign.js status  <campaignId>
 *     node scripts/campaign.js verify  <proofs.json> [--id N]
 *     node scripts/campaign.js claim   <proofs.json> [--account 0x…] [--keeper]
 *                                     [--dry-run] [--limit N]
 *     node scripts/campaign.js update  <campaignId> [--root 0x…] [--start-days N]
 *                                     [--end-days N] [--active true|false]
 *     node scripts/campaign.js fund    <campaignId> --amount 100000
 *     node scripts/campaign.js cancel  <campaignId>
 *
 *     node scripts/campaign.js plan sheet.csv --network bscTestnet
 *
 * Every command accepts `--network NAME` (translated into `HARDHAT_NETWORK`
 * before the runtime environment is loaded, since `hardhat run` cannot forward a
 * command line), `--signer N` (index of the account of the network, so a keeper
 * wallet can run a claim without being the deployer) and `--vesting 0x…`
 * (override the address recorded in `deployments/<network>.json`).
 */

/* ------------------------------------------------------------------ */
/*                              CONSTANTS                             */
/* ------------------------------------------------------------------ */

const ROOT_DIR = path.join(__dirname, "..");
const DEPLOYMENTS_DIR = path.join(ROOT_DIR, "deployments");
const CAMPAIGNS_DIR = path.join(ROOT_DIR, "campaigns");
const SECONDS_PER_DAY = 86400n;

/* ------------------------------------------------------------------ */
/*                          COMMAND LINE                              */
/* ------------------------------------------------------------------ */

/**
 * Splits `argv` into positional arguments and `--flag value` / `--flag` pairs.
 * @param {string[]} argv Arguments after `--`.
 * @returns {{positional: string[], flags: object}}
 */
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split("=");
    if (inline !== undefined) {
      flags[name] = inline;
    } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith("--")) {
      flags[name] = argv[index + 1];
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

/// First positional argument, or the flag of the same name; throws when absent.
function arg(args, name, hint) {
  const value = args.flags[name] ?? args.positional[0];
  if (value === undefined || value === true) {
    throw new Error(`campaign: missing ${hint || name}`);
  }
  return String(value);
}

/* ------------------------------------------------------------------ */
/*                               HELPERS                              */
/* ------------------------------------------------------------------ */

/// Reads the allocation sheet and derives the tree for `campaignId`.
function readSheet(file, campaignId, decimals) {
  if (!fs.existsSync(file)) {
    throw new Error(`campaign: no such sheet: ${file}`);
  }
  const rows = merkle.parseAllocations(fs.readFileSync(file, "utf8"), decimals);
  return { rows, tree: merkle.buildTree(rows, campaignId) };
}

/// Deployment descriptor of `network`, or null when it was never recorded.
function readDescriptor(network) {
  const file = path.join(DEPLOYMENTS_DIR, `${network}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * Resolves the `Vesting` instance of the current network together with its
 * signer — or the bare provider when `readOnly`, so read paths need no key.
 */
async function connect(flags, options = {}) {
  const network = hre.network.name;
  const descriptor = readDescriptor(network);
  const address = flags.vesting ||
    (descriptor && descriptor.addresses && descriptor.addresses.vesting);
  if (!address) {
    throw new Error(
      `campaign: no Vesting address for ${network}; deploy first ` +
      "(scripts/deploy-and-record.js) or pass --vesting 0x…"
    );
  }

  let signer = ethers.provider;
  if (!options.readOnly) {
    const signers = await ethers.getSigners();
    const index = flags.signer === undefined ? 0 : Number(flags.signer);
    signer = signers[index];
    if (!signer) {
      throw new Error(
        `campaign: no signer #${index} on ${network}; set PRIVATE_KEY in .env` +
        (signers.length ? ` (the network offers ${signers.length})` : "")
      );
    }
  }

  const vesting = await ethers.getContractAt("Vesting", address, signer);
  return { network, descriptor, address, vesting, signer };
}

/// Unix timestamp of the latest block, the anchor of every relative window.
async function chainNow() {
  return BigInt((await ethers.provider.getBlock("latest")).timestamp);
}

/// `--start-days 7` / `--start 1730000000` -> absolute timestamp (0 means "now").
async function windowTime(flags, absoluteName, daysName, anchor) {
  if (flags[absoluteName] !== undefined) {
    return BigInt(String(flags[absoluteName]));
  }
  const days = BigInt(String(flags[daysName] ?? 0));
  if (days === 0n) {
    return 0n;
  }
  return BigInt(anchor === undefined ? await chainNow() : anchor) + days * SECONDS_PER_DAY;
}

/// The base-unit amount of a whole-NAVIS flag (`--budget 100000`).
function wholeTokens(value, decimals) {
  const amount = merkle.toBaseUnits(String(value), decimals);
  if (amount === null) {
    throw new Error(`campaign: not an amount: ${JSON.stringify(value)}`);
  }
  return amount;
}

/// The proof-file body the CLI and the admin console exchange.
async function proofDocument(context, campaign, tree) {
  const { chainId } = await ethers.provider.getNetwork();
  return {
    network: context.network,
    chainId: Number(chainId),
    vesting: context.address,
    campaignId: campaign.id.toString(),
    name: campaign.name,
    role: campaign.role,
    root: tree.root,
    budget: campaign.budget.toString(),
    budgetNavis: navis(campaign.budget),
    total: tree.total.toString(),
    totalNavis: navis(tree.total),
    generatedAt: new Date().toISOString(),
    members: tree.entries.map((entry) => ({
      account: entry.account,
      amount: entry.amount.toString(),
      amountNavis: navis(entry.amount),
      label: entry.label,
      leaf: entry.leaf,
      proof: entry.proof,
    })),
  };
}

/// Writes the proof document and reports where it went.
function writeProofs(file, document) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  console.log("proofs written:", file);
}

/// Default proof file of a campaign: `campaigns/<network>-campaign<N>.json`.
function defaultProofFile(network, id) {
  return path.join(CAMPAIGNS_DIR, `${network}-campaign${id}.json`);
}

/// The window of a campaign as a readable date (or a placeholder).
function stamp(value) {
  return value === 0n ? "—" : new Date(Number(value) * 1000).toISOString();
}

/// Reads a campaign as a plain object with the ids and base units inside.
async function readCampaign(vesting, id) {
  const campaign = await vesting.getCampaign(id);
  return {
    id,
    name: campaign.name,
    role: campaign.role,
    root: campaign.root,
    budget: campaign.budget,
    claimed: campaign.claimed,
    start: campaign.start,
    end: campaign.end,
    active: campaign.active,
    cancelled: campaign.cancelled,
    remaining: await vesting.campaignRemaining(id),
    members: await vesting.campaignMemberCount(id),
  };
}

/// Prints the members of a campaign and the tree it implies.
function printTree(tree) {
  console.log("");
  console.log(`  campaign id : ${tree.campaignId}`);
  console.log(`  members     : ${tree.entries.length}`);
  console.log(`  total       : ${navis(tree.total)} NAVIS`);
  console.log(`  merkle root : ${tree.root}`);
  console.log("");
  for (const entry of tree.entries) {
    console.log(
      "   ",
      entry.account,
      navis(entry.amount).padStart(14),
      "NAVIS",
      String(entry.proof.length).padStart(2),
      "proof step(s)",
      entry.label ? `· ${entry.label}` : ""
    );
  }
}

/// Whole-token amount of base units, e.g. `10n ** 18n` -> "1".
const navis = (amount) => ethers.formatUnits(amount, 18);

/* ------------------------------------------------------------------ */
/*                              COMMANDS                              */
/* ------------------------------------------------------------------ */

/// Prints the `Usage` block of this file's header.
function usage() {
  const source = fs.readFileSync(__filename, "utf8");
  const start = source.indexOf(" * Usage");
  const end = source.indexOf("*/\n", start);
  console.log(source.slice(start, end).split("\n").map((line) => line.replace(/^ \*/, "")).join("\n"));
}

/* ------------------------------------------------------------------ */
/*                              COMMANDS                              */
/* ------------------------------------------------------------------ */

/// `--decimals 18` (default) of the sheet amounts.
function decimalsOf(flags) {
  return flags.decimals === undefined ? 18 : Number(flags.decimals);
}

/// `--out` resolution: a path, the default file name, or null when unset.
function outFileOf(flags, network, id) {
  if (flags.out === undefined) { return null; }
  return typeof flags.out === "string" ? flags.out : defaultProofFile(network, id);
}

/**
 * `plan` — builds the tree of a sheet for the campaign id it will get next and
 * prints every member with its proof. Reads only: nothing is signed.
 */
async function cmdPlan(args) {
  const { network, address, vesting } = await connect(args.flags, { readOnly: true });
  const id = args.flags.id === undefined
    ? await vesting.campaignCount()
    : BigInt(String(args.flags.id));
  const { tree } = readSheet(arg(args, "sheet", "an allocation sheet"), id, decimalsOf(args.flags));

  console.log(`network ${network} · vesting ${address}`);
  printTree(tree);

  const out = outFileOf(args.flags, network, id);
  if (out) {
    const campaign = {
      id,
      name: String(args.flags.name ?? `campaign-${id}`),
      role: String(args.flags.role ?? ""),
      budget: tree.total,
    };
    writeProofs(out, await proofDocument({ network, address }, campaign, tree));
  }
  return tree;
}

/**
 * `create` — builds the tree for the *next* campaign id, opens the campaign with
 * the owner wallet and writes the proof file of the members.
 */
async function cmdCreate(args) {
  const flags = args.flags;
  const decimals = decimalsOf(flags);
  const { network, address, vesting, signer } = await connect(flags);
  const name = arg(args, "name", 'a campaign name (--name "Airdrop")');
  const role = flags.role === undefined ? "" : String(flags.role);
  const id = await vesting.campaignCount();
  const { tree } = readSheet(arg(args, "sheet", "an allocation sheet"), id, decimals);

  const budget = flags.budget === undefined ? tree.total : wholeTokens(flags.budget, decimals);
  if (budget < tree.total) {
    throw new Error(
      `campaign: the budget (${navis(budget)} NAVIS) is below the allocations ` +
      `(${navis(tree.total)} NAVIS)`
    );
  }

  const start = await windowTime(flags, "start", "start-days");
  const end = await windowTime(flags, "end", "end-days", start === 0n ? await chainNow() : start);

  console.log(`network ${network} · vesting ${address} · signer ${await signer.getAddress()}`);
  printTree(tree);
  console.log("");
  console.log(
    `opening campaign ${id} "${name}" (role "${role || "—"}") · budget ${navis(budget)} NAVIS`,
    `· window ${stamp(start)} → ${stamp(end)}`
  );

  const tx = await vesting.createCampaign(name, role, tree.root, start, end, budget);
  const receipt = await tx.wait();
  console.log("tx:", tx.hash, `(block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);

  // The id is the tree's campaign id: a mismatch would mean the tree is unusable.
  const created = receipt.logs
    .map((log) => {
      try { return vesting.interface.parseLog(log); } catch { return null; }
    })
    .find((parsed) => parsed && parsed.name === "CampaignCreated");
  const campaignId = created ? BigInt(created.args.id) : id;
  if (campaignId !== id) {
    throw new Error(
      `campaign: the campaign was created with id ${campaignId} but the tree was ` +
      `built for ${id}; rebuild it and call setCampaignRoot(id, root)`
    );
  }

  const out = outFileOf(flags, network, id) || defaultProofFile(network, id);
  writeProofs(out, await proofDocument(
    { network, address },
    { id, name, role, budget },
    tree
  ));
  return { id, root: tree.root, file: out };
}

/**
 * `status` — the on-chain state of a campaign, its window and its claim register.
 */
async function cmdStatus(args) {
  const { network, address, vesting } = await connect(args.flags, { readOnly: true });
  const id = BigInt(arg(args, "campaignId", "a campaign id"));
  const campaign = await readCampaign(vesting, id);

  console.log(`network ${network} · vesting ${address}`);
  console.log("");
  console.log(`  campaign ${campaign.id} "${campaign.name}" (role "${campaign.role || "—"}")`);
  console.log("  root       :", campaign.root);
  console.log("  budget     :", navis(campaign.budget), "NAVIS");
  console.log("  claimed    :", navis(campaign.claimed), "NAVIS");
  console.log("  remaining  :", navis(campaign.remaining), "NAVIS");
  console.log("  window     :", stamp(campaign.start), "→", stamp(campaign.end));
  console.log("  active     :", campaign.active, "· cancelled:", campaign.cancelled);
  console.log("  claimants  :", campaign.members.toString());
  for (let index = 0; index < Number(campaign.members); index += 1) {
    const account = await vesting.campaignMemberAt(id, index);
    const paid = await vesting.campaignClaimedAmount(id, account);
    console.log("    -", account, navis(paid), "NAVIS");
  }
  return campaign;
}

/**
 * `verify` — re-derives the tree from the members of a proof file and compares
 * it with the file and with the chain. The cheapest way to catch a sheet that
 * was regenerated after the campaign was opened, or a root that was rotated.
 */
async function cmdVerify(args) {
  const file = arg(args, "proofs", "a proof file");
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  const { network, address, vesting } = await connect(args.flags, { readOnly: true });
  const id = args.flags.id === undefined
    ? BigInt(document.campaignId)
    : BigInt(String(args.flags.id));
  const campaign = await readCampaign(vesting, id);

  const leaves = document.members.map((member) =>
    merkle.campaignLeaf(id, member.account, BigInt(member.amount)));
  const rebuilt = merkle.merkleRoot(leaves);
  const total = document.members.reduce((sum, member) => sum + BigInt(member.amount), 0n);

  console.log(`network ${network} · vesting ${address} · campaign ${id}`);
  console.log("  file root     :", document.root);
  console.log("  rebuilt root  :", rebuilt);
  console.log("  on-chain root :", campaign.root);
  console.log("  allocations   :", navis(total), "NAVIS · budget", navis(campaign.budget));

  const problems = [];
  if (!merkle.sameBytes(rebuilt, document.root)) {
    problems.push(`the root of the file does not rebuild from its ${document.members.length} members`);
  }
  if (!merkle.sameBytes(rebuilt, campaign.root)) {
    problems.push("the rebuilt root is not the root of the campaign on-chain");
  }
  if (total > campaign.budget) {
    problems.push(`the allocations (${navis(total)}) exceed the budget (${navis(campaign.budget)})`);
  }

  let unclaimed = 0;
  for (const member of document.members) {
    const amount = BigInt(member.amount);
    const leaf = merkle.campaignLeaf(id, member.account, amount);
    if (member.leaf !== undefined && !merkle.sameBytes(member.leaf, leaf)) {
      problems.push(`the recorded leaf of ${member.account} does not match its account/amount`);
    }
    if (!merkle.verifyProof(member.proof, document.root, leaf)) {
      problems.push(`broken proof for ${member.account}`);
    }
    if (!(await vesting.isCampaignClaimed(id, member.account))) {
      unclaimed += 1;
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error("  ✗", problem);
    }
    throw new Error(`campaign: ${problems.length} problem(s) in ${file}`);
  }

  console.log(
    `  ✓ ${document.members.length} proof(s) verified · ${unclaimed} wallet(s) unclaimed ·`,
    `${navis(campaign.remaining)} NAVIS left in the campaign`
  );
  return document;
}

/**
 * `claim` — pays the members of a proof file. The proof is the authorisation, so
 * anyone can run this; `--keeper` routes through {Vesting-claimFor} instead,
 * which needs KEEPER_ROLE on the signer (gasless claims on behalf of the users).
 */
async function cmdClaim(args) {
  const file = arg(args, "proofs", "a proof file");
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  const flags = args.flags;
  const { network, address, vesting, signer } = await connect(flags);
  const id = flags.id === undefined ? BigInt(document.campaignId) : BigInt(String(flags.id));
  const keeper = Boolean(flags.keeper);
  const dryRun = Boolean(flags["dry-run"]);

  let targets = document.members;
  if (flags.account !== undefined && flags.account !== true) {
    const wanted = String(flags.account).toLowerCase();
    targets = targets.filter((member) => member.account.toLowerCase() === wanted);
    if (targets.length === 0) {
      throw new Error(`campaign: ${flags.account} is not a member of campaign ${id}`);
    }
  }
  if (flags.limit !== undefined) {
    targets = targets.slice(0, Number(flags.limit));
  }

  console.log(
    `network ${network} · vesting ${address} · campaign ${id} ·`,
    `${targets.length} member(s) · ${keeper ? "keeper" : "self"} claim from ${await signer.getAddress()}`
  );

  let paid = 0;
  let totalPaid = 0n;
  let skipped = 0;

  for (const member of targets) {
    const amount = BigInt(member.amount);
    const leaf = merkle.campaignLeaf(id, member.account, amount);
    if (!merkle.verifyProof(member.proof, document.root, leaf)) {
      console.error("  ✗", member.account, "has a broken proof — run `verify` first");
      continue;
    }
    if (await vesting.isCampaignClaimed(id, member.account)) {
      console.log("  · skip  ", member.account, "(already claimed)");
      skipped += 1;
      continue;
    }

    if (dryRun) {
      // `staticCall` runs the claim against the live state: it reverts here for
      // the very same reasons the real transaction would.
      const preview = keeper
        ? await vesting.claimFor.staticCall(id, member.account, amount, member.proof)
        : await vesting.claim.staticCall(id, amount, member.proof);
      console.log("  ✓ dry   ", member.account, navis(preview), "NAVIS");
      continue;
    }

    const tx = keeper
      ? await vesting.claimFor(id, member.account, amount, member.proof)
      : await vesting.claim(id, amount, member.proof);
    const receipt = await tx.wait();
    console.log(
      "  ✓ claim ", member.account, navis(amount), "NAVIS",
      `· ${tx.hash} (gas ${receipt.gasUsed})`
    );
    paid += 1;
    totalPaid += amount;
  }

  console.log(dryRun
    ? "dry run: nothing was sent"
    : `paid ${paid} claim(s) for ${navis(totalPaid)} NAVIS · ${skipped} skipped`);
  return { paid, totalPaid, skipped, dryRun };
}

/**
 * `update` — rotates the root, the window or the pause flag of a campaign. The
 * bits of live state sit in separate owner calls on chain but belong to one
 * operation here: an extension that grows the member list must rotate the root
 * *and* the budget ({fund}), and a campaign that is not open yet needs a window.
 */
async function cmdUpdate(args) {
  const flags = args.flags;
  const id = BigInt(arg(args, "campaignId", "a campaign id"));
  const { network, address, vesting, signer } = await connect(flags);
  const campaign = await readCampaign(vesting, id);
  console.log(
    `network ${network} · vesting ${address} · campaign ${id}`,
    `from ${await signer.getAddress()}`
  );

  let touched = 0;

  if (flags.root !== undefined) {
    const root = String(flags.root);
    if (!ethers.isHexString(root, 32)) {
      throw new Error(`campaign: --root must be a bytes32 hash, got ${root}`);
    }
    if (merkle.sameBytes(root, campaign.root)) {
      console.log("  · root is already", root);
    } else {
      const tx = await vesting.setCampaignRoot(id, root);
      await tx.wait();
      console.log("  ✓ root  ", root, `· ${tx.hash}`);
      touched += 1;
    }
  }

  const movesWindow = flags.start !== undefined ||
    flags["start-days"] !== undefined ||
    flags.end !== undefined ||
    flags["end-days"] !== undefined;
  if (movesWindow) {
    const start = await windowTime(flags, "start", "start-days");
    const anchor = start === 0n
      ? (campaign.start === 0n ? await chainNow() : campaign.start)
      : start;
    const end = await windowTime(flags, "end", "end-days", anchor);
    const tx = await vesting.setCampaignWindow(id, start, end);
    await tx.wait();
    console.log("  ✓ window", stamp(start), "→", stamp(end), `· ${tx.hash}`);
    touched += 1;
  }

  if (flags.active !== undefined) {
    const active = ["true", "1", "yes", "on"].includes(String(flags.active).toLowerCase());
    const tx = await vesting.setCampaignActive(id, active);
    await tx.wait();
    console.log("  ✓ active", active, `· ${tx.hash}`);
    touched += 1;
  }

  if (touched === 0) {
    throw new Error("campaign: nothing to update (--root, --start-days/--end-days, --active)");
  }
  return readCampaign(vesting, id);
}

/**
 * `fund` — reserves more NAVIS for a campaign. The tokens must already sit in
 * the {Vesting} contract: a budget is carved out of {Vesting-freeBalance}, it is
 * never pulled from the owner, so a distribution is funded by transferring NAVIS
 * to the vesting contract first and reserving them here.
 */
async function cmdFund(args) {
  const flags = args.flags;
  const id = BigInt(arg(args, "campaignId", "a campaign id"));
  const amount = wholeTokens(arg(args, "amount", "an amount (--amount 100000)"), decimalsOf(flags));
  const { network, address, vesting } = await connect(flags);
  console.log(`network ${network} · vesting ${address} · campaign ${id}`);

  const tx = await vesting.topUpCampaign(id, amount);
  await tx.wait();
  const campaign = await readCampaign(vesting, id);
  console.log(
    "  ✓ funded", navis(amount), "NAVIS · budget is now", navis(campaign.budget),
    "· free balance", navis(await vesting.freeBalance()), `· ${tx.hash}`
  );
  return campaign;
}

/**
 * `cancel` — closes a campaign for good and returns its unclaimed budget to the
 * pool, where it becomes available for another distribution.
 */
async function cmdCancel(args) {
  const id = BigInt(arg(args, "campaignId", "a campaign id"));
  const { network, address, vesting } = await connect(args.flags);
  console.log(`network ${network} · vesting ${address} · campaign ${id}`);

  const tx = await vesting.cancelCampaign(id);
  const receipt = await tx.wait();
  const cancelled = receipt.logs
    .map((log) => {
      try { return vesting.interface.parseLog(log); } catch { return null; }
    })
    .find((parsed) => parsed && parsed.name === "CampaignCancelled");
  console.log(
    "  ✓ cancelled · returned",
    navis(cancelled ? BigInt(cancelled.args.returned) : 0n),
    "NAVIS to the pool · free balance", navis(await vesting.freeBalance()),
    `· ${tx.hash}`
  );
}

/* ------------------------------------------------------------------ */
/*                                MAIN                                */
/* ------------------------------------------------------------------ */

const COMMANDS = {
  plan: cmdPlan,
  create: cmdCreate,
  status: cmdStatus,
  verify: cmdVerify,
  claim: cmdClaim,
  update: cmdUpdate,
  fund: cmdFund,
  cancel: cmdCancel,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional.shift();

  if (!command || command === "help" || command === "--help" || args.flags.help) {
    usage();
    return;
  }
  if (!COMMANDS[command]) {
    throw new Error(
      `campaign: unknown command "${command}" (${Object.keys(COMMANDS).join(", ")})`
    );
  }
  await COMMANDS[command](args);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { COMMANDS, main, parseArgs, readSheet, proofDocument };

