// SPDX-License-Identifier: MIT
const hre = require("hardhat");

const { ethers } = hre;

/**
 * @file Deployment and on-chain wiring of the NAV ecosystem.
 *
 * @notice Deploys the four protocol contracts in the canonical order
 *
 *             1. NAVToken
 *             2. Presale
 *             3. Treasury
 *             4. MarketMaker
 *
 *         and wires their roles together:
 *
 *           - `NAVToken.setBurner(treasury, true)`         treasury burns redemptions
 *           - `NAVToken.transferOwnership(presale)`        presale mints the issuance
 *           - `Presale.setTreasuryVault(treasury)`         floor value of a purchase
 *           - `Presale.setLiquidityPool(marketMaker)`      premium of a purchase
 *           - `Treasury.setWhitelisted(marketMaker, true)` flash-loan receiver
 *           - `MarketMaker.setKeeper(keeper, true)`        arbitrage robot
 *
 * @dev    Two ordering constraints drive the exact sequence of the wiring step:
 *
 *           1. `setBurner` is `onlyOwner` on the NAVIS token, so it has to run
 *              *before* the ownership is handed over to the presale: afterwards
 *              the deployer is no longer able to reconfigure the token.
 *           2. The presale requires a non-zero treasury vault and liquidity pool
 *              at construction time, while both contracts only exist later. It is
 *              therefore born with the deployer as a temporary placeholder and is
 *              re-pointed at the real contracts in the wiring step.
 *
 *         The minting right of the presale is realised through the token
 *         ownership ({NAVToken-mintDirect} is `onlyOwner`); the repository has no
 *         separate minter role.
 *
 *         Settlement and DEX addresses are read from the environment
 *         (`USDT_ADDRESS`, `DEX_ROUTER_ADDRESS`). On a local network both may be
 *         omitted, in which case the repository mocks are deployed so that the
 *         complete wiring can be exercised end to end.
 */

/* ------------------------------------------------------------------ */
/*                              CONSTANTS                             */
/* ------------------------------------------------------------------ */

const NAVIS_SCALE = 10n ** 18n; // NAVIS has 18 decimals
const USDT_SCALE = 10n ** 6n; // USDT has 6 decimals

/// Networks on which the repository mocks may stand in for the real tokens.
const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

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
  const usdtAddress = options.usdtAddress ?? envAddress("USDT_ADDRESS");
  const routerAddress = options.routerAddress ?? envAddress("DEX_ROUTER_ADDRESS");
  const keeperAddress = await toAddress(
    options.keeper ?? envAddress("KEEPER_ADDRESS"),
    deployer.address
  );

  if (!usdtAddress && !isLocalNetwork) {
    throw new Error("deploy: USDT_ADDRESS must be set outside of a local network");
  }
  if (!routerAddress && !isLocalNetwork) {
    throw new Error(
      "deploy: DEX_ROUTER_ADDRESS must be set outside of a local network"
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

  /* ---- 2. Presale -------------------------------------------------- */

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

  /* ---- 3. Treasury ------------------------------------------------- */

  const treasury = await (await ethers.getContractFactory("Treasury"))
    .connect(deployer)
    .deploy(deployer.address, navTokenAddress, usdtTokenAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();

  /* ---- 4. MarketMaker ---------------------------------------------- */

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

  /* ---- report ------------------------------------------------------ */

  return {
    // Deployed contracts.
    navToken,
    usdtToken,
    presale,
    treasury,
    router,
    marketMaker,
    // Actors.
    deployer,
    keeper: keeperAddress,
    addresses: {
      navToken: navTokenAddress,
      usdtToken: usdtTokenAddress,
      presale: presaleAddress,
      treasury: treasuryAddress,
      router: routerDeployedAddress,
      marketMaker: marketMakerAddress,
      keeper: keeperAddress,
    },
    // Deployment metadata.
    usdtIsMock,
    routerIsMock,
    isLocalNetwork,
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
  const { addresses, navToken, treasury, presale, marketMaker } = deployment;

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
  console.log("  2. Presale     :", addresses.presale);
  console.log("  3. Treasury    :", addresses.treasury);
  console.log("  4. MarketMaker :", addresses.marketMaker);

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
    "  Presale.DEFAULT_LOCK_PERIOD =",
    (await presale.DEFAULT_LOCK_PERIOD()).toString(),
    "seconds (redemption lock of a new sub-phase)"
  );

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
