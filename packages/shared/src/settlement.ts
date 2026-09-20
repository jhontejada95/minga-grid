/**
 * MINGA Grid — the settlement agent.
 *
 * One autonomous pass over a grid event:
 *
 *   sense -> corroborate (paid, bounded) -> verify signatures -> baseline -> measure -> decide -> sign
 *
 * Two properties matter more than anything else here:
 *
 *  1. **The agent can say no.** It refuses to sign when the readings do not verify or when the
 *     site missed the reduction it committed to. An agent that always approves is a rubber
 *     stamp, and a rubber stamp is not worth putting on a chain.
 *  2. **The agent cannot move money on its own.** It produces one of the two signatures the
 *     contract requires. The other belongs to the device. Neither key can release funds alone,
 *     and no key here can change the amount: `release()` pays the fixed milestone amount to the
 *     immutable payees, or it reverts.
 *
 * The paid research step is advisory. It can inform whether an event is declared; it can never
 * make a failed verification pass.
 */
import type { Address, Hex } from "viem";
import {
  baselineWhForWindow,
  buildBaselineProfile,
  computeSettlement,
  hashMeterBatch,
  hashSettlement,
  verifyMeterBatch,
  type BatchVerification,
  type MeterBatch,
  type MeterReading,
  type SettlementResult,
} from "./grid.js";
import type { ApprovalMessage } from "./eip712.js";

export type GridStress = "normal" | "elevated" | "critical";

/** The terms of one demand-response program, as agreed off chain and committed in `termsHash`. */
export interface GridProgram {
  agreement: Address;
  /** Chain id in the METER EIP-712 domain. The meter has its own namespace; it need not equal the settlement chain. */
  meterChainId: number;
  siteId: Hex;
  device: Address;
  agent: Address;
  /** Reduction the site committed to for one event window, in watt-hours. */
  committedWh: number;
  /** What the offtaker pays per avoided kWh, in micro-USD. Reporting only: the contract pays a fixed amount. */
  tariffMicroUsdPerKwh: number;
  intervalSeconds: number;
  utcOffsetSeconds: number;
}

/**
 * How stressed the grid is. Where it comes from is the caller's problem; `source` describes it in
 * words and the UI prints that verbatim, so a fixture can never pass itself off as a live feed.
 *
 * The decisive field is `peakRatio`, not the absolute price. An hour that costs far more than the
 * day's own average is an hour where avoided consumption is worth buying, and the ratio is
 * comparable across currencies, tariffs and countries in a way a raw price is not.
 */
export interface GridSignal {
  source: string;
  observedAt: number;
  /** Calendar day the price data belongs to, ISO `YYYY-MM-DD`. Published data usually lags. */
  observedDate: string;
  /** Price during the event window, in micro-USD per kWh. */
  spotPriceMicroUsdPerKwh: number;
  /** That whole day's mean price, the reference the window is judged against. */
  dailyAverageMicroUsdPerKwh: number;
  /** spot / daily average. Above 1 means the window costs more than an ordinary hour. */
  peakRatio: number;
  /** Useful reservoir volume as a percentage. A slow-moving backstop, not the trigger. */
  reservoirPct: number | null;
}

/** Receipt of an external, paid corroboration purchase (MPP / x402). */
export interface ResearchReceipt {
  provider: string;
  objective: string;
  costMicroUsd: number;
  paid: boolean;
  note: string;
}

export interface AgentStep {
  step: string;
  detail: string;
  ok: boolean;
  data?: Record<string, unknown>;
}

export interface DispatchDecision {
  stress: GridStress;
  dispatch: boolean;
  reason: string;
}

/** On-chain facts the agent must respect. Read from the contract at one block. */
export interface ChainFacts {
  termsHash: Hex;
  milestoneId: number;
  milestoneAmount: bigint;
  nonce: bigint;
  demoMode: boolean;
  fundedAt: bigint;
  executionDeadline: bigint;
  now: bigint;
}

