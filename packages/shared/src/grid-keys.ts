/**
 * Deterministic development identities for MINGA Grid.
 *
 * These keys sign DATA (meter readings, settlement approvals). They never hold funds and they
 * are derived from public strings, so they are publicly known by design — exactly like the
 * well-known Hardhat accounts. Deriving them instead of storing them keeps the demo
 * reproducible: any machine that checks out this repository gets the same device and agent
 * addresses, so an agreement created on HSK keeps working.
 *
 * To use real keys instead, set DEVICE_PRIVATE_KEY / AGENT_PRIVATE_KEY in .env.
 * NEVER point these at a key that holds value.
 */
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const DEVICE_SEED = "minga-grid/dev/device/1";
const AGENT_SEED = "minga-grid/dev/agent/1";
const SITE_PAYEE_SEED = "minga-grid/dev/site-payee/1";
const TREASURY_SEED = "minga-grid/dev/treasury/1";

/** Just the shape this module needs from an environment, so it does not depend on Node's globals. */
type EnvLike = Record<string, string | undefined>;

function devKey(seed: string): Hex {
  return keccak256(toBytes(seed));
}

function fromEnvOrSeed(envValue: string | undefined, seed: string): PrivateKeyAccount {
  const raw = envValue?.trim();
  if (raw && /^0x[0-9a-fA-F]{64}$/.test(raw)) return privateKeyToAccount(raw as Hex);
  return privateKeyToAccount(devKey(seed));
}

/** The smart meter's identity. Signs readings. */
export function deviceAccount(env: EnvLike = process.env): PrivateKeyAccount {
  return fromEnvOrSeed(env.DEVICE_PRIVATE_KEY, DEVICE_SEED);
}

/** The settlement agent's identity. Signs the EIP-712 settlement approval. */
export function agentAccount(env: EnvLike = process.env): PrivateKeyAccount {
  return fromEnvOrSeed(env.AGENT_PRIVATE_KEY, AGENT_SEED);
}

/**
 * Where the site's share lands. A payee only receives tokens, so it never needs gas and never
 * signs anything; the address is immutable once the program is created on chain.
 */
export function sitePayeeAccount(env: EnvLike = process.env): PrivateKeyAccount {
  return fromEnvOrSeed(env.SITE_PAYEE_PRIVATE_KEY, SITE_PAYEE_SEED);
}

/** Where the protocol's 10% lands. This address IS the revenue line; replace it with a real treasury. */
export function treasuryAccount(env: EnvLike = process.env): PrivateKeyAccount {
  return fromEnvOrSeed(env.TREASURY_PRIVATE_KEY, TREASURY_SEED);
}
