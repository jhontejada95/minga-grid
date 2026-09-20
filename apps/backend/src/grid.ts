/**
 * MINGA Grid — HTTP surface for the demand-response demo.
 *
 * Four endpoints, deliberately small:
 *
 *   GET  /api/v1/grid/program   the program, its on-chain state and the receipts so far
 *   GET  /api/v1/grid/signal    the current grid signal and the agent's dispatch verdict
 *   GET  /api/v1/grid/site      what the site has earned, and its consumption curve
 *   POST /api/v1/grid/settle    run one settlement pass, optionally submitting release()
 *
 * `settle` takes a scenario so the demo can show BOTH outcomes: a site that delivered and a
 * site that did not. The refusal path is the interesting one — it is what makes the agent a
 * verifier rather than a rubber stamp.
 *
 * Every chain read goes through `readRetry`: the public HSK RPC is load balanced across nodes
 * that lag each other by seconds. See .claude/CLAUDE.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  agentAccount,
  assessGrid,
  buildApprovalTypedData,
  buildFixtures,
  conservationAgreementAbi,
  deviceAccount,
  INTERVAL_SECONDS,
  METER_CHAIN_ID,
  mockUsdAbi,
  fetchGridSignal,
  runSettlement,
  SITE_NAME,
  sitePayeeAccount,
  treasuryAccount,
  UTC_OFFSET_SECONDS,
  type ApprovalMessage,
  type GridProgram,
} from "@minga/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";


/** The reduction the site committed to for one event window. */
const COMMITTED_WH = 500_000; // 500 kWh
/**
 * What the offtaker pays per avoided kWh. Set below the evening spot price so the offtaker
 * actually saves: XM's published evening peak runs around USD 0.31/kWh, so paying 0.15 leaves
 * roughly half the cost of buying that energy on the spot market.
 */
const TARIFF_MICRO_USD_PER_KWH = 150_000; // USD 0.15
const EXPLORER = "https://testnet-explorer.hskchain.net";

const hskTestnet = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
});

/** The agreement address comes from the run file the HSK script writes, or from the environment. */
function programAddress(): Address | null {
  const fromEnv = process.env.GRID_AGREEMENT_ADDRESS?.trim();
  if (fromEnv && /^0x[0-9a-fA-F]{40}$/.test(fromEnv)) return fromEnv as Address;
  const file = resolve(process.cwd(), "grid-hsk-run.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { agreement?: string };
    return parsed.agreement && /^0x[0-9a-fA-F]{40}$/.test(parsed.agreement) ? (parsed.agreement as Address) : null;
  } catch {
    return null;
  }
}

async function readRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
  throw new Error(`${label}: ${(last as Error).message}`);
}

interface Wire {
  client: PublicClient;
  agreement: Address;
  token: Address;
  read: (fn: string, args?: readonly unknown[]) => Promise<unknown>;
}

function connect(): Wire | null {
  const agreement = programAddress();
  const token = process.env.MOCK_USD_ADDRESS as Address | undefined;
  if (!agreement || !token) return null;
  const client = createPublicClient({
    chain: hskTestnet,
    transport: http(process.env.HSK_RPC_URL, { timeout: 45_000 }),
    cacheTime: 0,
  });
  const read = (fn: string, args: readonly unknown[] = []) =>
    readRetry(`read ${fn}`, () =>
      client.readContract({ address: agreement, abi: conservationAgreementAbi, functionName: fn as never, args: args as never }),
    );
  return { client, agreement, token, read };
}

const money = (v: bigint) => Number(v) / 1e6;

