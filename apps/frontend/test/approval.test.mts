import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalToPayload, canonicalize, hashApproval, type ApprovalMessage } from "@minga/shared";
import { checkApproval } from "../src/lib/approval";
import type { AgreementDetail, Manifest } from "../src/data/types";

const AGREEMENT = "0x1111111111111111111111111111111111111111";
const TERMS = `0x${"ab".repeat(32)}` as const;
const CHAIN_ID = 133;
const NOW = 1_800_000_000;
const DEADLINE = NOW + 30 * 86_400;

const manifestObj = { manifestVersion: "1.0", chainId: CHAIN_ID, agreementAddress: AGREEMENT, milestoneId: 0, files: [{ sha256: "aa" }] };
const canon = canonicalize(manifestObj);

const manifest: Manifest = {
  id: "m1", version: 1, evidenceHash: canon.hash, createdAt: "2026-09-19T00:00:00.000Z", createdBy: "0x0", mode: "DEMO",
  manifestText: canon.text, files: [], requirementKeys: [], current: true,
};

function agreement(over: Partial<AgreementDetail> = {}): AgreementDetail {
  return {
    address: AGREEMENT, projectName: "P", demo: true, status: "FUNDED", totalBudget: "100000000", totalPaid: "0",
    fundingDeadline: new Date((NOW - 86_400) * 1000).toISOString(), executionDeadline: new Date(DEADLINE * 1000).toISOString(),
    funder: "0xf", communitySigner: "0xc", verifierSigner: "0xv", freshness: { lastIndexedBlock: 1, headBlock: 1, syncing: false, updatedAt: null },
    role: "OBSERVER", description: "", token: { address: "0xt", symbol: "mUSD", decimals: 6 }, factory: "0xfa", termsHash: TERMS, metadataHash: TERMS,
    metadata: null, communityAccepted: true, verifierAccepted: true, funded: true, refunded: false, payeeCommunity: "0xa", payeeMonitoring: "0xb", communityBps: 8000,
    money: { budget: "100000000", deposited: "100000000", paidOut: "0", refundable: "0", pending: "100000000" },
    milestones: [
      { id: 0, title: "M1", amount: "50000000", status: "AWAITING_SIGNATURES", nonce: 0, requiredEvidence: [] },
      { id: 1, title: "M2", amount: "50000000", status: "LOCKED", nonce: 0, requiredEvidence: [] },
    ],
    ...over,
  };
}

const message: ApprovalMessage = {
  milestoneId: 0n, termsHash: TERMS, evidenceHash: canon.hash, amount: 50_000_000n, nonce: 0n,
  signedAt: BigInt(NOW - 60), validUntil: BigInt(NOW + 3600), demoMode: true,
};

function run(over: { agreement?: AgreementDetail; payload?: ReturnType<typeof approvalToPayload>; payloadHash?: string; manifests?: Manifest[]; nowSec?: number } = {}) {
  const payload = over.payload ?? approvalToPayload(message);
  return checkApproval({
    agreement: over.agreement ?? agreement(),
    milestoneId: 0,
    payload,
    payloadHash: over.payloadHash ?? hashApproval(CHAIN_ID, AGREEMENT, message),
    manifests: over.manifests ?? [manifest],
    chainId: CHAIN_ID,
    nowSec: over.nowSec ?? NOW,
  });
}
const failing = (r: ReturnType<typeof run>) => r.checks.filter((c) => !c.ok).map((c) => c.key);

describe("checkApproval (what the browser verifies before asking for a signature)", () => {
  it("passes for an approval that matches the agreement, the evidence and the typed data", () => {
    const r = run();
    assert.deepEqual(failing(r), []);
    assert.equal(r.ok, true);
  });

  it("blocks a different terms hash", () => {
    const p = approvalToPayload({ ...message, termsHash: `0x${"cd".repeat(32)}` });
    assert.deepEqual(failing(run({ payload: p, payloadHash: hashApproval(CHAIN_ID, AGREEMENT, { ...message, termsHash: p.termsHash }) })), ["terms"]);
  });

  it("blocks an inflated amount", () => {
    const m = { ...message, amount: 90_000_000n };
    assert.deepEqual(failing(run({ payload: approvalToPayload(m), payloadHash: hashApproval(CHAIN_ID, AGREEMENT, m) })), ["amount"]);
  });

  it("blocks an approval whose nonce was already invalidated on-chain", () => {
    const a = agreement();
    a.milestones[0].nonce = 1;
    assert.deepEqual(failing(run({ agreement: a })), ["nonce"]);
  });

  it("blocks a demo/production mode mismatch", () => {
    assert.deepEqual(failing(run({ agreement: agreement({ demo: false }) })), ["mode"]);
  });

  it("blocks a payload for the wrong milestone", () => {
    const m = { ...message, milestoneId: 1n };
    assert.ok(failing(run({ payload: approvalToPayload(m), payloadHash: hashApproval(CHAIN_ID, AGREEMENT, m) })).includes("milestone"));
  });

  it("recomputes the evidence hash from the manifest text instead of trusting the stored hash", () => {
    const tampered: Manifest = { ...manifest, manifestText: manifest.manifestText.replace('"sha256":"aa"', '"sha256":"bb"') };
    assert.deepEqual(failing(run({ manifests: [tampered] })), ["evidence"]);
    assert.deepEqual(failing(run({ manifests: [] })), ["evidence"]);
  });

  it("blocks expired approvals and approvals that outlive the execution deadline", () => {
    assert.deepEqual(failing(run({ nowSec: NOW + 7200 })), ["window"]);
    const late = { ...message, validUntil: BigInt(DEADLINE + 1) };
    assert.deepEqual(failing(run({ payload: approvalToPayload(late), payloadHash: hashApproval(CHAIN_ID, AGREEMENT, late) })), ["window"]);
  });

  it("blocks a payload hash that does not match the typed data the wallet would show", () => {
    assert.deepEqual(failing(run({ payloadHash: `0x${"00".repeat(32)}` })), ["digest"]);
    // Same fields bound to another agreement address produce another digest.
    assert.deepEqual(failing(run({ payloadHash: hashApproval(CHAIN_ID, "0x2222222222222222222222222222222222222222", message) })), ["digest"]);
  });
});