export interface SettlementDeps {
  program: GridProgram;
  /** Ordinary days used to build the counterfactual. */
  baselineReadings: MeterReading[];
  /** The signed readings for the event window. */
  batch: MeterBatch;
  signal: GridSignal;
  chain: ChainFacts;
  /** Optional paid corroboration. Advisory: it never overrides verification. */
  research?: (objective: string) => Promise<ResearchReceipt>;
  signDevice: (message: ApprovalMessage) => Promise<Hex>;
  signAgent: (message: ApprovalMessage) => Promise<Hex>;
  approvalTtlSeconds?: number;
}

export interface SettlementOutcome {
  settled: boolean;
  reason: string;
  dispatch: DispatchDecision;
  verification: BatchVerification | null;
  settlement: SettlementResult | null;
  evidence: { text: string; hash: Hex } | null;
  approval: ApprovalMessage | null;
  signatures: { device: Hex; agent: Hex } | null;
  research: ResearchReceipt | null;
  steps: AgentStep[];
}

/**
 * Dispatch thresholds, as a multiple of the day's own average price.
 *
 * Calibrated against real XM data for Colombia: an ordinary evening peak runs about 1.5x the
 * daily mean, and a genuinely expensive hour runs 1.8x or more. Paying to avoid consumption is
 * worth it exactly when the hour costs meaningfully more than an ordinary one.
 */
export const CRITICAL_PEAK_RATIO = 1.8;
export const ELEVATED_PEAK_RATIO = 1.4;
/** A slow-moving backstop: a drained system is stressed even on a quiet-looking day. */
export const CRITICAL_RESERVOIR_PCT = 35;

/**
 * Decide whether the hour is worth dispatching. Deterministic and cheap on purpose: a model may
 * propose *what to research*, but whether money moves is decided by arithmetic.
 */
export function assessGrid(signal: GridSignal): DispatchDecision {
  const drained = signal.reservoirPct !== null && signal.reservoirPct <= CRITICAL_RESERVOIR_PCT;
  const critical = signal.peakRatio >= CRITICAL_PEAK_RATIO || drained;
  const elevated = signal.peakRatio >= ELEVATED_PEAK_RATIO;

  const stress: GridStress = critical ? "critical" : elevated ? "elevated" : "normal";
  const price = (signal.spotPriceMicroUsdPerKwh / 1_000_000).toFixed(3);
  const ratio = signal.peakRatio.toFixed(2);
  const reservoir = signal.reservoirPct === null ? "reservoir level unknown" : `reservoirs at ${signal.reservoirPct.toFixed(1)}%`;
  return {
    stress,
    dispatch: stress !== "normal",
    reason:
      stress === "normal"
        ? `the window costs USD ${price}/kWh, only ${ratio}x the day average, and ${reservoir}: no event is worth calling`
        : `the window costs USD ${price}/kWh, ${ratio}x the day average, ${reservoir}: ${stress} stress, dispatching`,
  };
}

function step(steps: AgentStep[], s: AgentStep): AgentStep {
  steps.push(s);
  return s;
}

