// SPDX-License-Identifier: MIT
const hre = require("hardhat");

const { ethers } = hre;

/**
 * @file Deployment and on-chain wiring of the NAV ecosystem.
 *
 * @notice Deploys the five protocol contracts in the canonical order
 *
 *             1. NAVToken
 *             2. Vesting
 *             3. Presale
 *             4. Treasury
 *             5. MarketMaker
 *
 *         and wires their roles together:
 *
 *           - `NAVToken.setBurner(treasury, true)`         treasury burns redemptions
 *           - `NAVToken.setPauser(pauser, true)`           emergency stop of the token
 *           - `NAVToken.transferOwnership(presale)`        presale mints the issuance
 *           - `Vesting.createSchedule(…)`                  team / marketing custody
 *           - `Vesting.grantKeeper(keeper)`                 automated distribution
 *           - `Presale.setTreasuryVault(treasury)`         floor value of a purchase
 *           - `Presale.setLiquidityPool(marketMaker)`      premium of a purchase
 *           - `Presale.setPauser(pauser, true)`            emergency stop of the sale
 *           - `Treasury.setWhitelisted(marketMaker, true)` flash-loan receiver
 *           - `Treasury.setPauser(pauser, true)`           emergency stop of the reserve
 *           - `MarketMaker.setKeeper(keeper, true)`        arbitrage robot
 *
 * @dev    Two ordering constraints drive the exact sequence of the wiring step:
 *
 *           1. `setBurner` and `setPauser` are `onlyOwner` on the NAVIS token, so
 *              they have to run *before* the ownership is handed over to the
 *              presale: afterwards the deployer is no longer able to reconfigure
 *              the token.
 *           2. The presale requires a non-zero treasury vault and liquidity pool
 *              at construction time, while both contracts only exist later. It is
 *              therefore born with the deployer as a temporary placeholder and is
 *              re-pointed at the real contracts in the wiring step.
 *
 *         The minting right of the presale is realised through the token
 *         ownership ({NAVToken-mintDirect} is `onlyOwner`); the repository has no
 *         separate minter role. The same right funds the vesting module: the
 *         team / marketing allocations are minted to {Vesting} while the deployer
 *         still owns the token, so a schedule never depends on a later transfer.
 *
 *         Settlement and DEX addresses are read from the environment
 *         (`USDT_ADDRESS`, `DEX_ROUTER_ADDRESS`). On a local network — and on the
 *         BSC testnet, see {MOCK_NETWORKS} — both may be omitted, in which case the
 *         repository mocks are deployed so that the complete wiring and a *seeded*
 *         test economy can be exercised end to end.
 *
 *         The vesting buckets of {VESTING_BUCKETS} are driven by
 *         `VESTING_<ROLE>_NAVIS` and the family of `VESTING_<ROLE>_*` overrides,
 *         and `VESTING_CAMPAIGN_RESERVE_NAVIS` mints the unallocated custody the
 *         claim campaigns are created from (`Vesting.createCampaign` reserves a
 *         budget against `Vesting.freeBalance`, so the campaigns and the curves
 *         can never take each other's tokens).
 */

/* ------------------------------------------------------------------ */
/*                              CONSTANTS                             */
/* ------------------------------------------------------------------ */

const NAVIS_SCALE = 10n ** 18n; // NAVIS has 18 decimals
const USDT_SCALE = 10n ** 6n; // USDT has 6 decimals

/// Networks on which the deployer runs a node it fully controls.
const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

/// Networks on which the repository mocks may additionally stand in for real
/// infrastructure when `USDT_ADDRESS` / `DEX_ROUTER_ADDRESS` are unset.
///
/// A public testnet offers no settlement token whose supply we control, and the
/// protocol's floor maths assume a 6-decimal reserve, so bootstrapping a *seeded*
/// test economy there is only possible with the mocks shipped in `contracts/mocks`.
/// Mainnet is deliberately absent: there both addresses must be given.
const MOCK_NETWORKS = new Set([...LOCAL_NETWORKS, "bscTestnet"]);

/* ------------------------------------------------------------------ */
/*                           VESTING BUCKETS                          */
/* ------------------------------------------------------------------ */

