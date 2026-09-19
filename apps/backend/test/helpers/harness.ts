import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPublicClient, createTestClient, createWalletClient, http, parseEventLogs,
  type Address, type Hex, type PublicClient, type WalletClient,
} from "viem";
import { mnemonicToAccount, type LocalAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { FastifyInstance } from "fastify";
import { agreementFactoryRegistryAbi, buildApprovalTypedData, conservationAgreementAbi, mockUsdAbi, type ApprovalMessage } from "@minga/shared";
import { loadConfig, REPO_ROOT, type Config } from "../../src/config.js";
import { createViemChainReader } from "../../src/chain.js";
import { migrate, openDb } from "../../src/db.js";
import type { AppContext } from "../../src/context.js";
import type { PaymentClient } from "../../src/mpp.js";
import type { DraftResult } from "../../src/agreements.js";

// Anvil's public development mnemonic. These accounts only ever exist on a throwaway local chain.
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

export const ORIGIN = "http://localhost:3000";
export const CHAIN_ID = 31337;

export interface Accounts {
  deployer: LocalAccount;
  funder: LocalAccount;
  community: LocalAccount;
  reviewer: LocalAccount;
  payeeCommunity: LocalAccount;
  payeeMonitoring: LocalAccount;
  outsider: LocalAccount;
}

export interface Harness {
  rpcUrl: string;
  accounts: Accounts;
  publicClient: PublicClient;
  wallet: (a: LocalAccount) => WalletClient;
  token: Address;
  factory: Address;
  deployBlock: number;
  /** Advance chain time and mine a block. */
  increaseTime: (seconds: number) => Promise<void>;
  snapshot: () => Promise<Hex>;
  revert: (id: Hex) => Promise<void>;
  mine: (blocks?: number) => Promise<void>;
  chainNow: () => Promise<bigint>;
  stop: () => void;
}

export function anvilAvailable(): boolean {
  return findAnvil() !== undefined;
}

function findAnvil(): string | undefined {
  const exe = process.platform === "win32" ? "anvil.exe" : "anvil";
  const candidates = [process.env.ANVIL_BIN, path.join(os.homedir(), ".foundry", "bin", exe)].filter(Boolean) as string[];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) candidates.push(path.join(dir, exe));
  return candidates.find((c) => fs.existsSync(c));
}

const artifact = (file: string, name: string) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/contracts/artifacts/contracts", file, `${name}.json`), "utf8")) as {
    abi: never; bytecode: Hex;
  };

