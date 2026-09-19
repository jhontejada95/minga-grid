import { defineChain, type Address } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 133);
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hsk.xyz";
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet-explorer.hskchain.net").replace(/\/$/, "");
export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || undefined) as Address | undefined;
export const MOCK_USD_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_USD_ADDRESS || undefined) as Address | undefined;
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined;
export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "mUSD";

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 133 ? "HSKChain Testnet" : `Chain ${CHAIN_ID}`,
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_URL } },
  testnet: true,
});

export const BANNER_TEXT = "HSK testnet · No monetary value · Demonstration project and evidence.";
