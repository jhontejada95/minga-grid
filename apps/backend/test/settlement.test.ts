/**
 * Gate B — an autonomous settlement, end to end, against the real contracts on a local chain.
 *
 * The point of this file is a single claim: money moves on a verified measurement and two
 * MACHINE signatures, and it does not move otherwise. Both halves are tested.
 */
import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { parseEventLogs, type Address, type Hex } from "viem";
import {
  agreementFactoryRegistryAbi,
  buildApprovalTypedData,
  conservationAgreementAbi,
  mockUsdAbi,
  type ApprovalMessage,
  agentAccount,
  assessGrid,
  buildFixtures,
  deviceAccount,
  INTERVAL_SECONDS,
  METER_CHAIN_ID,
  runSettlement,
  UTC_OFFSET_SECONDS,
  type GridProgram,
  type GridSignal,
} from "@minga/shared";
import { anvilAvailable, send, startHarness, type Harness } from "./helpers/harness.js";


const AGREEMENT_METER_CHAIN_ID = 31337; // anvil
const MILESTONE_AMOUNT = 75_000_000n; // 75 mUSD, 6 decimals = 500 kWh x USD 0.15
const COMMITTED_WH = 500_000;
const TARIFF = 150_000; // USD 0.15 per avoided kWh
const COMMUNITY_BPS = 9000n; // 90% site / 10% protocol treasury

/** An expensive evening: the window costs twice what an ordinary hour costs that day. */
const CRITICAL_SIGNAL: GridSignal = {
  source: "fixture:spot-price",
  observedAt: 1_789_000_000,
  observedDate: "2026-09-16",
  spotPriceMicroUsdPerKwh: 376_000,
  dailyAverageMicroUsdPerKwh: 188_000,
  peakRatio: 2.0,
  reservoirPct: 78.7,
};

const device = deviceAccount();
const agent = agentAccount();

let h: Harness | null = null;
let f: Awaited<ReturnType<typeof buildFixtures>>;
const available = anvilAvailable();

before(async () => {
  f = await buildFixtures();
  if (!available) return;
  h = await startHarness({ port: 8557 });
  if (!h) return;
  // The device and the agent are ordinary accounts on chain: they need gas to accept terms.
  for (const to of [device.address, agent.address]) {
    const hash = await h.wallet(h.accounts.deployer).sendTransaction({
      to, value: 10n ** 17n, chain: null, account: h.accounts.deployer,
    });
    await h.publicClient.waitForTransactionReceipt({ hash });
  }
});

after(() => h?.stop());

function programFor(agreement: Address): GridProgram {
  return {
    agreement,
    meterChainId: METER_CHAIN_ID,
    siteId: f.siteId,
    device: device.address,
    agent: agent.address,
    committedWh: COMMITTED_WH,
    tariffMicroUsdPerKwh: TARIFF,
    intervalSeconds: INTERVAL_SECONDS,
    utcOffsetSeconds: UTC_OFFSET_SECONDS,
  };
}

const sign = (account: typeof device) => async (m: ApprovalMessage): Promise<Hex> => {
  const td = buildApprovalTypedData(AGREEMENT_METER_CHAIN_ID, currentAgreement, m);
  return account.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
};

let currentAgreement: Address;