/** One full settlement pass. Returns signatures only when the agent is willing to pay. */
export async function runSettlement(deps: SettlementDeps): Promise<SettlementOutcome> {
  const { program, batch, chain } = deps;
  const steps: AgentStep[] = [];
  const base = {
    dispatch: assessGrid(deps.signal),
    verification: null,
    settlement: null,
    evidence: null,
    approval: null,
    signatures: null,
    research: null,
    steps,
  };

  // 1. Sense.
  step(steps, {
    step: "sense",
    detail: base.dispatch.reason,
    ok: base.dispatch.dispatch,
    data: { source: deps.signal.source, stress: base.dispatch.stress },
  });
  if (!base.dispatch.dispatch) {
    return { ...base, settled: false, reason: base.dispatch.reason };
  }

  // 2. Corroborate. Paid, bounded, advisory. A failure here never blocks a settlement.
  let research: ResearchReceipt | null = null;
  if (deps.research) {
    const objective = `Corroborate reported grid stress on ${new Date(deps.signal.observedAt * 1000).toISOString().slice(0, 10)} from public sources`;
    try {
      research = await deps.research(objective);
      step(steps, {
        step: "corroborate",
        detail: `${research.provider}: ${research.note}`,
        ok: true,
        data: { paid: research.paid, costMicroUsd: research.costMicroUsd },
      });
    } catch (error) {
      step(steps, {
        step: "corroborate",
        detail: `external research unavailable (${(error as Error).message}); continuing on the primary signal`,
        ok: false,
      });
    }
  }

  // 3. Verify every signature in the batch.
  const verification = await verifyMeterBatch(program.meterChainId, batch, program.device);
  step(steps, {
    step: "verify",
    detail: verification.ok
      ? `${verification.count} readings verified against device ${program.device}`
      : `${verification.problems.length} of ${verification.count} readings rejected`,
    ok: verification.ok,
    data: { problems: verification.problems },
  });
  if (!verification.ok) {
    const first = verification.problems[0];
    return {
      ...base,
      research,
      verification,
      settled: false,
      reason: `readings did not verify: ${first?.code} at index ${first?.index} (${first?.detail})`,
    };
  }

  // 4. Baseline.
  const profile = buildBaselineProfile(deps.baselineReadings, program.intervalSeconds, program.utcOffsetSeconds);
  const baselineWh = baselineWhForWindow(profile, batch.windowStart, batch.windowEnd);
  step(steps, {
    step: "baseline",
    detail: `${(baselineWh / 1000).toFixed(1)} kWh expected from ${profile.days} ordinary days (${profile.method})`,
    ok: true,
    data: { baselineWh, days: profile.days },
  });

  // 5. Measure.
  const settlement = computeSettlement({
    siteId: program.siteId,
    device: program.device,
    windowStart: batch.windowStart,
    windowEnd: batch.windowEnd,
    baselineWh,
    actualWh: verification.totalWh,
    tariffMicroUsdPerKwh: program.tariffMicroUsdPerKwh,
    batchHash: hashMeterBatch(batch),
    baselineMethod: profile.method,
  });
  step(steps, {
    step: "measure",
    detail: `${(settlement.actualWh / 1000).toFixed(1)} kWh measured, ${(settlement.avoidedWh / 1000).toFixed(1)} kWh avoided`,
    ok: true,
    data: { actualWh: settlement.actualWh, avoidedWh: settlement.avoidedWh },
  });

  // 6. Decide against the commitment.
  const met = settlement.avoidedWh >= program.committedWh;
  const committedKwh = (program.committedWh / 1000).toFixed(1);
  const avoidedKwh = (settlement.avoidedWh / 1000).toFixed(1);
  step(steps, {
    step: "decide",
    detail: met
      ? `commitment of ${committedKwh} kWh met (${avoidedKwh} kWh)`
      : `commitment of ${committedKwh} kWh missed (${avoidedKwh} kWh): refusing to settle`,
    ok: met,
    data: { committedWh: program.committedWh, avoidedWh: settlement.avoidedWh },
  });
  if (!met) {
    return {
      ...base,
      research,
      verification,
      settlement,
      settled: false,
      reason: `commitment missed: ${avoidedKwh} kWh avoided against ${committedKwh} kWh committed`,
    };
  }

  // 7. Sign. The evidence hash commits to the batch AND to the arithmetic that justified payment.
  const evidence = hashSettlement(settlement);
  const ttl = BigInt(deps.approvalTtlSeconds ?? 3600);
  const signedAt = chain.now < chain.fundedAt ? chain.fundedAt : chain.now;
  const validUntil = signedAt + ttl < chain.executionDeadline ? signedAt + ttl : chain.executionDeadline;

  const approval: ApprovalMessage = {
    milestoneId: BigInt(chain.milestoneId),
    termsHash: chain.termsHash,
    evidenceHash: evidence.hash,
    amount: chain.milestoneAmount,
    nonce: chain.nonce,
    signedAt,
    validUntil,
    demoMode: chain.demoMode,
  };

  const [deviceSignature, agentSignature] = await Promise.all([
    deps.signDevice(approval),
    deps.signAgent(approval),
  ]);
  step(steps, {
    step: "sign",
    detail: `device and agent signed settlement window ${chain.milestoneId + 1}; no human signature involved`,
    ok: true,
    data: { evidenceHash: evidence.hash, amount: chain.milestoneAmount.toString() },
  });

  return {
    ...base,
    research,
    verification,
    settlement,
    evidence,
    approval,
    signatures: { device: deviceSignature, agent: agentSignature },
    settled: true,
    reason: `settled: ${avoidedKwh} kWh avoided against a ${committedKwh} kWh commitment`,
  };
}
