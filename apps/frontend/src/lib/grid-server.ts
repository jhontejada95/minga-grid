/**
 * Server-side helpers for the MINGA Grid route handlers.
 *
 * These run in Next's Node runtime, which is all the demand-response flow needs: no database, no
 * background process, no private key with funds. The device and agent identities are derived from
 * public seeds and only ever SIGN DATA — signing costs no gas — so nothing here can move money.
 * The user's own wallet broadcasts `release()`.
 *
 * Every chain read is retried: the public HSK testnet RPC is load balanced across nodes that lag
 * each other by seconds, and a read taken right after a write often sees the old state.
 */
import { createPublicClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { conservationAgreementAbi } from "@minga/shared";

export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet-explorer.hskchain.net").replace(/\/$/, "");
export const RPC_URL = process.env.HSK_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hsk.xyz";

/** Programme terms, agreed off chain and committed in `termsHash`. */
export const COMMITTED_WH = 500_000; // 500 kWh
/**
 * Below the evening spot price on purpose: XM's published evening peak runs around USD 0.31/kWh,
 * so paying 0.15 per avoided kWh leaves the offtaker roughly half the cost of buying it.
 */
export const TARIFF_MICRO_USD_PER_KWH = 150_000; // USD 0.15

export const hskTestnet = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
  testnet: true,
});

export function publicClient(): PublicClient {
  return createPublicClient({ chain: hskTestnet, transport: http(RPC_URL, { timeout: 45_000 }), cacheTime: 0 });
}

/** Deployment-ready defaults; an environment variable only points the app somewhere else. */
const DEFAULTS = {
  agreement: "0x315DE6Ff84680012cf81bFd9C256032996809cEC",
  token: "0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1",
  factory: "0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1",
} as const;

function address(raw: string | undefined, fallback: string): Address | null {
  const value = (raw ?? "").trim() || fallback;
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}

export const programAddress = () =>
  address(process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS ?? process.env.GRID_AGREEMENT_ADDRESS, DEFAULTS.agreement);
export const tokenAddress = () => address(process.env.NEXT_PUBLIC_MOCK_USD_ADDRESS, DEFAULTS.token);
export const factoryAddress = () => address(process.env.NEXT_PUBLIC_FACTORY_ADDRESS, DEFAULTS.factory);

export async function retry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i < attempts) await new Promise((r) => setTimeout(r, 900 * i));
    }
  }
  throw new Error(`${label}: ${(last as Error).message}`);
}

/** Read one field of the agreement, with retries. */
export function agreementReader(client: PublicClient, agreement: Address) {
  return (fn: string, args: readonly unknown[] = []) =>
    retry(`read ${fn}`, () =>
      client.readContract({ address: agreement, abi: conservationAgreementAbi, functionName: fn as never, args: args as never }),
    );
}

/** JSON cannot carry bigint. Amounts cross the wire as decimal strings and are rebuilt client-side. */
export const asString = (v: bigint) => v.toString();
export const money = (v: bigint) => Number(v) / 1e6;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export type { Hex };