/**
 * Default shape of the tokenomics buckets the vesting module custodies.
 *
 * Each bucket is driven by the environment, so a deployment can either skip it
 * (`VESTING_<ROLE>_NAVIS` unset) or override every parameter:
 *
 *     VESTING_TEAM_NAVIS=150000000          whole NAVIS of the team bucket
 *     VESTING_TEAM_BENEFICIARY=0x…          receiver (defaults to the deployer)
 *     VESTING_TEAM_CLIFF_DAYS=365           lock before the first unlock
 *     VESTING_TEAM_DURATION_DAYS=1095       total vesting window
 *     VESTING_TEAM_SHARE_PERCENT=15         declared share of the supply
 *     VESTING_TEAM_REVOCABLE=false          whether the owner may revoke
 *
 * The defaults below are the ones a launch uses when only the amount is given:
 * a 12-month cliff on a 36-month team curve, and a 3-month cliff on a 24-month
 * marketing curve, 15% / 10% of the supply. The declared shares feed the
 * registry of {Vesting-setRoleShare} only - they never move tokens.
 */
const VESTING_BUCKETS = [
  {
    role: "team",
    defaults: { cliffDays: 365, vestingDays: 1095, sharePercent: 15, revocable: false },
  },
  {
    role: "marketing",
    defaults: { cliffDays: 90, vestingDays: 730, sharePercent: 10, revocable: true },
  },
];

/* ------------------------------------------------------------------ */
/*                               HELPERS                              */
/* ------------------------------------------------------------------ */

/// NAVIS base units of a whole-token amount, e.g. `navis(1_000)` == 1,000 NAVIS.
function navis(amount) {
  return BigInt(amount) * NAVIS_SCALE;
}

/// USDT base units of a whole-token amount, e.g. `usdt(1_000)` == 1,000 USDT.
function usdt(amount) {
  return BigInt(amount) * USDT_SCALE;
}

/// Address held in a `..._ADDRESS` environment variable (null when unset).
function envAddress(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return null;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`deploy: ${name} is not a valid address (${value})`);
  }
  return ethers.getAddress(value);
}

/// Whole-token amount held in a `..._AMOUNT` environment variable (0 when unset).
function envWholeTokens(name, scale) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return 0n;
  }
  return BigInt(value.trim()) * scale;
}

/// Non-negative number held in an environment variable (fallback when unset).
function envNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`deploy: ${name} is not a non-negative number (${value})`);
  }
  return parsed;
}

/// Boolean flag in an environment variable (fallback when unset).
function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/// Seconds of a whole-day amount: `days(365)` == 365 days.
function days(amount) {
  return BigInt(Math.round(amount * 86400));
}

/**
 * Reads one vesting bucket out of the environment.
 *
 * @param {object} bucket          Entry of {VESTING_BUCKETS}.
 * @param {string} deployerAddress Fallback beneficiary.
 * @returns {Promise<object|null>} The bucket, or null when it has no amount.
 */
async function readVestingBucket(bucket, deployerAddress) {
  const prefix = `VESTING_${bucket.role.toUpperCase()}`;
  const amount = envWholeTokens(`${prefix}_NAVIS`, NAVIS_SCALE);
  if (amount === 0n) {
    return null;
  }

  const defaults = bucket.defaults;
  const durationSeconds = days(
    envNumber(`${prefix}_DURATION_DAYS`, defaults.vestingDays)
  );
  const cliffSeconds = days(envNumber(`${prefix}_CLIFF_DAYS`, defaults.cliffDays));

  if (durationSeconds === 0n) {
    throw new Error(`deploy: ${prefix}_DURATION_DAYS must be greater than zero`);
  }
  if (cliffSeconds > durationSeconds) {
    throw new Error(`deploy: ${prefix}_CLIFF_DAYS cannot exceed the duration`);
  }

  return {
    role: bucket.role,
    amount,
    beneficiary: await toAddress(
      process.env[`${prefix}_BENEFICIARY`],
      deployerAddress
    ),
    cliff: cliffSeconds,
    duration: durationSeconds,
    shareBps: Math.round(
      envNumber(`${prefix}_SHARE_PERCENT`, defaults.sharePercent) * 100
    ),
    revocable: envFlag(`${prefix}_REVOCABLE`, defaults.revocable),
  };
}

/**
 * Accepts a signer, a signer-like object or an address and returns a checksummed
 * address, falling back to `fallback` when no value was given.
 */
