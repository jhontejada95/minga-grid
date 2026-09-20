import { defineChain, type Address } from "viem";

/**
 * Every value here is public: contract addresses, a public RPC and an explorer URL. They carry
 * deployment-ready defaults on purpose, so the app runs anywhere without configuration and an
 * environment variable is only needed to point it somewhere else.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 133);
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hsk.xyz";
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet-explorer.hskchain.net").replace(/\/$/, "");
export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1") as Address;
export const MOCK_USD_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_USD_ADDRESS || "0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1") as Address;
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

export const GRID_AGREEMENT_ADDRESS = (process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS || "0x315DE6Ff84680012cf81bFd9C256032996809cEC") as Address;

export const BANNER_TEXT = "HSK testnet · No monetary value · Demonstration project and evidence.";
