/**
 * Gate A — a settlement is only as good as the readings it paid for.
 *
 * These tests prove the verifier accepts an honest batch and refuses a manipulated one, and
 * that the baseline arithmetic distinguishes a site that delivered from one that did not.
 */
import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASELINE_METHOD,
  buildBaselineProfile,
  buildMeterReadingTypedData,
  baselineWhForWindow,
  computeSettlement,
  hashMeterBatch,
  hashSettlement,
  verifyMeterBatch,
  type MeterBatch,
  buildFixtures,
  deviceAccount,
  INTERVAL_SECONDS,
  METER_CHAIN_ID,
  UTC_OFFSET_SECONDS,
} from "@minga/shared";


/** What the offtaker and the site agreed in the program terms. */
const COMMITTED_WH = 500_000; // 500 kWh shed during the window
const TARIFF_MICRO_USD_PER_KWH = 150_000; // USD 0.15 per avoided kWh

type Fixtures = Awaited<ReturnType<typeof buildFixtures>>;
let f: Fixtures;
const device = deviceAccount().address;

function clone(batch: MeterBatch): MeterBatch {
  return JSON.parse(JSON.stringify(batch)) as MeterBatch;
}

before(async () => {
  f = await buildFixtures();
});

describe("A1. Signed meter batches", () => {
  it("accepts an honest batch: every reading recovers to the device", async () => {
    const result = await verifyMeterBatch(METER_CHAIN_ID, f.delivered, device);
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
    assert.equal(result.count, 12);
    assert.ok(result.totalWh > 0);
  });

  it("rejects a tampered consumption value", async () => {
    const tampered = clone(f.delivered);
    tampered.readings[5]!.reading.wh = 1; // pretend the site used almost nothing
    const result = await verifyMeterBatch(METER_CHAIN_ID, tampered, device);
    assert.equal(result.ok, false);
    assert.equal(result.problems[0]?.index, 5);
    assert.equal(result.problems[0]?.code, "BAD_SIGNATURE");
  });

  it("rejects a reading signed by a different key", async () => {
    const impostor = privateKeyToAccount(keccak256(toBytes("not-the-meter")));
    const forged = clone(f.delivered);
    const reading = { ...forged.readings[2]!.reading, device: impostor.address };
    forged.readings[2] = {
      reading,
      signature: await impostor.signTypedData(buildMeterReadingTypedData(METER_CHAIN_ID, reading)),
    };
    const result = await verifyMeterBatch(METER_CHAIN_ID, forged, device);
    assert.equal(result.ok, false);
    assert.equal(result.problems[0]?.code, "WRONG_DEVICE");
  });

  it("rejects a replayed reading (nonce not increasing)", async () => {
    const replayed = clone(f.delivered);
    const earlier = clone(f.delivered).readings[3]!;
    replayed.readings[4] = earlier;
    const result = await verifyMeterBatch(METER_CHAIN_ID, replayed, device);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.code === "NONCE_NOT_INCREASING"));
  });

  it("rejects a reading that falls outside the declared window", async () => {
    const drifted = clone(f.delivered);
    drifted.windowEnd -= INTERVAL_SECONDS;
    const result = await verifyMeterBatch(METER_CHAIN_ID, drifted, device);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.code === "OUTSIDE_WINDOW"));
  });

  it("rejects a gap in the interval sequence", async () => {
    const gapped = clone(f.delivered);
    gapped.readings.splice(6, 1);
    const result = await verifyMeterBatch(METER_CHAIN_ID, gapped, device);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.code === "PERIOD_NOT_CONTIGUOUS"));
  });

  it("hashes a batch deterministically and changes when a signature changes", () => {
    const a = hashMeterBatch(f.delivered);
    assert.equal(a, hashMeterBatch(clone(f.delivered)));
    const altered = clone(f.delivered);
    altered.readings[0]!.reading.wh += 1;
    assert.notEqual(a, hashMeterBatch(altered));
  });
});

describe("A2. Baseline and settlement", () => {
  it("builds a baseline profile from five ordinary evenings", () => {
    const profile = buildBaselineProfile(
      f.baseline.readings.map((r) => r.reading),
      INTERVAL_SECONDS,
      UTC_OFFSET_SECONDS,
    );
    assert.equal(profile.days, 5);
    assert.equal(profile.method, BASELINE_METHOD);
    // 17:00-22:00 local at 15-minute intervals = 20 clock slots.
    assert.equal(Object.keys(profile.slotWh).length, 20);
    const expected = baselineWhForWindow(profile, f.windowStart, f.windowEnd);
    assert.ok(expected > 900_000 && expected < 1_200_000, `baseline window was ${expected} Wh`);
  });

  it("settles when the site delivered more than it committed", async () => {
    const profile = buildBaselineProfile(
      f.baseline.readings.map((r) => r.reading),
      INTERVAL_SECONDS,
      UTC_OFFSET_SECONDS,
    );
    const verified = await verifyMeterBatch(METER_CHAIN_ID, f.delivered, device);
    assert.equal(verified.ok, true);

    const settlement = computeSettlement({
      siteId: f.siteId,
      device,
      windowStart: f.windowStart,
      windowEnd: f.windowEnd,
      baselineWh: baselineWhForWindow(profile, f.windowStart, f.windowEnd),
      actualWh: verified.totalWh,
      tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
      batchHash: hashMeterBatch(f.delivered),
      baselineMethod: profile.method,
    });

    assert.ok(
      settlement.avoidedWh >= COMMITTED_WH,
      `avoided ${settlement.avoidedWh} Wh should meet the ${COMMITTED_WH} Wh commitment`,
    );
    assert.ok(settlement.payout > 0n);

    const { hash, text } = hashSettlement(settlement);
    assert.match(hash, /^0x[0-9a-f]{64}$/);
    // The hash must commit to the batch, so a different batch cannot reuse this evidence hash.
    assert.ok(text.includes(settlement.batchHash));
  });

  it("refuses to settle when the site missed its commitment", async () => {
    const profile = buildBaselineProfile(
      f.baseline.readings.map((r) => r.reading),
      INTERVAL_SECONDS,
      UTC_OFFSET_SECONDS,
    );
    const verified = await verifyMeterBatch(METER_CHAIN_ID, f.shortfall, device);
    assert.equal(verified.ok, true, "the shortfall readings are honest, just disappointing");

    const settlement = computeSettlement({
      siteId: f.siteId,
      device,
      windowStart: f.windowStart,
      windowEnd: f.windowEnd,
      baselineWh: baselineWhForWindow(profile, f.windowStart, f.windowEnd),
      actualWh: verified.totalWh,
      tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
      batchHash: hashMeterBatch(f.shortfall),
      baselineMethod: profile.method,
    });

    assert.ok(
      settlement.avoidedWh < COMMITTED_WH,
      `avoided ${settlement.avoidedWh} Wh should miss the ${COMMITTED_WH} Wh commitment`,
    );
  });

  it("never pays for consuming more than the baseline", () => {
    const settlement = computeSettlement({
      siteId: f.siteId,
      device,
      windowStart: f.windowStart,
      windowEnd: f.windowEnd,
      baselineWh: 200_000,
      actualWh: 500_000,
      tariffMicroUsdPerKwh: TARIFF_MICRO_USD_PER_KWH,
      batchHash: ("0x" + "11".repeat(32)) as Hex,
      baselineMethod: BASELINE_METHOD,
    });
    assert.equal(settlement.avoidedWh, 0);
    assert.equal(settlement.payout, 0n);
  });
});