async function toAddress(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    return ethers.getAddress(value);
  }
  if (typeof value.getAddress === "function") {
    return ethers.getAddress(await value.getAddress());
  }
  throw new Error("deploy: cannot derive an address from the given value");
}
/* ------------------------------------------------------------------ */
/*                           PROTOCOL DEPLOYMENT                      */
/* ------------------------------------------------------------------ */

/// Fully qualified artifact of the ERC20 surface used for a real USDT.
const ERC20_ARTIFACT = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";

/**
 * Deploys and wires the complete protocol.
 *
 * @param {object}        [options]
 * @param {object}        [options.deployer]          Signer that owns the contracts (defaults to signer[0]).
 * @param {object|string} [options.keeper]            Arbitrage keeper (defaults to `KEEPER_ADDRESS`, then the deployer).
 * @param {object|string} [options.vestingKeeper]     Automated distribution keeper ({Vesting-KEEPER_ROLE}; defaults to `VESTING_KEEPER_ADDRESS`, then `options.keeper`).
 * @param {object|string} [options.pauser]            Emergency-stop delegate (defaults to `PAUSER_ADDRESS`, then the deployer).
 * @param {object[]}      [options.vestingBuckets]    Team / marketing schedules to create (defaults to the `VESTING_*` environment variables).
 * @param {string}        [options.usdtAddress]       Settlement token (defaults to `USDT_ADDRESS`, then MockUSDT).
 * @param {string}        [options.routerAddress]     DEX of the market maker (defaults to `DEX_ROUTER_ADDRESS`, then MockDEXRouter).
 * @param {bigint}        [options.bootstrapSupply]   NAVIS minted before the handoff (defaults to `BOOTSTRAP_SUPPLY_NAVIS`).
 * @param {object|string} [options.bootstrapReceiver] Receiver of the bootstrap supply (defaults to `BOOTSTRAP_RECEIVER`, then the deployer).
 * @param {bigint}        [options.seedReserve]       USDT seeded into the treasury (defaults to `SEED_RESERVE_USDT`).
 * @param {bigint}        [options.seedFloat]         USDT seeded as arbitrage float (defaults to `SEED_FLOAT_USDT`).
 * @returns {Promise<object>} The deployed contracts, their addresses and the wiring metadata.
 */