/** Starts a local anvil chain and deploys the real MockUSD and AgreementFactoryRegistry. Returns null if anvil is missing. */
export async function startHarness(opts: { port?: number } = {}): Promise<Harness | null> {
  const anvil = findAnvil();
  if (!anvil) return null;
  const port = opts.port ?? 8600 + Math.floor(Math.random() * 300);
  const proc: ChildProcess = spawn(anvil, ["--port", String(port), "--chain-id", String(CHAIN_ID), "--silent"], { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const publicClient: PublicClient = createPublicClient({ cacheTime: 0, transport: http(rpcUrl) });

  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (Date.now() > deadline) {
        proc.kill();
        throw new Error("anvil did not start in time");
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const acct = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });
  const deployer = acct(0);
  const funder = acct(1);
  const accounts: Accounts = {
    deployer, funder, community: acct(2), reviewer: acct(3), payeeCommunity: acct(4), payeeMonitoring: acct(5), outsider: acct(6),
  };
  const wallet = (a: LocalAccount) => createWalletClient({ account: a, transport: http(rpcUrl) }) as WalletClient;
  const testClient = createTestClient({ mode: "anvil", transport: http(rpcUrl) });

  const deploy = async (file: string, name: string) => {
    const art = artifact(file, name);
    const hash = await wallet(deployer).deployContract({ abi: art.abi, bytecode: art.bytecode, chain: null, account: deployer });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { address: receipt.contractAddress as Address, block: Number(receipt.blockNumber) };
  };
  const token = await deploy("MockUSD.sol", "MockUSD");
  const factory = await deploy("AgreementFactoryRegistry.sol", "AgreementFactoryRegistry");

  // Fund the payer with mUSD.
  const mint = await wallet(deployer).writeContract({
    address: token.address, abi: mockUsdAbi, functionName: "mint", args: [funder.address, 10_000_000_000n], chain: null, account: deployer,
  });
  await publicClient.waitForTransactionReceipt({ hash: mint });

  return {
    rpcUrl, accounts, publicClient, wallet, token: token.address, factory: factory.address, deployBlock: factory.block,
    increaseTime: async (s) => { await testClient.increaseTime({ seconds: s }); await testClient.mine({ blocks: 1 }); },
    snapshot: () => testClient.snapshot(),
    revert: async (id) => { await testClient.revert({ id }); },
    mine: async (n = 1) => { await testClient.mine({ blocks: n }); },
    chainNow: async () => (await publicClient.getBlock({ blockTag: "latest" })).timestamp,
    stop: () => { proc.kill(); },
  };
}

export interface TestContext {
  ctx: AppContext;
  clock: { now: number; advance: (ms: number) => void };
  cleanup: () => void;
  evidenceDir: string;
}

export function makeContext(
  h: Harness,
  opts: { env?: Record<string, string>; payments?: PaymentClient; dbPath?: string; evidenceDir?: string } = {}
): TestContext {
  const evidenceDir = opts.evidenceDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "minga-evidence-"));
  const config: Config = loadConfig({
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-test-session-secret-123456",
    FRONTEND_ORIGIN: ORIGIN,
    HSK_RPC_URL: h.rpcUrl,
    HSK_CHAIN_ID: String(CHAIN_ID),
    FACTORY_ADDRESS: h.factory,
    FACTORY_DEPLOYMENT_BLOCK: String(h.deployBlock),
    MOCK_USD_ADDRESS: h.token,
    DATABASE_PATH: opts.dbPath ?? ":memory:",
    EVIDENCE_STORAGE_PATH: evidenceDir,
    INDEXER_CONFIRMATIONS: "1",
    INDEXER_MAX_RANGE: "40",
    INDEXER_REORG_WINDOW: "8",
    ...opts.env,
  });
  const db = openDb(config.dbPath);
  migrate(db);
  const clock = { now: Date.now(), advance(ms: number) { this.now += ms; } };
  const ctx: AppContext = {
    config,
    db,
    chain: createViemChainReader({ rpcUrl: h.rpcUrl, chainId: CHAIN_ID }),
    now: () => clock.now,
    payments: opts.payments,
    log: { info: () => {}, warn: () => {} },
  };
  return { ctx, clock, evidenceDir, cleanup: () => { try { db.close(); } catch { /* already closed */ } fs.rmSync(evidenceDir, { recursive: true, force: true }); } };
}

// ---------------------------------------------------------------- HTTP helpers

export interface ApiResult<T = any> { status: number; json: T; headers: Record<string, unknown>; cookies: { name: string; value: string }[]; raw: Buffer }

