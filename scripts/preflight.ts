/**
 * Pre-flight check. Run this ten minutes before presenting.
 *
 * It answers one question — "can the demo run right now?" — by exercising the real dependencies
 * rather than assuming them: the RPC, the public data feeds, the deployed programme, the agent,
 * and the hosted app. It sends no transaction and spends no gas.
 *
 *   node scripts/preflight.mjs
 *
 * Exit code 0 means every check passed. Anything else means read the output before going on stage.
 */
import { createPublicClient, defineChain, formatEther, http, type Address, type Hex } from "viem";
import {
  agentAccount,
  assessGrid,
  buildFixtures,
  conservationAgreementAbi,
  deviceAccount,
  fetchGridSignal,
  INTERVAL_SECONDS,
  METER_CHAIN_ID,
  mockUsdAbi,
  runSettlement,
  sitePayeeAccount,
  treasuryAccount,
  UTC_OFFSET_SECONDS,
  buildApprovalTypedData,
  type ApprovalMessage,
  type GridProgram,
} from "@minga/shared";
import type { PrivateKeyAccount } from "viem/accounts";

const APP = process.env.PREFLIGHT_APP_URL ?? "https://minga-grid.vercel.app";
const RPC = process.env.HSK_RPC_URL ?? "https://testnet.hsk.xyz";
const AGREEMENT = (process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS ??
  process.env.GRID_AGREEMENT_ADDRESS ??
  "0x315DE6Ff84680012cf81bFd9C256032996809cEC") as Address;
const TOKEN = (process.env.MOCK_USD_ADDRESS ?? "0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1") as Address;
const COMMITTED_WH = 500_000;
const TARIFF = 150_000;
const MIN_GAS = 1_000_000_000_000_000n; // 0.001 HSK

