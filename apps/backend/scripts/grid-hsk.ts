/**
 * MINGA Grid — run one full program on HSK Chain testnet.
 *
 *   top up machine accounts -> create program -> both machines accept -> offtaker funds
 *   -> settlement agent runs -> release() -> receipts
 *
 * Every step prints what it is about to do and what actually happened on chain. It spends real
 * testnet gas, so it refuses to start without an explicit key and it never invents one.
 *
 * Run from the repository root (the .env there is read automatically):
 *   node apps/backend/scripts/grid-hsk.mjs            # resume or create
 *   node apps/backend/scripts/grid-hsk.mjs --fresh    # force a new program
 *   node apps/backend/scripts/grid-hsk.mjs --dry-run  # print the plan and balances, send nothing
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  keccak256,
  parseEventLogs,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  agreementFactoryRegistryAbi,
  buildApprovalTypedData,
  conservationAgreementAbi,
  mockUsdAbi,
  type ApprovalMessage,
} from "@minga/shared";
import {
  agentAccount,
  buildFixtures,
  deviceAccount,
  fetchGridSignal,
  INTERVAL_SECONDS,
  METER_CHAIN_ID,
  runSettlement,
  sitePayeeAccount,
  treasuryAccount,
  UTC_OFFSET_SECONDS,
  type GridProgram,
} from "@minga/shared";

// ---------------------------------------------------------------------------
// Program parameters. Keep these in step with .claude/CLAUDE.md.
// ---------------------------------------------------------------------------
const MILESTONE_AMOUNT = 75_000_000n; // 75 mUSD per event window (6 decimals) = 500 kWh x USD 0.15
const WINDOWS = 2;
const COMMITTED_WH = 500_000; // the site commits to shedding 500 kWh
const TARIFF_MICRO_USD_PER_KWH = 150_000; // USD 0.15 per avoided kWh, against an evening spot of ~0.31
const COMMUNITY_BPS = 9000n; // 90% site / 10% protocol treasury
const MIN_MACHINE_GAS = 2_000_000_000_000_000n; // 0.002 HSK
const TOP_UP = 5_000_000_000_000_000n; // 0.005 HSK



const EXPLORER = "https://testnet-explorer.hskchain.net";
const hskTestnet = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
});

const ROOT = resolve(process.cwd());
const STATE_FILE = resolve(ROOT, "grid-hsk-run.json");
const FRESH = process.argv.includes("--fresh");
const DRY_RUN = process.argv.includes("--dry-run");

function log(label: string, value = "") {
  console.log(`${label.padEnd(22)}${value}`);
}
function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`);
}
const mUSD = (v: bigint) => `${(Number(v) / 1e6).toFixed(2)} mUSD`;

function requiredKey(name: string): Hex {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is empty in .env. This script will not invent a key.`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error(`${name} must be 0x followed by 64 hex characters.`);
  return raw as Hex;
}

async function main() {
  if (typeof process.loadEnvFile === "function" && existsSync(resolve(ROOT, ".env"))) {
    process.loadEnvFile(resolve(ROOT, ".env"));
  }

  const factory = process.env.FACTORY_ADDRESS as Address | undefined;
  const token = process.env.MOCK_USD_ADDRESS as Address | undefined;
  if (!factory || !token) throw new Error("FACTORY_ADDRESS and MOCK_USD_ADDRESS must be set in .env");

  const offtaker = privateKeyToAccount(requiredKey("DEPLOYER_PRIVATE_KEY"));
  const device = deviceAccount();
  const agent = agentAccount();
  const site = sitePayeeAccount();
  const treasury = treasuryAccount();

  const publicClient = createPublicClient({ chain: hskTestnet, transport: http(undefined, { timeout: 60_000 }) });
  const wallet = (a: PrivateKeyAccount) =>
    createWalletClient({ account: a, chain: hskTestnet, transport: http(undefined, { timeout: 60_000 }) });

  const send = async (a: PrivateKeyAccount, label: string, params: Record<string, unknown>) => {
    const hash = await wallet(a).writeContract(params as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
    log(`  ${label}`, `${EXPLORER}/tx/${hash}`);
    return receipt;
  };

  section("Identities");
  log("offtaker (payer)", offtaker.address);
  log("device (meter)", device.address);
  log("agent (settler)", agent.address);
  log("site payee 90%", site.address);
  log("treasury 10%", treasury.address);
  log("factory", factory);
  log("token (mUSD)", token);

  section("Balances");
  const chainId = await publicClient.getChainId();
  if (chainId !== 133) throw new Error(`Expected HSK testnet (133), the RPC answered ${chainId}`);
  log("chain id", String(chainId));
  for (const [name, a] of [["offtaker", offtaker], ["device", device], ["agent", agent]] as const) {
    log(`  ${name} HSK`, formatEther(await publicClient.getBalance({ address: a.address })));
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  section("Gas for the machines");
  for (const [name, a] of [["device", device], ["agent", agent]] as const) {
    const balance = await publicClient.getBalance({ address: a.address });
    if (balance >= MIN_MACHINE_GAS) {
      log(`  ${name}`, `already funded (${formatEther(balance)} HSK)`);
      continue;
    }
    const hash = await wallet(offtaker).sendTransaction({ to: a.address, value: TOP_UP });
    await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    log(`  ${name}`, `topped up with ${formatEther(TOP_UP)} HSK — ${EXPLORER}/tx/${hash}`);
  }

  // -------------------------------------------------------------------------
  let agreement: Address | undefined;
  const previous = !FRESH && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
  if (previous?.agreement) {
    agreement = previous.agreement as Address;
    section("Program");
    log("  reusing", `${agreement} (pass --fresh for a new one)`);
  } else {
    section("Create the program");
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const now = block.timestamp;
    const input = {
      communitySigner: device.address,
      verifierSigner: agent.address,
      token,
      projectRefHash: keccakText("minga-grid/program/co-valle-001"),
      metadataHash: keccakText("minga-grid/metadata/co-valle-001/v1"),
      methodologyHash: keccakText("mean-of-baseline-days/v1"),
      payeeCommunity: site.address,
      payeeMonitoring: treasury.address,
      communityBps: COMMUNITY_BPS,
      milestoneAmounts: Array.from({ length: WINDOWS }, () => MILESTONE_AMOUNT),
      fundingDeadline: now + 7200n,
      executionDeadline: now + 172_800n,
      demoMode: true,
    };
    const receipt = await send(offtaker, "createAgreement", {
      address: factory, abi: agreementFactoryRegistryAbi, functionName: "createAgreement", args: [input],
    });
    const ev = parseEventLogs({ abi: agreementFactoryRegistryAbi, logs: receipt.logs, eventName: "AgreementCreated" })[0];
    agreement = ev!.args.agreementAddress as Address;
    log("  program", `${EXPLORER}/address/${agreement}`);
    // Persist immediately: if a later step fails, the gas already spent is not lost.
    saveState({ agreement, factory, token, createdAt: new Date().toISOString() });
  }

  await waitForCode(publicClient, agreement!);

  const read = (fn: string, args: readonly unknown[] = []) =>
    retry(`read ${fn}`, () =>
      publicClient.readContract({ address: agreement!, abi: conservationAgreementAbi, functionName: fn as never, args: args as never }),
    );

  const termsHash = (await read("termsHash")) as Hex;

  section("Both machines accept the terms");
  for (const [name, a, flag] of [["device", device, "communityAccepted"], ["agent", agent, "verifierAccepted"]] as const) {
    if (await read(flag)) { log(`  ${name}`, "already accepted"); continue; }
    await send(a, `${name} acceptTerms`, {
      address: agreement, abi: conservationAgreementAbi, functionName: "acceptTerms", args: [termsHash],
    });
    await waitUntil(`${name} acceptance`, async () => Boolean(await read(flag)));
  }

  section("Offtaker funds the program");
  const budget = MILESTONE_AMOUNT * BigInt(WINDOWS);
  if (await read("funded")) {
    log("  funding", "already funded");
  } else {
    const tokenRead = (fn: string, args: readonly unknown[]) =>
      retry(`read ${fn}`, () =>
        publicClient.readContract({ address: token, abi: mockUsdAbi, functionName: fn as never, args: args as never }),
      ) as Promise<bigint>;

    if ((await tokenRead("balanceOf", [offtaker.address])) < budget) {
      // MockUSD.mint is public on testnet by design; the token has no monetary value.
      await send(offtaker, "mint mUSD", {
        address: token, abi: mockUsdAbi, functionName: "mint", args: [offtaker.address, budget],
      });
      await waitUntil("the minted balance", async () => (await tokenRead("balanceOf", [offtaker.address])) >= budget);
    }

    if ((await tokenRead("allowance", [offtaker.address, agreement])) < budget) {
      await send(offtaker, "approve", {
        address: token, abi: mockUsdAbi, functionName: "approve", args: [agreement, budget],
      });
    } else {
      log("  approve", "allowance already sufficient");
    }
    // fund() transfers exactly totalBudget, so it reverts if the allowance has not propagated yet.
    await waitUntil("the allowance", async () => (await tokenRead("allowance", [offtaker.address, agreement])) >= budget);

    await send(offtaker, "fund", { address: agreement, abi: conservationAgreementAbi, functionName: "fund" });
    await waitUntil("the funded flag", async () => Boolean(await read("funded")));
    log("  budget", mUSD(budget));
  }

  // -------------------------------------------------------------------------
  section("The settlement agent runs");
  const milestoneId = Number(await read("nextMilestoneId"));
  if (milestoneId >= WINDOWS) {
    log("  done", "every event window in this program has already been settled. Use --fresh.");
    return;
  }
  const f = await buildFixtures();
  const block = await publicClient.getBlock({ blockTag: "latest" });

  const program: GridProgram = {
    agreement: agreement!,
    meterChainId: METER_CHAIN_ID,
    siteId: f.siteId,
    device: device.address,
    agent: agent.address,
    committedWh: COMMITTED_WH,
    tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
    intervalSeconds: INTERVAL_SECONDS,
    utcOffsetSeconds: UTC_OFFSET_SECONDS,
  };

  const signWith = (a: PrivateKeyAccount) => async (m: ApprovalMessage): Promise<Hex> => {
    const td = buildApprovalTypedData(133, agreement!, m);
    return a.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
  };

  const outcome = await runSettlement({
    program,
    baselineReadings: f.baseline.readings.map((r) => r.reading),
    batch: f.delivered,
    signal: await fetchGridSignal(),
    chain: {
      termsHash,
      milestoneId,
      milestoneAmount: MILESTONE_AMOUNT,
      nonce: (await read("milestoneNonce", [BigInt(milestoneId)])) as bigint,
      demoMode: (await read("demoMode")) as boolean,
      fundedAt: (await read("fundedAt")) as bigint,
      executionDeadline: (await read("executionDeadline")) as bigint,
      now: block.timestamp,
    },
    signDevice: signWith(device),
    signAgent: signWith(agent),
  });

  for (const s of outcome.steps) log(`  ${s.ok ? "ok  " : "stop"} ${s.step}`, s.detail);

  if (!outcome.settled) {
    console.log(`\nThe agent refused to settle: ${outcome.reason}`);
    console.log("No transaction was sent. That is the agent working, not failing.");
    return;
  }

  section("Settlement on HSK");
  const before = await balances(publicClient, token, [site.address, treasury.address]);
  const expectedSite = (MILESTONE_AMOUNT * COMMUNITY_BPS) / 10_000n;
  // Any account may relay: the transaction carries no authority, only the two machine signatures do.
  const receipt = await send(offtaker, "release", {
    address: agreement, abi: conservationAgreementAbi, functionName: "release",
    args: [outcome.approval!, outcome.signatures!.device, outcome.signatures!.agent],
  });
  // The RPC lags, so wait until the payout is actually visible before reporting it. Showing a
  // wrong 0.00 on stage would be worse than waiting two seconds.
  await waitUntil("the payout to be visible", async () => {
    const now = await balances(publicClient, token, [site.address, treasury.address]);
    return now[0]! - before[0]! >= expectedSite;
  });
  const after = await balances(publicClient, token, [site.address, treasury.address]);

  log("  site received", mUSD(after[0]! - before[0]!));
  log("  treasury received", mUSD(after[1]! - before[1]!) + "   <- protocol revenue, settled on chain");
  log("  gas used", String(receipt.gasUsed));
  log("  evidence hash", outcome.evidence!.hash);

  saveState({
    network: "hskTestnet", chainId: 133, agreement, factory, token,
    offtaker: offtaker.address, device: device.address, agent: agent.address,
    sitePayee: site.address, treasury: treasury.address,
    committedWh: COMMITTED_WH, milestoneAmount: MILESTONE_AMOUNT.toString(), communityBps: Number(COMMUNITY_BPS),
    lastSettledMilestone: milestoneId, avoidedWh: outcome.settlement!.avoidedWh,
    baselineWh: outcome.settlement!.baselineWh, actualWh: outcome.settlement!.actualWh,
    evidenceHash: outcome.evidence!.hash, releaseTx: receipt.transactionHash,
    explorer: `${EXPLORER}/address/${agreement}`, at: new Date().toISOString(),
  });
  console.log(`\nWrote ${STATE_FILE}`);
  console.log(`Program on the explorer: ${EXPLORER}/address/${agreement}`);
}

async function balances(client: ReturnType<typeof createPublicClient>, token: Address, who: Address[]) {
  const out: bigint[] = [];
  for (const address of who) {
    out.push(
      (await retry("balanceOf", () =>
        client.readContract({ address: token, abi: mockUsdAbi, functionName: "balanceOf", args: [address] }),
      )) as bigint,
    );
  }
  return out;
}

/**
 * A freshly created contract is not visible on every RPC node at once. Poll until the address
 * actually has bytecode before reading from it, instead of failing on a race.
 */
async function waitForCode(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    const code = await client.getCode({ address }).catch(() => undefined);
    if (code && code !== "0x") return;
    if (Date.now() > deadline) throw new Error(`No bytecode at ${address} after ${timeoutMs / 1000}s`);
    if (!announced) {
      log("  waiting", "the RPC has not indexed the new contract yet, polling…");
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Poll until the chain actually reports the expected state.
 *
 * The public HSK testnet RPC is load balanced and its nodes lag each other by a few seconds, so
 * a transaction can be mined and confirmed while the very next read still sees the old state.
 * Every step that depends on a previous transaction waits here instead of assuming.
 */
async function waitUntil(label: string, check: () => Promise<boolean>, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    if (!announced) {
      log("  waiting", `for the RPC to report ${label}…`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Retry a read a few times: public RPCs drop or lag requests under load. */
async function retry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${(last as Error).message}`);
}

/** Merge into the run state file so a partial run is always resumable. */
function saveState(patch: Record<string, unknown>) {
  const current = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
  writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...patch }, null, 2) + "\n", "utf8");
}

function keccakText(text: string): Hex {
  return keccak256(toBytes(text));
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
});
