import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Resolve relative to this file, not to the current working directory.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // OpenZeppelin 5.x uses MCOPY (Cancun). Verified live on HSK testnet (chain 133):
      // MCOPY and TSTORE execute via eth_call.
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    hskTestnet: {
      url: process.env.HSK_RPC_URL || "https://testnet.hsk.xyz",
      chainId: 133,
      accounts: deployerPrivateKey,
      timeout: 120_000,
    },
  },
  // The HSK testnet explorer is Blockscout (v7). It exposes an Etherscan-compatible API and
  // ignores the API key value, but hardhat-verify requires one to be present.
  etherscan: {
    apiKey: { hskTestnet: "blockscout-does-not-need-a-key" },
    customChains: [
      {
        network: "hskTestnet",
        chainId: 133,
        urls: {
          apiURL: "https://testnet-explorer.hskchain.net/api",
          browserURL: "https://testnet-explorer.hskchain.net",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