async function deployProtocol(options = {}) {
  const signers = await ethers.getSigners();
  const deployer = options.deployer ?? signers[0];

  const isLocalNetwork = LOCAL_NETWORKS.has(hre.network.name);
  const mocksAllowed = MOCK_NETWORKS.has(hre.network.name);
  const usdtAddress = options.usdtAddress ?? envAddress("USDT_ADDRESS");
  const routerAddress = options.routerAddress ?? envAddress("DEX_ROUTER_ADDRESS");
  const keeperAddress = await toAddress(
    options.keeper ?? envAddress("KEEPER_ADDRESS"),
    deployer.address
  );
  const pauserAddress = await toAddress(
    options.pauser ?? envAddress("PAUSER_ADDRESS"),
    deployer.address
  );
  // The vesting keeper runs {Vesting-releaseBatch} / {Vesting-claimFor}: a
  // dedicated relayer can be named, otherwise the arbitrage keeper does both.
  const vestingKeeperAddress = await toAddress(
    options.vestingKeeper ?? envAddress("VESTING_KEEPER_ADDRESS"),
    keeperAddress
  );

  if (!usdtAddress && !mocksAllowed) {
    throw new Error(
      "deploy: USDT_ADDRESS must be set outside of a local network or bscTestnet"
    );
  }
  if (!routerAddress && !mocksAllowed) {
    throw new Error(
      "deploy: DEX_ROUTER_ADDRESS must be set outside of a local network or bscTestnet"
    );
  }

  /* ---- infrastructure: settlement token ---------------------------- */

  let usdtToken;
  let usdtIsMock = false;

  if (usdtAddress) {
    // A real USDT is used read-only: it has no mint entry point.
    usdtToken = await ethers.getContractAt(ERC20_ARTIFACT, usdtAddress);
  } else {
    usdtToken = await (await ethers.getContractFactory("MockUSDT"))
      .connect(deployer)
      .deploy();
    await usdtToken.waitForDeployment();
    usdtIsMock = true;
  }
  const usdtTokenAddress = await usdtToken.getAddress();

  /* ---- 1. NAVIS token ---------------------------------------------- */

  // The deployer keeps the ownership (and therefore the minting right) until the
  // presale is ready to take it over in the wiring step.
  const navToken = await (await ethers.getContractFactory("NAVToken"))
    .connect(deployer)
    .deploy(deployer.address);
  await navToken.waitForDeployment();
  const navTokenAddress = await navToken.getAddress();

  /* ---- 2. Vesting (team / marketing custody) ----------------------- */

  // The vesting module only needs the token address: it custodies allocations
  // that are minted to it before the token ownership is handed to the presale.
  const vesting = await (await ethers.getContractFactory("Vesting"))
    .connect(deployer)
    .deploy(deployer.address, navTokenAddress);
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();

  /* ---- infrastructure: DEX the market maker trades on -------------- */

  let router;
  let routerIsMock = false;

  if (routerAddress) {
    router = await ethers.getContractAt("IDEXRouter", routerAddress);
  } else {
    router = await (await ethers.getContractFactory("MockDEXRouter"))
      .connect(deployer)
      .deploy(usdtTokenAddress, navTokenAddress);
    await router.waitForDeployment();
    routerIsMock = true;
  }
  const routerDeployedAddress = await router.getAddress();

  /* ---- 3. Presale -------------------------------------------------- */

  // The presale needs a non-zero vault and liquidity pool at construction time,
  // while the real treasury and market maker only exist after it. The deployer
  // therefore stands in as a placeholder and the wiring step re-points both at
  // the real contracts.
  const presale = await (await ethers.getContractFactory("Presale"))
    .connect(deployer)
    .deploy(
      deployer.address,
      navTokenAddress,
      usdtTokenAddress,
      deployer.address, // temporary treasury vault
      deployer.address // temporary liquidity pool
    );
  await presale.waitForDeployment();

  /* ---- 4. Treasury ------------------------------------------------- */

  const treasury = await (await ethers.getContractFactory("Treasury"))
    .connect(deployer)
    .deploy(deployer.address, navTokenAddress, usdtTokenAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();

  /* ---- 5. MarketMaker ---------------------------------------------- */

  const marketMaker = await (await ethers.getContractFactory("MarketMaker"))
    .connect(deployer)
    .deploy(
      deployer.address,
      navTokenAddress,
      usdtTokenAddress,
      treasuryAddress,
      routerDeployedAddress
    );
  await marketMaker.waitForDeployment();
  const marketMakerAddress = await marketMaker.getAddress();
  const presaleAddress = await presale.getAddress();

  /* ---- optional bootstrap of the economy --------------------------- */

  // Every sub-phase price is derived from `NAV Floor = reserve / supply`, so a
  // fresh deployment needs an initial supply and a reserve before the presale can
  // sell anything. The supply has to be minted while the deployer still owns the
  // token, i.e. before the ownership handoff below.
  const bootstrapSupply =
    options.bootstrapSupply ?? envWholeTokens("BOOTSTRAP_SUPPLY_NAVIS", NAVIS_SCALE);

  if (bootstrapSupply > 0n) {
    const bootstrapReceiver = await toAddress(
      options.bootstrapReceiver ?? envAddress("BOOTSTRAP_RECEIVER"),
      deployer.address
    );
    await navToken
      .connect(deployer)
      .mintDirect(bootstrapReceiver, bootstrapSupply);
  }

  /* ---- optional bootstrap of the vesting buckets ------------------- */

  // The team / marketing allocations follow the same rule as the bootstrap
  // supply: they are minted while the deployer still owns the token, land in the
  // custody of the vesting module and become schedules before the hand-off.
  const bucketSpecs = options.vestingBuckets ?? VESTING_BUCKETS;
  const vestingSchedules = [];
  let vestingMinted = 0n;

  for (const bucket of bucketSpecs) {
    const spec = await readVestingBucket(bucket, deployer.address);
    if (!spec) {
      continue;
    }

    await navToken.connect(deployer).mintDirect(vestingAddress, spec.amount);
    await vesting.connect(deployer).setRoleShare(spec.role, spec.shareBps);
    await vesting
      .connect(deployer)
      .createSchedule(
        spec.beneficiary,
        spec.role,
        spec.amount,
        0, // a start of zero means "now": the curve begins with the deployment
        spec.cliff,
        spec.duration,
        spec.revocable
      );

    vestingMinted += spec.amount;
    vestingSchedules.push({
      role: spec.role,
      beneficiary: spec.beneficiary,
      amount: spec.amount.toString(),
      cliffDays: Number(spec.cliff / 86400n),
      durationDays: Number(spec.duration / 86400n),
      sharePercent: spec.shareBps / 100,
      revocable: spec.revocable,
    });
  }

  // The Merkle claim campaigns are paid out of the part of the custody that no
  // schedule claims ({Vesting-freeBalance}), so a distribution budget is minted
  // to this contract *without* a schedule: the owner then reserves it with
  // {Vesting-createCampaign} / {Vesting-topUpCampaign}. Deriving the budget from
  // unallocated tokens is what keeps the two promises apart - an airdrop can
  // never starve a vesting curve, and a curve can never block an airdrop.
  const campaignReserve =
    options.vestingCampaignReserve ??
    envWholeTokens("VESTING_CAMPAIGN_RESERVE_NAVIS", NAVIS_SCALE);

  if (campaignReserve > 0n) {
    await navToken.connect(deployer).mintDirect(vestingAddress, campaignReserve);
  }

  // The reserve and the arbitrage float can only be minted with the MockUSDT
  // shipped with the repository: on a real deployment they are funded out of band.
  const seedReserve =
    options.seedReserve ?? envWholeTokens("SEED_RESERVE_USDT", USDT_SCALE);
  const seedFloat =
    options.seedFloat ?? envWholeTokens("SEED_FLOAT_USDT", USDT_SCALE);

  if ((seedReserve > 0n || seedFloat > 0n) && !usdtIsMock) {
    throw new Error(
      "deploy: seeding the reserve/float needs the MockUSDT; fund it out of band instead"
    );
  }
  if (seedReserve > 0n) {
    await usdtToken.connect(deployer).mint(treasuryAddress, seedReserve);
  }
  if (seedFloat > 0n) {
    await usdtToken.connect(deployer).mint(marketMakerAddress, seedFloat);
  }

  /* ---- wiring ------------------------------------------------------ */

  // 1. The treasury burns what it redeems. This must run before the handoff:
  //    `setBurner` is onlyOwner and the deployer is about to lose that right.
  await navToken.connect(deployer).setBurner(treasuryAddress, true);

  // 1b. Same ordering rule for the emergency stop: the pauser has to be granted
  //     while the deployer still owns the token.
  await navToken.connect(deployer).setPauser(pauserAddress, true);

  // 2. Hand the issuance over to the presale: owning the token is what grants the
  //    minting right ({NAVToken-mintDirect}).
  await navToken.connect(deployer).transferOwnership(presaleAddress);

  // 3. Replace the construction placeholders of the presale with the real
  //    destinations: the floor value goes to the treasury, the premium to the
  //    market maker.
  await presale.connect(deployer).setTreasuryVault(treasuryAddress);
  await presale.connect(deployer).setLiquidityPool(marketMakerAddress);

  // 4. Only the market maker may draw flash loans from the reserve.
  await treasury.connect(deployer).setWhitelisted(marketMakerAddress, true);

  // 5. Authorise the arbitrage keeper.
  await marketMaker.connect(deployer).setKeeper(keeperAddress, true);

  // 6. Authorise the vesting keeper. Owning {Vesting} is enough to run the
  //    automated distribution, so this grant only *delegates* it: a relayer
  //    holding {Vesting-KEEPER_ROLE} settles schedules with {Vesting-releaseBatch}
  //    and pays committed campaign allocations with {Vesting-claimFor}, while
  //    creating schedules and re-pointing campaign roots stay with the owner.
  if (!(await vesting.isKeeper(vestingKeeperAddress))) {
    await vesting.connect(deployer).grantKeeper(vestingKeeperAddress);
  }

  // 7. The emergency stop of the presale and the treasury follows the same
  //    pauser as the token, so one wallet can freeze (and resume) the protocol.
  await presale.connect(deployer).setPauser(pauserAddress, true);
  await treasury.connect(deployer).setPauser(pauserAddress, true);

  /* ---- report ------------------------------------------------------ */

  return {
    // Deployed contracts.
    navToken,
    usdtToken,
    presale,
    treasury,
    router,
    marketMaker,
    vesting,
    // Actors.
    deployer,
    keeper: keeperAddress,
    vestingKeeper: vestingKeeperAddress,
    pauser: pauserAddress,
    addresses: {
      navToken: navTokenAddress,
      usdtToken: usdtTokenAddress,
      presale: presaleAddress,
      treasury: treasuryAddress,
      router: routerDeployedAddress,
      marketMaker: marketMakerAddress,
      vesting: vestingAddress,
      keeper: keeperAddress,
      vestingKeeper: vestingKeeperAddress,
    },
    // Deployment metadata.
    usdtIsMock,
    routerIsMock,
    isLocalNetwork,
    vestingSchedules,
    vestingMinted,
    /// NAVIS minted to the custody with no schedule attached: the pool the
    /// claim campaigns of the deployment are created from.
    vestingCampaignReserve: campaignReserve,
    bootstrap: {
      supply: bootstrapSupply,
      reserve: seedReserve,
      float: seedFloat,
    },
  };
}

/* ------------------------------------------------------------------ */
/*                                 MAIN                               */
/* ------------------------------------------------------------------ */

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying the NAV ecosystem to network:", hre.network.name);
  console.log("Deployer / owner:", deployer.address);

  const deployment = await deployProtocol();
  const { addresses, navToken, treasury, presale, marketMaker, vesting } = deployment;

  console.log("");
  console.log("Infrastructure:");
  console.log(
    "  USDT        :",
    addresses.usdtToken,
    deployment.usdtIsMock ? "(MockUSDT)" : "(external)"
  );
  console.log(
    "  DEX router  :",
    addresses.router,
    deployment.routerIsMock ? "(MockDEXRouter)" : "(external)"
  );

  console.log("");
  console.log("Protocol contracts:");
  console.log("  1. NAVToken    :", addresses.navToken);
  console.log("  2. Vesting     :", addresses.vesting);
  console.log("  3. Presale     :", addresses.presale);
  console.log("  4. Treasury    :", addresses.treasury);
  console.log("  5. MarketMaker :", addresses.marketMaker);

  console.log("");
  console.log("Wiring:");
  console.log(
    "  NAVToken.owner()             =",
    await navToken.owner(),
    "(the presale)"
  );
  console.log(
    "  NAVToken.isBurner(treasury)  =",
    await navToken.isBurner(addresses.treasury)
  );
  console.log(
    "  Presale.treasuryVault()      =",
    await presale.treasuryVault()
  );
  console.log(
    "  Presale.liquidityPool()      =",
    await presale.liquidityPool(),
    "(the market maker)"
  );
  console.log(
    "  Treasury.isWhitelisted(mm)   =",
    await treasury.isWhitelisted(addresses.marketMaker)
  );
  console.log(
    "  MarketMaker.isKeeper(keeper) =",
    await marketMaker.isKeeper(addresses.keeper)
  );
  console.log(
    "  Vesting.isKeeper(keeper)     =",
    await vesting.isKeeper(deployment.vestingKeeper),
    "({KEEPER_ROLE} ·",
    (await vesting.keeperCount()).toString(),
    "keeper(s) registered)"
  );
  console.log(
    "  Presale.DEFAULT_LOCK_PERIOD =",
    (await presale.DEFAULT_LOCK_PERIOD()).toString(),
    "seconds (redemption lock of a new sub-phase)"
  );
  console.log(
    "  NAVToken.isPauser(pauser)    =",
    await navToken.isPauser(deployment.pauser),
    "(emergency stop of the whole protocol)"
  );
  console.log(
    "  Vesting.scheduleCount()      =",
    (await vesting.scheduleCount()).toString(),
    "·",
    (await vesting.vestingBalance()).toString(),
    "base units in custody"
  );
  console.log(
    "  Vesting.freeBalance()        =",
    (await vesting.freeBalance()).toString(),
    "base units unallocated (claim campaign budgets)"
  );
  for (const schedule of deployment.vestingSchedules) {
    console.log(
      "    -",
      schedule.role.padEnd(10),
      schedule.amount,
      "NAVIS ·",
      schedule.cliffDays + "d cliff /",
      schedule.durationDays + "d vesting ·",
      schedule.sharePercent + "% of the supply ·",
      schedule.revocable ? "revocable" : "irrevocable"
    );
  }

  console.log("");
  console.log("Bootstrap (base units):");
  console.log("  supply =", deployment.bootstrap.supply.toString());
  console.log("  reserve =", deployment.bootstrap.reserve.toString());
  console.log("  float   =", deployment.bootstrap.float.toString());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { deployProtocol, navis, usdt };