/** Creates a MINGA Grid program on chain: device and agent are the two signers. */
async function createProgram(): Promise<Address> {
  const harness = h!;
  const now = await harness.chainNow();
  const input = {
    communitySigner: device.address,
    verifierSigner: agent.address,
    token: harness.token,
    projectRefHash: ("0x" + "a1".repeat(32)) as Hex,
    metadataHash: ("0x" + "b2".repeat(32)) as Hex,
    methodologyHash: ("0x" + "c3".repeat(32)) as Hex,
    payeeCommunity: harness.accounts.payeeCommunity.address, // the site
    payeeMonitoring: harness.accounts.payeeMonitoring.address, // the protocol treasury
    communityBps: COMMUNITY_BPS,
    milestoneAmounts: [MILESTONE_AMOUNT, MILESTONE_AMOUNT],
    fundingDeadline: now + 3600n,
    executionDeadline: now + 86_400n,
    demoMode: true,
  };
  const receipt = await send(harness, harness.accounts.funder, harness.factory, agreementFactoryRegistryAbi, "createAgreement", [input]);
  const ev = parseEventLogs({ abi: agreementFactoryRegistryAbi, logs: receipt.logs, eventName: "AgreementCreated" })[0];
  const agreement = ev!.args.agreementAddress as Address;

  const terms = (await harness.publicClient.readContract({
    address: agreement, abi: conservationAgreementAbi, functionName: "termsHash",
  })) as Hex;
  // Both acceptances are sent by machines, from their own accounts.
  await send(harness, device, agreement, conservationAgreementAbi, "acceptTerms", [terms]);
  await send(harness, agent, agreement, conservationAgreementAbi, "acceptTerms", [terms]);
  await send(harness, harness.accounts.funder, harness.token, mockUsdAbi, "approve", [agreement, MILESTONE_AMOUNT * 2n]);
  await send(harness, harness.accounts.funder, agreement, conservationAgreementAbi, "fund");
  return agreement;
}

async function chainFacts(agreement: Address, milestoneId: number) {
  const harness = h!;
  const read = (functionName: string, args: readonly unknown[] = []) =>
    harness.publicClient.readContract({ address: agreement, abi: conservationAgreementAbi, functionName: functionName as never, args: args as never });
  const block = await harness.publicClient.getBlock({ blockTag: "latest" });
  return {
    termsHash: (await read("termsHash")) as Hex,
    milestoneId,
    milestoneAmount: MILESTONE_AMOUNT,
    nonce: (await read("milestoneNonce", [BigInt(milestoneId)])) as bigint,
    demoMode: (await read("demoMode")) as boolean,
    fundedAt: (await read("fundedAt")) as bigint,
    executionDeadline: (await read("executionDeadline")) as bigint,
    now: block.timestamp,
  };
}

describe("B0. Grid assessment (no chain needed)", () => {
  it("dispatches when the grid is stressed and stays quiet when it is not", () => {
    assert.equal(assessGrid(CRITICAL_SIGNAL).stress, "critical");
    assert.equal(assessGrid(CRITICAL_SIGNAL).dispatch, true);
    const calm: GridSignal = { ...CRITICAL_SIGNAL, spotPriceMicroUsdPerKwh: 190_000, peakRatio: 1.01 };
    assert.equal(assessGrid(calm).stress, "normal");
    assert.equal(assessGrid(calm).dispatch, false);
  });
});

