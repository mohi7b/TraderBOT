// SPDX-License-Identifier: MIT
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { deployProtocol } = require("./deploy");
const { ethers } = hre;

/**
 * @file Deploys the NAV ecosystem and records the resulting addresses as the
 *       JSON descriptor the landing page reads at runtime.
 *
 * @notice `scripts/deploy.js` deploys, wires and prints a human report; this
 *         wrapper adds the machine-readable step so the landing page never has
 *         to be edited by hand again. It writes two identical descriptors:
 *
 *           navois-contracts/deployments/<network>.json   (source of truth)
 *           navis-landing/deployments/<network>.json     (static copy)
 *
 *         The schema is the one the live reader expects: `addresses.navToken`,
 *         `.presale`, `.treasury`, `.vesting`, `.usdtToken`, `.router`,
 *         `.marketMaker`, `.liquidityPool` (the market maker — the presale's
 *         liquidity pool) and `.vestingKeeper` (the wallet holding
 *         `Vesting.KEEPER_ROLE`, which settles schedules and pays committed
 *         campaign allocations through `releaseBatch` / `claimFor`), plus
 *         `bootstrap`, `governance` (including the vesting owner and the
 *         emergency-stop delegate), the team / marketing `vesting` schedules,
 *         `vesting.campaignReserve` (the unallocated custody the Merkle claim
 *         campaigns are created from) and a per-contract `deployedCode` sanity
 *         block.
 *         `pending` is written as `false`, which is what makes the #genesis
 *         section switch from the demo values to on-chain reads.
 *
 * @dev    Run exactly like the plain deployer:
 *
 *           BOOTSTRAP_SUPPLY_NAVIS=1000000 SEED_RESERVE_USDT=250000 \
 *           SEED_FLOAT_USDT=50000 \
 *           npx hardhat run scripts/deploy-and-record.js --network bscTestnet
 *
 *         On `bscTestnet`, `hardhat` and `localhost`, leaving `USDT_ADDRESS` /
 *         `DEX_ROUTER_ADDRESS` empty deploys `MockUSDT` (6 decimals) and
 *         `MockDEXRouter`: the protocol's floor maths assume a 6-decimal
 *         reserve, so a seeded test economy needs the repository mocks.
 */

const NAVIS_SCALE = 10n ** 18n;
const USDT_SCALE = 10n ** 6n;

/// Where the landing page keeps its copy of the descriptor.
const LANDING_DIR = path.join(__dirname, "..", "..", "navis-landing", "deployments");

/// Whole-token amount of base units, e.g. `10n ** 18n` -> "1".
function whole(amount, scale) {
  return (amount / scale).toString();
}

/// Deployed-bytecode evidence: catches a descriptor that points at an EOA.
async function codeEvidence(address) {
  const code = await ethers.provider.getCode(address);
  return {
    address,
    deployed: code !== "0x",
    codeBytes: code === "0x" ? 0 : (code.length - 2) / 2,
  };
}