const hsk = defineChain({
  id: 133,
  name: "HSKChain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

type Level = "ok" | "warn" | "fail";
const results: { level: Level; name: string; detail: string }[] = [];
const mark = { ok: "  OK  ", warn: " WARN ", fail: " FAIL " } as const;

function record(level: Level, name: string, detail: string) {
  results.push({ level, name, detail });
  console.log(`[${mark[level]}] ${name.padEnd(28)} ${detail}`);
}

async function check(name: string, fn: () => Promise<string>, soft = false) {
  try {
    record("ok", name, await fn());
  } catch (error) {
    record(soft ? "warn" : "fail", name, (error as Error).message.split("\n")[0] ?? "failed");
  }
}

async function main() {
  if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(); } catch { /* defaults are fine */ }
  }

  console.log(`\nMINGA Grid pre-flight · ${new Date().toISOString()}\n`);

  const client = createPublicClient({ chain: hsk, transport: http(RPC, { timeout: 30_000 }), cacheTime: 0 });
  const read = (fn: string, args: readonly unknown[] = []) =>
    client.readContract({ address: AGREEMENT, abi: conservationAgreementAbi, functionName: fn as never, args: args as never });

  // ── the chain ────────────────────────────────────────────────────────────
  await check("HSK RPC", async () => {
    const id = await client.getChainId();
    if (id !== 133) throw new Error(`expected chain 133, got ${id}`);
    return `chain 133, block ${await client.getBlockNumber()}`;
  });

  await check("programme has code", async () => {
    const code = await client.getCode({ address: AGREEMENT });
    if (!code || code === "0x") throw new Error(`no bytecode at ${AGREEMENT}`);
    return `${AGREEMENT.slice(0, 10)}… (${(code.length - 2) / 2} bytes)`;
  });

  let nextWindow = 0;
  await check("programme is funded", async () => {
    if (!(await read("funded"))) throw new Error("the programme was never funded");
    const escrow = (await client.readContract({
      address: TOKEN, abi: mockUsdAbi, functionName: "balanceOf", args: [AGREEMENT],
    })) as bigint;
    return `escrow ${(Number(escrow) / 1e6).toFixed(2)} mUSD`;
  });

  await check("an unsettled window exists", async () => {
    nextWindow = Number(await read("nextMilestoneId"));
    if (nextWindow >= 2) {
      throw new Error("every window is settled — run `node apps/backend/scripts/grid-hsk.mjs --fresh` and redeploy");
    }
    return `window ${nextWindow + 1} of 2 is open`;
  });

  // ── machine accounts ─────────────────────────────────────────────────────
  for (const [label, account] of [["meter", deviceAccount()], ["agent", agentAccount()]] as const) {
    await check(`${label} account`, async () => {
      const balance = await client.getBalance({ address: account.address });
      const gas = balance >= MIN_GAS ? "funded" : "LOW ON GAS";
      if (balance < MIN_GAS) throw new Error(`${account.address} has ${formatEther(balance)} HSK`);
      return `${account.address.slice(0, 10)}… ${gas}`;
    }, true);
  }

  // ── public data ──────────────────────────────────────────────────────────
  let signalIsLive = false;
  await check("XM + exchange rate", async () => {
    const signal = await fetchGridSignal();
    signalIsLive = !signal.source.startsWith("FIXTURE");
    const verdict = assessGrid(signal);
    if (!signalIsLive) throw new Error("falling back to the labelled fixture — XM is unreachable");
    return `${signal.observedDate} · USD ${(signal.spotPriceMicroUsdPerKwh / 1e6).toFixed(3)}/kWh · ${signal.peakRatio.toFixed(2)}x · ${verdict.stress}`;
  }, true);

  await check("the grid dispatches", async () => {
    const verdict = assessGrid(await fetchGridSignal());
    if (!verdict.dispatch) throw new Error("the grid is calm: the agent will decline to call an event");
    return verdict.reason;
  }, true);

  // ── the agent, end to end, without sending anything ──────────────────────
  for (const scenario of ["delivered", "shortfall"] as const) {
    await check(`agent · ${scenario}`, async () => {
      const f = await buildFixtures();
      const block = await client.getBlock({ blockTag: "latest" });
      const program: GridProgram = {
        agreement: AGREEMENT, meterChainId: METER_CHAIN_ID, siteId: f.siteId,
        device: deviceAccount().address, agent: agentAccount().address,
        committedWh: COMMITTED_WH, tariffMicroUsdPerKwh: TARIFF,
        intervalSeconds: INTERVAL_SECONDS, utcOffsetSeconds: UTC_OFFSET_SECONDS,
      };
      const sign = (a: PrivateKeyAccount) => async (m: ApprovalMessage): Promise<Hex> => {
        const td = buildApprovalTypedData(133, AGREEMENT, m);
        return a.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
      };
      const outcome = await runSettlement({
        program,
        baselineReadings: f.baseline.readings.map((r) => r.reading),
        batch: scenario === "shortfall" ? f.shortfall : f.delivered,
        signal: await fetchGridSignal(),
        chain: {
          termsHash: (await read("termsHash")) as Hex,
          milestoneId: nextWindow,
          milestoneAmount: (await read("milestoneAmounts", [BigInt(nextWindow)])) as bigint,
          nonce: (await read("milestoneNonce", [BigInt(nextWindow)])) as bigint,
          demoMode: (await read("demoMode")) as boolean,
          fundedAt: (await read("fundedAt")) as bigint,
          executionDeadline: (await read("executionDeadline")) as bigint,
          now: block.timestamp,
        },
        signDevice: sign(deviceAccount()),
        signAgent: sign(agentAccount()),
      });

      const expected = scenario === "delivered";
      if (outcome.settled !== expected) {
        throw new Error(`expected settled=${expected}, got ${outcome.settled}: ${outcome.reason}`);
      }
      return expected
        ? `signs · ${(outcome.settlement!.avoidedWh / 1000).toFixed(1)} kWh avoided`
        : `refuses · ${outcome.reason}`;
    });
  }

  await check("execution deadline", async () => {
    const deadline = Number((await read("executionDeadline")) as bigint);
    const left = deadline - Math.floor(Date.now() / 1000);
    if (left <= 0) throw new Error("the programme expired — create a fresh one");
    if (left < 3600) throw new Error(`only ${Math.round(left / 60)} minutes left before it expires`);
    return `${(left / 3600).toFixed(1)} hours left`;
  });

  // ── the hosted app ───────────────────────────────────────────────────────
  for (const path of ["/", "/app", "/api/grid/signal", "/api/grid/program"]) {
    await check(`app ${path}`, async () => {
      const started = Date.now();
      const res = await fetch(`${APP}${path}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`responded ${res.status}`);
      return `${res.status} in ${Date.now() - started} ms`;
    });
  }

  // ── verdict ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.level === "fail");
  const warned = results.filter((r) => r.level === "warn");
  console.log("\n" + "─".repeat(72));
  if (failed.length === 0 && warned.length === 0) {
    console.log("Everything is ready. Go.");
  } else if (failed.length === 0) {
    console.log(`Ready, with ${warned.length} warning(s). The demo runs; read them so nothing surprises you:`);
    for (const w of warned) console.log(`  · ${w.name}: ${w.detail}`);
    if (!signalIsLive) console.log("  · Say on stage that the fixture is labelling itself. That is the behaviour, not a bug.");
  } else {
    console.log(`${failed.length} check(s) FAILED. Do not go on stage before reading these:`);
    for (const f of failed) console.log(`  · ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
  console.log("");
}

main().catch((error) => {
  console.error(`\npre-flight crashed: ${(error as Error).message}`);
  process.exitCode = 1;
});
