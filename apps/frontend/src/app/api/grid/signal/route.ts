/** The grid signal and the agent's dispatch verdict. Deterministic: no model decides whether money moves. */
import { assessGrid, fetchGridSignal } from "@minga/shared";
import { json } from "@/lib/grid-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const signal = await fetchGridSignal();
  return json({
    signal: {
      ...signal,
      spotUsdPerKwh: signal.spotPriceMicroUsdPerKwh / 1e6,
      dayAverageUsdPerKwh: signal.dailyAverageMicroUsdPerKwh / 1e6,
    },
    decision: assessGrid(signal),
    thresholds: { criticalPeakRatio: 1.8, elevatedPeakRatio: 1.4, criticalReservoirPct: 35 },
  });
}