function descriptorFor(network, chainId, deployment, deployer) {
  const { addresses } = deployment;
  return {
    network,
    chainId: Number(chainId),
    rpcUrl: hre.network.config.url || null,
    recordedAt: new Date().toISOString(),
    deployer,
    pending: false,
    mode: deployment.usdtIsMock && deployment.routerIsMock ? "mocks" : "external",
    addresses: {
      navToken: addresses.navToken,
      presale: addresses.presale,
      treasury: addresses.treasury,
      vesting: addresses.vesting,
      marketMaker: addresses.marketMaker,
      usdtToken: addresses.usdtToken,
      router: addresses.router,
      liquidityPool: addresses.marketMaker,
      keeper: addresses.keeper,
      // The wallet holding {Vesting-KEEPER_ROLE}: it may settle schedules and
      // pay committed campaign allocations, nothing else.
      vestingKeeper: addresses.vestingKeeper ?? addresses.keeper,
    },
    bootstrap: {
      supplyNavis: whole(deployment.bootstrap.supply, NAVIS_SCALE),
      seedReserveUsdt: whole(deployment.bootstrap.reserve, USDT_SCALE),
      seedFloatUsdt: whole(deployment.bootstrap.float, USDT_SCALE),
    },
    // Team / marketing custody recorded at deployment time. The admin console
    // reads the live schedules from the contract; this block is the frozen
    // "as deployed" record of the same tokenomics buckets.
    vesting: {
      minted: whole(deployment.vestingMinted ?? 0n, NAVIS_SCALE),
      // Unallocated NAVIS the campaigns are created from: the sum of the budgets
      // `scripts/campaign.js create` may reserve ({Vesting-freeBalance}).
      campaignReserve: whole(deployment.vestingCampaignReserve ?? 0n, NAVIS_SCALE),
      schedules: (deployment.vestingSchedules ?? []).map((schedule) => ({
        role: schedule.role,
        beneficiary: schedule.beneficiary,
        amount: whole(BigInt(schedule.amount), NAVIS_SCALE),
        cliffDays: schedule.cliffDays,
        durationDays: schedule.durationDays,
        sharePercent: schedule.sharePercent,
        revocable: schedule.revocable,
      })),
    },
    governance: {
      navTokenOwner: null,
      presaleOwner: null,
      treasuryOwner: null,
      vestingOwner: null,
      pauser: deployment.pauser ?? null,
    },
    deployedCode: {},
  };
}

function report(descriptor) {
  console.log("");
  console.log("Recorded descriptor:");
  console.log("  network     :", descriptor.network, `(chainId ${descriptor.chainId})`);
  console.log("  settlement  :", descriptor.mode === "mocks"
    ? "MockUSDT (6 decimals) + MockDEXRouter"
    : "external USDT + router");
  console.log("  deployer    :", descriptor.deployer);
  console.log("  NAVToken    :", descriptor.addresses.navToken);
  console.log("  Vesting     :", descriptor.addresses.vesting,
    `(${descriptor.vesting.schedules.length} schedule(s), ${descriptor.vesting.minted} NAVIS,`,
    `${descriptor.vesting.campaignReserve} NAVIS reserved for claim campaigns)`);
  console.log("  VestingKeeper:", descriptor.addresses.vestingKeeper,
    "(KEEPER_ROLE: releaseBatch / claimFor)");
  console.log("  Presale     :", descriptor.addresses.presale);
  console.log("  Treasury    :", descriptor.addresses.treasury);
  console.log("  MarketMaker :", descriptor.addresses.marketMaker);
  console.log("  USDT        :", descriptor.addresses.usdtToken);
  console.log("  Router      :", descriptor.addresses.router);
  console.log("");
  console.log("Open the landing page on chainId", descriptor.chainId,
    "— the #genesis section reads these addresses automatically.");
}

async function main() {
  const network = hre.network.name;
  const { chainId } = await ethers.provider.getNetwork();

  const deployment = await deployProtocol();
  const deployer = await deployment.deployer.getAddress();
  const descriptor = descriptorFor(network, chainId, deployment, deployer);

  // Owners are read back so the governance panel starts filled.
  descriptor.governance.navTokenOwner = await deployment.navToken.owner();
  descriptor.governance.presaleOwner = await deployment.presale.owner();
  descriptor.governance.treasuryOwner = await deployment.treasury.owner();
  descriptor.governance.vestingOwner = await deployment.vesting.owner();

  for (const [name, address] of Object.entries(descriptor.addresses)) {
    descriptor.deployedCode[name] = await codeEvidence(address);
  }

  const targets = [
    path.join(__dirname, "..", "deployments", `${network}.json`),
    path.join(LANDING_DIR, `${network}.json`),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(descriptor, null, 2)}\n`);
    console.log("recorded:", target);
  }

  report(descriptor);
  return descriptor;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, descriptorFor };
