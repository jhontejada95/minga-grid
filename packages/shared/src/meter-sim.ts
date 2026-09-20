/**
 * Deterministic smart-meter data generator for MINGA Grid.
 *
 * Pure: it signs and returns readings, it never touches the filesystem, so the same code runs in
 * the Fastify backend, in a serverless route handler and in tests. The script that writes the
 * fixture files lives in apps/backend/scripts and only wraps this.
 *
 * The consumption curve is synthetic. The signature scheme is identical to what a metering
 * device with a secure element would produce; a signature proves non-repudiation of the
 * statement, not that the meter was not physically tampered with.
 */
import {
  buildMeterReadingTypedData,
  siteIdFromName,
  type MeterBatch,
  type MeterReading,
  type SignedMeterReading,
} from "./grid.js";
import { deviceAccount } from "./grid-keys.js";

/** Chain id baked into the meter EIP-712 domain. The meter has its own namespace. */
export const METER_CHAIN_ID = 133;
export const SITE_NAME = "Cold-storage warehouse, Valle del Cauca (site/co-valle-001)";
export const INTERVAL_SECONDS = 900; // 15 minutes
export const UTC_OFFSET_SECONDS = -5 * 3600; // Colombia, UTC-5, no DST

/** Local clock of the first baseline day: 2026-09-14 (Monday) 17:00 COT. */
const FIRST_BASELINE_DAY_UTC = Date.UTC(2026, 8, 14, 22, 0, 0) / 1000; // 17:00 COT == 22:00 UTC
const EVENT_DAY_UTC = Date.UTC(2026, 8, 19, 22, 0, 0) / 1000; // 2026-09-19 17:00 COT
export const BASELINE_DAYS = 5;
const DAY = 86400;

/** Readings cover 17:00-22:00 local; the event window itself is 18:00-21:00 local. */
const PROFILE_HOURS = 5;
const INTERVALS_PER_DAY = (PROFILE_HOURS * 3600) / INTERVAL_SECONDS;

export const EVENT_WINDOW_OFFSET = 3600; // 18:00 local = one hour into the profile
export const EVENT_WINDOW_SECONDS = 3 * 3600; // 18:00 -> 21:00

/**
 * Watt-hours per 15-minute interval, by hour offset from 17:00, for a mid-size cold-storage
 * warehouse: compressors, blast freezers and dock doors. Around 400 kW at the evening peak,
 * which is an ordinary size for such a facility and large enough that shedding load for three
 * hours is a commercial decision rather than a gesture.
 */
const ORDINARY_WH: number[] = [60_000, 100_000, 90_000, 70_000, 50_000];
/** The same hours when the site responds to an event: compressors staged down, freezers coasting. */
const DELIVERED_WH: number[] = [60_000, 40_000, 36_000, 30_000, 50_000];
/** The site tried but barely moved: measurable, nowhere near the commitment. */
const SHORTFALL_WH: number[] = [60_000, 84_000, 76_000, 60_000, 50_000];

/** Deterministic jitter so the fixtures look like real data and never change between runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function profileFor(hourlyWh: number[], rand: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < INTERVALS_PER_DAY; i++) {
    const hour = Math.floor((i * INTERVAL_SECONDS) / 3600);
    const base = hourlyWh[Math.min(hour, hourlyWh.length - 1)] ?? 0;
    const jitter = 1 + (rand() - 0.5) * 0.12; // +/- 6%
    out.push(Math.max(0, Math.round(base * jitter)));
  }
  return out;
}

async function signDay(
  account: ReturnType<typeof deviceAccount>,
  siteId: `0x${string}`,
  dayStart: number,
  values: number[],
  startingNonce: number,
): Promise<SignedMeterReading[]> {
  const signed: SignedMeterReading[] = [];
  for (let i = 0; i < values.length; i++) {
    const reading: MeterReading = {
      siteId,
      device: account.address,
      periodStart: dayStart + i * INTERVAL_SECONDS,
      periodEnd: dayStart + (i + 1) * INTERVAL_SECONDS,
      wh: values[i] ?? 0,
      nonce: startingNonce + i,
    };
    const signature = await account.signTypedData(buildMeterReadingTypedData(METER_CHAIN_ID, reading));
    signed.push({ reading, signature });
  }
  return signed;
}

function batchOf(
  siteId: `0x${string}`,
  device: `0x${string}`,
  readings: SignedMeterReading[],
): MeterBatch {
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last) throw new Error("a batch needs at least one reading");
  return {
    siteId,
    device,
    windowStart: first.reading.periodStart,
    windowEnd: last.reading.periodEnd,
    intervalSeconds: INTERVAL_SECONDS,
    readings,
  };
}

/** Slice a full-evening batch down to the declared event window. */
export function sliceWindow(batch: MeterBatch, windowStart: number, windowEnd: number): MeterBatch {
  const readings = batch.readings.filter(
    (r) => r.reading.periodStart >= windowStart && r.reading.periodEnd <= windowEnd,
  );
  return { ...batch, windowStart, windowEnd, readings };
}

export async function buildFixtures() {
  const account = deviceAccount();
  const siteId = siteIdFromName(SITE_NAME);
  const rand = mulberry32(20260919);

  // Baseline: five ordinary weekday evenings.
  const baselineReadings: SignedMeterReading[] = [];
  let nonce = 1;
  for (let d = 0; d < BASELINE_DAYS; d++) {
    const dayStart = FIRST_BASELINE_DAY_UTC + d * DAY;
    const values = profileFor(ORDINARY_WH, rand);
    const signed = await signDay(account, siteId, dayStart, values, nonce);
    nonce += signed.length;
    baselineReadings.push(...signed);
  }
  // A baseline batch is not contiguous across days, so it is stored as a plain reading set.
  const baseline = {
    siteId,
    device: account.address,
    intervalSeconds: INTERVAL_SECONDS,
    utcOffsetSeconds: UTC_OFFSET_SECONDS,
    days: BASELINE_DAYS,
    readings: baselineReadings,
  };

  // Event evening, two alternative outcomes. Both continue the device's nonce sequence.
  const eventNonce = nonce;
  const delivered = batchOf(
    siteId,
    account.address,
    await signDay(account, siteId, EVENT_DAY_UTC, profileFor(DELIVERED_WH, mulberry32(777)), eventNonce),
  );
  const shortfall = batchOf(
    siteId,
    account.address,
    await signDay(account, siteId, EVENT_DAY_UTC, profileFor(SHORTFALL_WH, mulberry32(778)), eventNonce),
  );

  const windowStart = EVENT_DAY_UTC + EVENT_WINDOW_OFFSET;
  const windowEnd = windowStart + EVENT_WINDOW_SECONDS;

  return {
    baseline,
    delivered: sliceWindow(delivered, windowStart, windowEnd),
    shortfall: sliceWindow(shortfall, windowStart, windowEnd),
    windowStart,
    windowEnd,
    siteId,
    device: account.address,
  };
}
