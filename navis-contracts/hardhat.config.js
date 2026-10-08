require("@nomicfoundation/hardhat-toolbox");

const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ */
/*                              ENVIRONMENT                           */
/* ------------------------------------------------------------------ */

/**
 * Minimal `.env` loader.
 *
 * The workspace deliberately carries no `dotenv` dependency: a `KEY=VALUE` file
 * needs a dozen lines, not a package. Variables already present in the
 * environment win, so a shell prefix
 *
 *     PRIVATE_KEY=0x… npx hardhat run scripts/deploy.js --network bscTestnet
 *
 * still overrides whatever `.env` holds.
 */
function loadEnv(file) {
  if (!fs.existsSync(file)) {
    return;
  }
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv(path.join(__dirname, ".env"));

/// Signing account of `bscTestnet`; absent in `.env` → the network has no signers.
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();
const SIGNER_KEY = PRIVATE_KEY
  ? PRIVATE_KEY.startsWith("0x")
    ? PRIVATE_KEY
    : `0x${PRIVATE_KEY}`
  : null;

/// Public RPC of the BNB Smart Chain testnet (the built-in seed node).
const BSC_TESTNET_RPC =
  (process.env.BSC_TESTNET_RPC || "").trim() ||
  "https://data-seed-prebsc-1-s1.binance.org:8545";

/// Optional Etherscan/BscScan key, only wired up when actually provided.
const BSCSCAN_API_KEY = (process.env.BSCSCAN_API_KEY || "").trim();

/* ------------------------------------------------------------------ */
/*                                CONFIG                              */
/* ------------------------------------------------------------------ */

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // In-process chain used by `npx hardhat test` and `npx hardhat run` without
    // `--network`. Chain id 31337 is what the landing page treats as "the local
    // NAVIS node".
    hardhat: {
      chainId: 31337,
    },

    // `npx hardhat node` + `hardhat run … --network localhost`, i.e. the node the
    // landing page reads its live treasury figures from.
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // BNB Smart Chain testnet. Deploy with
    //
    //   BOOTSTRAP_SUPPLY_NAVIS=1000000 SEED_RESERVE_USDT=250000 \
    //   SEED_FLOAT_USDT=50000 \
    //   npx hardhat run scripts/deploy.js --network bscTestnet
    //
    // `accounts` stays empty when `.env` has no PRIVATE_KEY: `compile` and `test`
    // keep working and a deploy fails loudly with "No signers available" rather
    // than silently signing with something unexpected.
    bscTestnet: {
      url: BSC_TESTNET_RPC,
      chainId: 97,
      accounts: SIGNER_KEY ? [SIGNER_KEY] : [],
      // Public testnet RPCs can be slow on the first request of a burst.
      timeout: 120000,
    },
  },
};

if (BSCSCAN_API_KEY) {
  config.etherscan = { apiKey: { bscTestnet: BSCSCAN_API_KEY } };
}

module.exports = config;
