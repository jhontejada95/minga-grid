/** The site's baseline curve, both event scenarios, and what has been paid so far. */
import { buildFixtures, deviceAccount, mockUsdAbi, sitePayeeAccount, treasuryAccount, SITE_NAME, UTC_OFFSET_SECONDS } from "@minga/shared";
import { COMMITTED_WH, json, money, programAddress, publicClient, retry, tokenAddress } from "@/lib/grid-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const f = await buildFixtures();
  const token = tokenAddress();
  const site = sitePayeeAccount().address;
  const treasury = treasuryAccount().address;

  let earnings: { site: number; treasury: number } | null = null;
  if (token && programAddress()) {
    const client = publicClient();
    const balance = (who: `0x${string}`) =>
      retry("balanceOf", () =>
        client.readContract({ address: token, abi: mockUsdAbi, functionName: "balanceOf", args: [who] }),
      ) as Promise<bigint>;
    const [a, b] = await Promise.all([balance(site), balance(treasury)]);
    earnings = { site: money(a), treasury: money(b) };
  }

  // The baseline curve for the event window, slot by slot, so the UI can draw the counterfactual.
  const bySlot = new Map<number, number[]>();
  for (const { reading } of f.baseline.readings) {
    const local = reading.periodStart + UTC_OFFSET_SECONDS;
    const slot = local - Math.floor(local / 86400) * 86400;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), reading.wh]);
  }
  const baselineCurve = f.delivered.readings.map((r) => {
    const local = r.reading.periodStart + UTC_OFFSET_SECONDS;
    const slot = local - Math.floor(local / 86400) * 86400;
    const values = bySlot.get(slot) ?? [];
    const mean = values.length ? Math.round(values.reduce((x, y) => x + y, 0) / values.length) : 0;
    return { t: r.reading.periodStart, wh: mean };
  });

  const curve = (batch: typeof f.delivered) => batch.readings.map((r) => ({ t: r.reading.periodStart, wh: r.reading.wh }));

  return json({
    siteName: SITE_NAME,
    siteId: f.siteId,
    device: deviceAccount().address,
    window: { start: f.windowStart, end: f.windowEnd },
    committedWh: COMMITTED_WH,
    baselineCurve,
    scenarios: {
      delivered: { label: "Site shed load", curve: curve(f.delivered) },
      shortfall: { label: "Site barely reduced", curve: curve(f.shortfall) },
    },
    earnings,
  });
}
