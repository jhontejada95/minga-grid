/** The demand-response programme as it exists on HSK: budget, escrow, the split and each receipt. */
import { agentAccount, deviceAccount, mockUsdAbi, sitePayeeAccount, treasuryAccount, SITE_NAME } from "@minga/shared";
import type { Hex } from "viem";
import {
  COMMITTED_WH, EXPLORER, TARIFF_MICRO_USD_PER_KWH,
  agreementReader, json, money, programAddress, publicClient, retry, tokenAddress,
} from "@/lib/grid-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const terms = () => ({
  siteName: SITE_NAME,
  committedWh: COMMITTED_WH,
  tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
  eventWindowLocal: "18:00-21:00 COT",
  baselineMethod: "mean-of-baseline-days/v1",
  explorer: EXPLORER,
  participants: {
    device: deviceAccount().address,
    agent: agentAccount().address,
    sitePayee: sitePayeeAccount().address,
    treasury: treasuryAccount().address,
  },
});

export async function GET() {
  const agreement = programAddress();
  const token = tokenAddress();
  if (!agreement || !token) {
    return json({ connected: false, terms: terms(), reason: "NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS is not set." });
  }

  const client = publicClient();
  const read = agreementReader(client, agreement);

  const [totalBudget, totalPaid, nextMilestoneId, funded, communityBps, escrow] = await Promise.all([
    read("totalBudget") as Promise<bigint>,
    read("totalPaid") as Promise<bigint>,
    read("nextMilestoneId") as Promise<bigint>,
    read("funded") as Promise<boolean>,
    read("communityBps") as Promise<bigint>,
    retry("escrow", () =>
      client.readContract({ address: token, abi: mockUsdAbi, functionName: "balanceOf", args: [agreement] }),
    ) as Promise<bigint>,
  ]);

  const windows = [];
  for (let i = 0; i < 2; i++) {
    const paid = (await read("milestonePaid", [BigInt(i)])) as boolean;
    const amount = (await read("milestoneAmounts", [BigInt(i)])) as bigint;
    let receipt = null;
    if (paid) {
      const r = (await read("milestoneReceipts", [BigInt(i)])) as readonly unknown[];
      receipt = {
        evidenceHash: r[1] as Hex,
        siteAmount: money(r[5] as bigint),
        treasuryAmount: money(r[6] as bigint),
        paidAt: Number(r[7] as bigint),
      };
    }
    windows.push({ id: i, paid, amount: money(amount), receipt });
  }

  return json({
    connected: true,
    terms: terms(),
    address: agreement,
    explorerUrl: `${EXPLORER}/address/${agreement}`,
    token,
    funded,
    siteBps: Number(communityBps),
    treasuryBps: 10_000 - Number(communityBps),
    totalBudget: money(totalBudget),
    totalPaid: money(totalPaid),
    escrowRemaining: money(escrow),
    nextWindow: Number(nextMilestoneId),
    windows,
  });
}