describe("B1. Autonomous settlement on a real chain", { skip: !available && "anvil is not installed" }, () => {
  it("settles a delivered event with two machine signatures and splits 90/10", async () => {
    assert.ok(h, "harness");
    currentAgreement = await createProgram();
    const harness = h!;

    const siteBefore = (await harness.publicClient.readContract({
      address: harness.token, abi: mockUsdAbi, functionName: "balanceOf", args: [harness.accounts.payeeCommunity.address],
    })) as bigint;
    const treasuryBefore = (await harness.publicClient.readContract({
      address: harness.token, abi: mockUsdAbi, functionName: "balanceOf", args: [harness.accounts.payeeMonitoring.address],
    })) as bigint;

    const outcome = await runSettlement({
      program: programFor(currentAgreement),
      baselineReadings: f.baseline.readings.map((r) => r.reading),
      batch: f.delivered,
      signal: CRITICAL_SIGNAL,
      chain: await chainFacts(currentAgreement, 0),
      research: async (objective) => ({
        provider: "fixture:mpp", objective, costMicroUsd: 10_000, paid: false,
        note: "402 flow exercised against a local server; no live payment",
      }),
      signDevice: sign(device),
      signAgent: sign(agent),
    });

    assert.equal(outcome.settled, true, outcome.reason);
    assert.ok(outcome.signatures, "the agent produced both signatures");
    assert.ok(outcome.settlement!.avoidedWh >= COMMITTED_WH);
    assert.deepEqual(
      outcome.steps.map((s) => s.step),
      ["sense", "corroborate", "verify", "baseline", "measure", "decide", "sign"],
    );

    // Anyone may relay the transaction; it carries no authority of its own.
    const receipt = await send(harness, harness.accounts.outsider, currentAgreement, conservationAgreementAbi, "release", [
      outcome.approval!, outcome.signatures!.device, outcome.signatures!.agent,
    ]);
    assert.equal(receipt.status, "success");

    const siteAfter = (await harness.publicClient.readContract({
      address: harness.token, abi: mockUsdAbi, functionName: "balanceOf", args: [harness.accounts.payeeCommunity.address],
    })) as bigint;
    const treasuryAfter = (await harness.publicClient.readContract({
      address: harness.token, abi: mockUsdAbi, functionName: "balanceOf", args: [harness.accounts.payeeMonitoring.address],
    })) as bigint;

    assert.equal(siteAfter - siteBefore, 67_500_000n, "site receives 90%");
    assert.equal(treasuryAfter - treasuryBefore, 7_500_000n, "protocol treasury receives 10% — this is the revenue");
  });

  it("refuses to sign when the site missed its commitment, so no payment is possible", async () => {
    assert.ok(h, "harness");
    const outcome = await runSettlement({
      program: programFor(currentAgreement),
      baselineReadings: f.baseline.readings.map((r) => r.reading),
      batch: f.shortfall,
      signal: CRITICAL_SIGNAL,
      chain: await chainFacts(currentAgreement, 1),
      signDevice: sign(device),
      signAgent: sign(agent),
    });

    assert.equal(outcome.settled, false);
    assert.equal(outcome.signatures, null);
    assert.match(outcome.reason, /commitment missed/);
    assert.equal(outcome.steps.at(-1)!.step, "decide");
    assert.equal(outcome.steps.at(-1)!.ok, false);
  });

  it("refuses to sign when a reading was tampered with", async () => {
    assert.ok(h, "harness");
    const tampered = JSON.parse(JSON.stringify(f.delivered)) as typeof f.delivered;
    tampered.readings[3]!.reading.wh = 1;
    const outcome = await runSettlement({
      program: programFor(currentAgreement),
      baselineReadings: f.baseline.readings.map((r) => r.reading),
      batch: tampered,
      signal: CRITICAL_SIGNAL,
      chain: await chainFacts(currentAgreement, 1),
      signDevice: sign(device),
      signAgent: sign(agent),
    });
    assert.equal(outcome.settled, false);
    assert.equal(outcome.signatures, null);
    assert.match(outcome.reason, /did not verify/);
  });

  it("never dispatches on a calm grid, so a quiet night costs the offtaker nothing", async () => {
    assert.ok(h, "harness");
    const outcome = await runSettlement({
      program: programFor(currentAgreement),
      baselineReadings: f.baseline.readings.map((r) => r.reading),
      batch: f.delivered,
      signal: { ...CRITICAL_SIGNAL, spotPriceMicroUsdPerKwh: 190_000, peakRatio: 1.01 },
      chain: await chainFacts(currentAgreement, 1),
      signDevice: sign(device),
      signAgent: sign(agent),
    });
    assert.equal(outcome.settled, false);
    assert.equal(outcome.steps.length, 1);
    assert.equal(outcome.steps[0]!.step, "sense");
  });

  it("a single machine signature cannot move funds", async () => {
    assert.ok(h, "harness");
    const harness = h!;
    const facts = await chainFacts(currentAgreement, 1);
    const approval: ApprovalMessage = {
      milestoneId: 1n, termsHash: facts.termsHash, evidenceHash: ("0x" + "de".repeat(32)) as Hex,
      amount: MILESTONE_AMOUNT, nonce: facts.nonce, signedAt: facts.now,
      validUntil: facts.now + 3600n, demoMode: facts.demoMode,
    };
    const agentOnly = await sign(agent)(approval);
    await assert.rejects(
      send(harness, harness.accounts.outsider, currentAgreement, conservationAgreementAbi, "release", [approval, agentOnly, agentOnly]),
      /Invalid community signature|reverted|execution reverted/i,
    );
  });
});
