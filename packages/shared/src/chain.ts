export interface ChainConfig {
  id: number;
  name: string;
  network: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const HSK_TESTNET: ChainConfig = {
  id: 133,
  name: "HSKChain Testnet",
  network: "hsk-testnet",
  rpcUrl: "https://testnet.hsk.xyz",
  blockExplorerUrl: "https://testnet-explorer.hskchain.net",
  nativeCurrency: {
    name: "HashKey EcoPoints",
    symbol: "HSK",
    decimals: 18,
  },
};

export const HARDHAT_LOCAL: ChainConfig = {
  id: 31337,
  name: "Hardhat Local",
  network: "hardhat",
  rpcUrl: "http://127.0.0.1:8545",
  blockExplorerUrl: "",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
};