export function registerGridRoutes(app: FastifyInstance, ctx: AppContext) {
  const device = deviceAccount();
  const agent = agentAccount();
  const site = sitePayeeAccount();
  const treasury = treasuryAccount();

  /** Identities and terms are static; they never depend on the chain being reachable. */
  const terms = {
    siteName: SITE_NAME,
    committedWh: COMMITTED_WH,
    tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
    intervalSeconds: INTERVAL_SECONDS,
    utcOffsetSeconds: UTC_OFFSET_SECONDS,
    eventWindowLocal: "18:00-21:00 COT",
    baselineMethod: "mean-of-baseline-days/v1",
    explorer: EXPLORER,
    participants: {
      device: device.address,
      agent: agent.address,
      sitePayee: site.address,
      treasury: treasury.address,
    },
  };

  app.get("/api/v1/grid/signal", async () => {
    const SIGNAL = await fetchGridSignal();
    const decision = assessGrid(SIGNAL);
    return {
      signal: { ...SIGNAL, spotUsdPerKwh: SIGNAL.spotPriceMicroUsdPerKwh / 1e6, dayAverageUsdPerKwh: SIGNAL.dailyAverageMicroUsdPerKwh / 1e6 },
      decision,
      thresholds: { criticalPeakRatio: 1.8, elevatedPeakRatio: 1.4, criticalReservoirPct: 35 },
    };
  });

  app.get("/api/v1/grid/program", async () => {
    const wire = connect();
    if (!wire) return { connected: false, terms, reason: "No program address. Run apps/backend/scripts/grid-hsk.mjs first." };

    const [totalBudget, totalPaid, nextMilestoneId, funded, communityBps, escrow] = await Promise.all([
      wire.read("totalBudget") as Promise<bigint>,
      wire.read("totalPaid") as Promise<bigint>,
      wire.read("nextMilestoneId") as Promise<bigint>,
      wire.read("funded") as Promise<boolean>,
      wire.read("communityBps") as Promise<bigint>,
      readRetry("escrow", () =>
        wire.client.readContract({ address: wire.token, abi: mockUsdAbi, functionName: "balanceOf", args: [wire.agreement] }),
      ) as Promise<bigint>,
    ]);

    const windows: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const paid = (await wire.read("milestonePaid", [BigInt(i)])) as boolean;
      const amount = (await wire.read("milestoneAmounts", [BigInt(i)])) as bigint;
      let receipt: Record<string, unknown> | null = null;
      if (paid) {
        const r = (await wire.read("milestoneReceipts", [BigInt(i)])) as readonly unknown[];
        receipt = {
          evidenceHash: r[1] as Hex,
          siteAmount: money(r[5] as bigint),
          treasuryAmount: money(r[6] as bigint),
          paidAt: Number(r[7] as bigint),
        };
      }
      windows.push({ id: i, paid, amount: money(amount), receipt });
    }

    return {
      connected: true,
      terms,
      address: wire.agreement,
      explorerUrl: `${EXPLORER}/address/${wire.agreement}`,
      token: wire.token,
      funded,
      siteBps: Number(communityBps),
      treasuryBps: 10_000 - Number(communityBps),
      totalBudget: money(totalBudget),
      totalPaid: money(totalPaid),
      escrowRemaining: money(escrow),
      nextWindow: Number(nextMilestoneId),
      windows,
    };
  });

  app.get("/api/v1/grid/site", async () => {
    const f = await buildFixtures();
    const wire = connect();
    const balances = wire
      ? await Promise.all([
          readRetry("site balance", () =>
            wire.client.readContract({ address: wire.token, abi: mockUsdAbi, functionName: "balanceOf", args: [site.address] }),
          ) as Promise<bigint>,
          readRetry("treasury balance", () =>
            wire.client.readContract({ address: wire.token, abi: mockUsdAbi, functionName: "balanceOf", args: [treasury.address] }),
          ) as Promise<bigint>,
        ])
      : null;

    const curve = (batch: typeof f.delivered) =>
      batch.readings.map((r) => ({ t: r.reading.periodStart, wh: r.reading.wh }));

    // The baseline curve for the event window, slot by slot, so the UI can draw the counterfactual.
    const baselineByStart = new Map<number, number[]>();
    for (const { reading } of f.baseline.readings) {
      const local = reading.periodStart + UTC_OFFSET_SECONDS;
      const slot = local - Math.floor(local / 86400) * 86400;
      baselineByStart.set(slot, [...(baselineByStart.get(slot) ?? []), reading.wh]);
    }
    const baselineCurve = f.delivered.readings.map((r) => {
      const local = r.reading.periodStart + UTC_OFFSET_SECONDS;
      const slot = local - Math.floor(local / 86400) * 86400;
      const values = baselineByStart.get(slot) ?? [];
      const mean = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      return { t: r.reading.periodStart, wh: mean };
    });

    return {
      siteName: SITE_NAME,
      siteId: f.siteId,
      device: device.address,
      window: { start: f.windowStart, end: f.windowEnd },
      committedWh: COMMITTED_WH,
      baselineCurve,
      scenarios: {
        delivered: { label: "Site shed load", curve: curve(f.delivered) },
        shortfall: { label: "Site barely reduced", curve: curve(f.shortfall) },
      },
      earnings: balances ? { site: money(balances[0]!), treasury: money(balances[1]!) } : null,
    };
  });

  /**
   * Run one settlement pass. `submit: false` stops after signing, which is the safe way to
   * rehearse; `submit: true` sends release() from the relayer.
   */
  app.post("/api/v1/grid/settle", async (req, reply) => {
    const body = (req.body ?? {}) as { scenario?: string; submit?: boolean };
    const scenario = body.scenario === "shortfall" ? "shortfall" : "delivered";
    const wire = connect();
    if (!wire) return reply.code(409).send({ error: "No program on chain. Run apps/backend/scripts/grid-hsk.mjs first." });

    const milestoneId = Number(await wire.read("nextMilestoneId"));
    if (milestoneId >= 2) {
      return reply.code(409).send({ error: "Every event window in this program has already been settled." });
    }

    const f = await buildFixtures();
    const block = await wire.client.getBlock({ blockTag: "latest" });
    const program: GridProgram = {
      agreement: wire.agreement,
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
      const td = buildApprovalTypedData(133, wire.agreement, m);
      return a.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
    };

    const outcome = await runSettlement({
      program,
      baselineReadings: f.baseline.readings.map((r) => r.reading),
      batch: scenario === "shortfall" ? f.shortfall : f.delivered,
      signal: await fetchGridSignal(),
      chain: {
        termsHash: (await wire.read("termsHash")) as Hex,
        milestoneId,
        milestoneAmount: (await wire.read("milestoneAmounts", [BigInt(milestoneId)])) as bigint,
        nonce: (await wire.read("milestoneNonce", [BigInt(milestoneId)])) as bigint,
        demoMode: (await wire.read("demoMode")) as boolean,
        fundedAt: (await wire.read("fundedAt")) as bigint,
        executionDeadline: (await wire.read("executionDeadline")) as bigint,
        now: block.timestamp,
      },
      signDevice: signWith(device),
      signAgent: signWith(agent),
    });

    const response: Record<string, unknown> = {
      scenario,
      settled: outcome.settled,
      reason: outcome.reason,
      steps: outcome.steps,
      dispatch: outcome.dispatch,
      settlement: outcome.settlement
        ? {
            baselineWh: outcome.settlement.baselineWh,
            actualWh: outcome.settlement.actualWh,
            avoidedWh: outcome.settlement.avoidedWh,
            committedWh: COMMITTED_WH,
          }
        : null,
      evidenceHash: outcome.evidence?.hash ?? null,
      submitted: false,
    };

    if (!outcome.settled || body.submit !== true) return response;

    const relayerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
    if (!relayerKey || !/^0x[0-9a-fA-F]{64}$/.test(relayerKey)) {
      response.submitError = "No relayer key in DEPLOYER_PRIVATE_KEY, so the signed settlement was not broadcast.";
      return response;
    }

    // Anyone may relay: the transaction carries no authority, only the two machine signatures do.
    const relayer = privateKeyToAccount(relayerKey as Hex);
    const walletClient = createWalletClient({ account: relayer, chain: hskTestnet, transport: http(process.env.HSK_RPC_URL, { timeout: 60_000 }) });
    try {
      const hash = await walletClient.writeContract({
        address: wire.agreement,
        abi: conservationAgreementAbi,
        functionName: "release",
        args: [outcome.approval!, outcome.signatures!.device, outcome.signatures!.agent],
      });
      const receipt = await wire.client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      response.submitted = receipt.status === "success";
      response.txHash = hash;
      response.txUrl = `${EXPLORER}/tx/${hash}`;
      response.gasUsed = Number(receipt.gasUsed);
    } catch (error) {
      ctx.log.warn("grid settle release failed", (error as Error).message);
      response.submitError = (error as Error).message;
    }
    return response;
  });
}