export async function call(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  opts: { body?: unknown; cookie?: string; origin?: string | null; headers?: Record<string, string>; raw?: Buffer } = {}
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  let payload: string | Buffer | undefined;
  if (opts.raw) payload = opts.raw;
  else if (opts.body !== undefined) {
    payload = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const res = await app.inject({ method, url, headers, payload });
  let json: unknown = null;
  try { json = res.json(); } catch { json = null; }
  return {
    status: res.statusCode, json, headers: res.headers as Record<string, unknown>,
    cookies: res.cookies.map((c) => ({ name: c.name, value: c.value })), raw: res.rawPayload,
  };
}

/** Full SIWE login through the real API. Returns the session cookie header value. */
export async function login(app: FastifyInstance, ctx: AppContext, account: LocalAccount): Promise<string> {
  const ch = await call(app, "POST", "/api/v1/auth/challenge", { body: { wallet: account.address }, origin: null });
  const message = createSiweMessage({
    address: account.address, chainId: ch.json.chainId, domain: ch.json.domain, nonce: ch.json.nonce, uri: ch.json.uri,
    version: "1", statement: ch.json.statement, issuedAt: new Date(ch.json.issuedAt), expirationTime: new Date(ch.json.expirationTime),
  });
  const signature = await account.signMessage({ message });
  const res = await call(app, "POST", "/api/v1/auth/verify", { body: { message, signature }, origin: null });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.json)}`);
  void ctx;
  const c = res.cookies.find((x) => x.name === "minga_session");
  if (!c) throw new Error("no session cookie");
  return `minga_session=${c.value}`;
}

export function multipartBody(fileName: string, content: Buffer | string, contentType = "application/json") {
  const boundary = "----mingatest" + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), Buffer.isBuffer(content) ? content : Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { raw: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

// ---------------------------------------------------------------- chain actions

export const DEMO_METADATA = {
  projectId: "pacific-mangrove-demo",
  name: "Pacific Mangrove — Demo",
  description: "Restoration and sustainable protection of degraded mangrove ecosystems (fictional demonstration).",
  location: { region: "Chocó Biogeographic / Pacific Coast", country: "Colombia" },
  methodology: { name: "Demonstration Community Coastal Mangrove Standard v1.0", version: "1.0" },
  currency: "mUSD",
  totalBudget: "100000000",
  communitySplitBps: 8000,
  milestones: [
    { id: 0, title: "Baseline Survey and Community Work Plan", amount: "50000000", requiredEvidence: ["baseline-survey-v1", "community-assembly-resolution"] },
    { id: 1, title: "Year 1 Restoration and Canopy Density Report", amount: "50000000", requiredEvidence: ["restoration-monitoring-report-y1", "drone-canopy-orthomosaic"] },
  ],
};

export async function send(h: Harness, account: LocalAccount, address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) {
  const hash = await h.wallet(account).writeContract({ address, abi: abi as never, functionName: functionName as never, args: args as never, chain: null, account });
  const receipt = await h.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return receipt;
}

/** Creates an agreement through the factory as the funder, using the hashes returned by the draft endpoint. */
export async function createAgreementOnChain(h: Harness, draft: Pick<DraftResult, "metadataHash" | "projectRefHash" | "methodologyHash">, over: Record<string, unknown> = {}): Promise<Address> {
  const now = await h.chainNow();
  const a = h.accounts;
  const input = {
    communitySigner: a.community.address, verifierSigner: a.reviewer.address, token: h.token,
    projectRefHash: draft.projectRefHash, metadataHash: draft.metadataHash, methodologyHash: draft.methodologyHash,
    payeeCommunity: a.payeeCommunity.address, payeeMonitoring: a.payeeMonitoring.address, communityBps: 8000n,
    milestoneAmounts: [50_000_000n, 50_000_000n], fundingDeadline: now + 3600n, executionDeadline: now + 86_400n, demoMode: true,
    ...over,
  };
  const receipt = await send(h, a.funder, h.factory, agreementFactoryRegistryAbi, "createAgreement", [input]);
  const ev = parseEventLogs({ abi: agreementFactoryRegistryAbi, logs: receipt.logs, eventName: "AgreementCreated" })[0];
  return ev!.args.agreementAddress as Address;
}

export async function acceptAndFund(h: Harness, agreement: Address) {
  const a = h.accounts;
  const terms = (await h.publicClient.readContract({ address: agreement, abi: conservationAgreementAbi, functionName: "termsHash" })) as Hex;
  await send(h, a.community, agreement, conservationAgreementAbi, "acceptTerms", [terms]);
  await send(h, a.reviewer, agreement, conservationAgreementAbi, "acceptTerms", [terms]);
  await send(h, a.funder, h.token, mockUsdAbi, "approve", [agreement, 100_000_000n]);
  await send(h, a.funder, agreement, conservationAgreementAbi, "fund");
}

export async function signApproval(account: LocalAccount, agreement: Address, message: ApprovalMessage): Promise<Hex> {
  const td = buildApprovalTypedData(CHAIN_ID, agreement, message);
  return account.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
}
