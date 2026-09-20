/**
 * Run one settlement pass and hand the caller the two machine signatures.
 *
 * This endpoint never broadcasts and holds no funded key. It returns the exact arguments for
 * `release(approval, deviceSignature, agentSignature)`, and the visitor's own wallet sends the
 * transaction. That split is the honest version of the product's central claim: the relayer is
 * not an authoriser. Whoever presses send is paying gas, not approving a payment — their
 * signature is nowhere in the transaction.
 *
 * `scenario` picks which meter batch to settle, so the demo can show the agent REFUSING as well
 * as paying. An agent that only ever says yes is not verifying anything.
 */
import {
  buildFixtures, deviceAccount, agentAccount, buildApprovalTypedData, fetchGridSignal, runSettlement,
  INTERVAL_SECONDS, METER_CHAIN_ID, UTC_OFFSET_SECONDS,
  type ApprovalMessage, type GridProgram,
} from "@minga/shared";
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  COMMITTED_WH, TARIFF_MICRO_USD_PER_KWH,
  agreementReader, json, programAddress, publicClient,
} from "@/lib/grid-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const agreement = programAddress();
  if (!agreement) return json({ error: "No programme configured. Set NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS." }, 409);

  const body = (await request.json().catch(() => ({}))) as { scenario?: string };
  const scenario = body.scenario === "shortfall" ? "shortfall" : "delivered";

  const client = publicClient();
  const read = agreementReader(client, agreement);
  const milestoneId = Number(await read("nextMilestoneId"));
  if (milestoneId >= 2) return json({ error: "Every event window in this programme has already been settled." }, 409);

  const device = deviceAccount();
  const agent = agentAccount();
  const f = await buildFixtures();
  const block = await client.getBlock({ blockTag: "latest" });

  const program: GridProgram = {
    agreement,
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
    const td = buildApprovalTypedData(133, agreement, m);
    return a.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
  };

  const outcome = await runSettlement({
    program,
    baselineReadings: f.baseline.readings.map((r) => r.reading),
    batch: scenario === "shortfall" ? f.shortfall : f.delivered,
    signal: await fetchGridSignal(),
    chain: {
      termsHash: (await read("termsHash")) as Hex,
      milestoneId,
      milestoneAmount: (await read("milestoneAmounts", [BigInt(milestoneId)])) as bigint,
      nonce: (await read("milestoneNonce", [BigInt(milestoneId)])) as bigint,
      demoMode: (await read("demoMode")) as boolean,
      fundedAt: (await read("fundedAt")) as bigint,
      executionDeadline: (await read("executionDeadline")) as bigint,
      now: block.timestamp,
    },
    signDevice: signWith(device),
    signAgent: signWith(agent),
  });

  return json({
    scenario,
    settled: outcome.settled,
    reason: outcome.reason,
    steps: outcome.steps,
    milestoneId,
    settlement: outcome.settlement && {
      baselineWh: outcome.settlement.baselineWh,
      actualWh: outcome.settlement.actualWh,
      avoidedWh: outcome.settlement.avoidedWh,
      committedWh: COMMITTED_WH,
    },
    evidenceHash: outcome.evidence?.hash ?? null,
    // JSON has no bigint: the browser rebuilds these before calling the contract.
    release: outcome.settled
      ? {
          agreement,
          approval: {
            milestoneId: outcome.approval!.milestoneId.toString(),
            termsHash: outcome.approval!.termsHash,
            evidenceHash: outcome.approval!.evidenceHash,
            amount: outcome.approval!.amount.toString(),
            nonce: outcome.approval!.nonce.toString(),
            signedAt: outcome.approval!.signedAt.toString(),
            validUntil: outcome.approval!.validUntil.toString(),
            demoMode: outcome.approval!.demoMode,
          },
          deviceSignature: outcome.signatures!.device,
          agentSignature: outcome.signatures!.agent,
        }
      : null,
  });
}
