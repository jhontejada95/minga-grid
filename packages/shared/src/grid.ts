/**
 * MINGA Grid — signed meter readings, baseline math and settlement records.
 *
 * A reading is a statement by a device: "between t0 and t1 my site consumed `wh` watt-hours".
 * The device signs it with its own key, so the statement is non-repudiable. That is all a
 * signature buys: it does NOT prove the meter was not physically tampered with. See
 * `docs/limitations.md`.
 *
 * Everything here is integer arithmetic. Energy is watt-hours (never floats) and money is
 * micro-USD (1e-6), which is exactly the 6-decimal unit of the settlement token.
 */
import {
  keccak256,
  recoverTypedDataAddress,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { canonicalize } from "./canonical.js";

export const METER_DOMAIN_NAME = "MingaGridMeter";
export const METER_DOMAIN_VERSION = "1";

/** The struct a smart meter signs. Field order is part of the EIP-712 type hash. */
export const meterReadingTypes = {
  MeterReading: [
    { name: "siteId", type: "bytes32" },
    { name: "device", type: "address" },
    { name: "periodStart", type: "uint64" },
    { name: "periodEnd", type: "uint64" },
    { name: "wh", type: "uint64" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export interface MeterReading {
  /** keccak256 of the site's public identifier. */
  siteId: Hex;
  /** Address derived from the device key that signs this reading. */
  device: Address;
  /** Unix seconds, inclusive. */
  periodStart: number;
  /** Unix seconds, exclusive. */
  periodEnd: number;
  /** Consumption over the period, in whole watt-hours. */
  wh: number;
  /** Strictly increasing per device. */
  nonce: number;
}

export interface SignedMeterReading {
  reading: MeterReading;
  signature: Hex;
}

/** A contiguous run of signed readings for one site and one window. */
export interface MeterBatch {
  siteId: Hex;
  device: Address;
  /** Unix seconds, inclusive. */
  windowStart: number;
  /** Unix seconds, exclusive. */
  windowEnd: number;
  intervalSeconds: number;
  readings: SignedMeterReading[];
}

export function siteIdFromName(name: string): Hex {
  return keccak256(toBytes(name));
}

export function getMeterDomain(chainId: number) {
  return {
    name: METER_DOMAIN_NAME,
    version: METER_DOMAIN_VERSION,
    chainId,
  } as const;
}

export function buildMeterReadingTypedData(chainId: number, reading: MeterReading) {
  return {
    domain: getMeterDomain(chainId),
    types: meterReadingTypes,
    primaryType: "MeterReading" as const,
    message: {
      siteId: reading.siteId,
      device: reading.device,
      periodStart: BigInt(reading.periodStart),
      periodEnd: BigInt(reading.periodEnd),
      wh: BigInt(reading.wh),
      nonce: BigInt(reading.nonce),
    },
  };
}

export type BatchProblemCode =
  | "BAD_SIGNATURE"
  | "WRONG_DEVICE"
  | "SITE_MISMATCH"
  | "BAD_PERIOD"
  | "NONCE_NOT_INCREASING"
  | "PERIOD_NOT_CONTIGUOUS"
  | "OUTSIDE_WINDOW"
  | "BAD_VALUE";

export interface BatchProblem {
  index: number;
  code: BatchProblemCode;
  detail: string;
}

export interface BatchVerification {
  ok: boolean;
  totalWh: number;
  count: number;
  problems: BatchProblem[];
}

/**
 * Verify every reading in a batch. Strict on purpose: one bad reading fails the whole batch,
 * because a settlement is only as good as the worst reading it paid for.
 */
export async function verifyMeterBatch(
  chainId: number,
  batch: MeterBatch,
  expectedDevice: Address,
): Promise<BatchVerification> {
  const problems: BatchProblem[] = [];
  let totalWh = 0;
  let previousNonce = -1;
  let previousEnd: number | null = null;
  const device = expectedDevice.toLowerCase();

  for (let i = 0; i < batch.readings.length; i++) {
    const { reading, signature } = batch.readings[i];

    if (!Number.isInteger(reading.wh) || reading.wh < 0) {
      problems.push({ index: i, code: "BAD_VALUE", detail: `wh must be a non-negative integer, got ${reading.wh}` });
      continue;
    }
    if (!Number.isInteger(reading.periodStart) || !Number.isInteger(reading.periodEnd) || reading.periodEnd <= reading.periodStart) {
      problems.push({ index: i, code: "BAD_PERIOD", detail: `periodEnd must be after periodStart` });
      continue;
    }
    if (reading.siteId.toLowerCase() !== batch.siteId.toLowerCase()) {
      problems.push({ index: i, code: "SITE_MISMATCH", detail: `reading is for another site` });
      continue;
    }
    if (reading.device.toLowerCase() !== device) {
      problems.push({ index: i, code: "WRONG_DEVICE", detail: `reading claims device ${reading.device}` });
      continue;
    }
    if (reading.periodStart < batch.windowStart || reading.periodEnd > batch.windowEnd) {
      problems.push({ index: i, code: "OUTSIDE_WINDOW", detail: `period falls outside the declared window` });
      continue;
    }
    if (reading.nonce <= previousNonce) {
      problems.push({ index: i, code: "NONCE_NOT_INCREASING", detail: `nonce ${reading.nonce} after ${previousNonce}` });
      continue;
    }
    if (previousEnd !== null && reading.periodStart !== previousEnd) {
      problems.push({
        index: i,
        code: "PERIOD_NOT_CONTIGUOUS",
        detail: `period starts at ${reading.periodStart}, previous ended at ${previousEnd}`,
      });
      continue;
    }

    let recovered: Address;
    try {
      recovered = await recoverTypedDataAddress({
        ...buildMeterReadingTypedData(chainId, reading),
        signature,
      });
    } catch (error) {
      problems.push({ index: i, code: "BAD_SIGNATURE", detail: (error as Error).message });
      continue;
    }
    if (recovered.toLowerCase() !== device) {
      problems.push({ index: i, code: "BAD_SIGNATURE", detail: `signature recovers to ${recovered}` });
      continue;
    }

    previousNonce = reading.nonce;
    previousEnd = reading.periodEnd;
    totalWh += reading.wh;
  }

  return { ok: problems.length === 0, totalWh, count: batch.readings.length, problems };
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

/**
 * Average consumption per clock slot across the baseline days.
 *
 * Method: for each interval of the local day, take the arithmetic mean of that same interval
 * over every baseline day supplied. This is the plain "average of Y days" counterfactual used
 * by demand-response programs; it is a convention agreed in the program terms, not a
 * measurement. Adjustments for weather or occupancy are out of scope.
 */
export interface BaselineProfile {
  method: string;
  intervalSeconds: number;
  /** Seconds since local midnight -> mean watt-hours for that interval. */
  slotWh: Record<number, number>;
  days: number;
  /** Fixed local offset used to bucket readings into clock slots, e.g. -18000 for UTC-5. */
  utcOffsetSeconds: number;
}

export const BASELINE_METHOD = "mean-of-baseline-days/v1";

export function buildBaselineProfile(
  readings: MeterReading[],
  intervalSeconds: number,
  utcOffsetSeconds: number,
): BaselineProfile {
  const totals = new Map<number, { sum: number; n: number }>();
  const days = new Set<number>();

  for (const r of readings) {
    const local = r.periodStart + utcOffsetSeconds;
    const dayIndex = Math.floor(local / 86400);
    const slot = local - dayIndex * 86400;
    days.add(dayIndex);
    const entry = totals.get(slot) ?? { sum: 0, n: 0 };
    entry.sum += r.wh;
    entry.n += 1;
    totals.set(slot, entry);
  }

  const slotWh: Record<number, number> = {};
  for (const [slot, { sum, n }] of totals) {
    slotWh[slot] = Math.round(sum / n);
  }

  return { method: BASELINE_METHOD, intervalSeconds, slotWh, days: days.size, utcOffsetSeconds };
}

/** Expected watt-hours for a window, summed slot by slot from the profile. */
export function baselineWhForWindow(profile: BaselineProfile, windowStart: number, windowEnd: number): number {
  let total = 0;
  for (let t = windowStart; t < windowEnd; t += profile.intervalSeconds) {
    const local = t + profile.utcOffsetSeconds;
    const slot = local - Math.floor(local / 86400) * 86400;
    total += profile.slotWh[slot] ?? 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface SettlementInput {
  siteId: Hex;
  device: Address;
  windowStart: number;
  windowEnd: number;
  baselineWh: number;
  actualWh: number;
  /** Price the offtaker pays per avoided kWh, in micro-USD (1e-6). */
  tariffMicroUsdPerKwh: number;
  /** Hash of the verified batch of signed readings. */
  batchHash: Hex;
  baselineMethod: string;
}

export interface SettlementResult extends SettlementInput {
  avoidedWh: number;
  /** Token units of a 6-decimal stablecoin. */
  payout: bigint;
}

/**
 * avoided = max(0, baseline - actual); payout = avoided(kWh) * tariff.
 * Floored at zero: consuming MORE than the baseline is not a debt, it simply earns nothing.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const avoidedWh = Math.max(0, input.baselineWh - input.actualWh);
  const payout = (BigInt(avoidedWh) * BigInt(input.tariffMicroUsdPerKwh)) / 1000n;
  return { ...input, avoidedWh, payout };
}

/**
 * The canonical record that the on-chain `evidenceHash` commits to. Both the device batch and
 * the arithmetic are inside it, so the hash on chain pins exactly what was paid for and why.
 */
export function settlementRecord(result: SettlementResult) {
  return {
    avoidedWh: result.avoidedWh,
    actualWh: result.actualWh,
    baselineMethod: result.baselineMethod,
    baselineWh: result.baselineWh,
    batchHash: result.batchHash,
    device: result.device.toLowerCase(),
    payout: result.payout.toString(),
    siteId: result.siteId.toLowerCase(),
    tariffMicroUsdPerKwh: result.tariffMicroUsdPerKwh,
    windowEnd: result.windowEnd,
    windowStart: result.windowStart,
  };
}

/** Canonical JSON + keccak256 of the settlement record; the hash goes on chain. */
export function hashSettlement(result: SettlementResult): { text: string; hash: Hex } {
  return canonicalize(settlementRecord(result));
}

/** keccak256 over the canonical form of a verified batch (readings and their signatures). */
export function hashMeterBatch(batch: MeterBatch): Hex {
  return canonicalize({
    device: batch.device.toLowerCase(),
    intervalSeconds: batch.intervalSeconds,
    readings: batch.readings.map((r) => ({
      nonce: r.reading.nonce,
      periodEnd: r.reading.periodEnd,
      periodStart: r.reading.periodStart,
      signature: r.signature,
      wh: r.reading.wh,
    })),
    siteId: batch.siteId.toLowerCase(),
    windowEnd: batch.windowEnd,
    windowStart: batch.windowStart,
  }).hash;
}
