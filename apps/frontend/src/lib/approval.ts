import { hashApproval, hashCanonicalText, payloadToApproval, type MilestoneApprovalPayload } from "@minga/shared";
import type { AgreementDetail, Manifest } from "@/data/types";

export interface ApprovalCheck {
  key: string;
  label: string;
  ok: boolean;
}

export interface ApprovalCheckInput {
  agreement: AgreementDetail;
  milestoneId: 0 | 1;
  payload: MilestoneApprovalPayload;
  payloadHash: string;
  manifests: Manifest[];
  chainId: number;
  nowSec: number;
}

/**
 * The frontend never signs what the backend hands it on trust. Before the wallet is asked for a signature, every field of the
 * proposed approval is compared with the agreement as the contract holds it and the evidence hash is recomputed from the stored
 * manifest text. Any failed check blocks signing.
 */
export function checkApproval(i: ApprovalCheckInput): { checks: ApprovalCheck[]; ok: boolean } {
  const { agreement: a, payload: p } = i;
  const milestone = a.milestones[i.milestoneId];
  const manifest = i.manifests.find((m) => m.evidenceHash.toLowerCase() === p.evidenceHash.toLowerCase());
  const deadline = Math.floor(new Date(a.executionDeadline).getTime() / 1000);

  let hashOk = false;
  try {
    hashOk = hashApproval(i.chainId, a.address as `0x${string}`, payloadToApproval(p)).toLowerCase() === i.payloadHash.toLowerCase();
  } catch {
    hashOk = false;
  }

  const checks: ApprovalCheck[] = [
    { key: "milestone", label: `It approves milestone ${i.milestoneId + 1}`, ok: p.milestoneId === i.milestoneId },
    { key: "terms", label: "It refers to the agreement's terms hash", ok: p.termsHash.toLowerCase() === a.termsHash.toLowerCase() },
    { key: "amount", label: "The amount equals the milestone amount", ok: p.amount === milestone.amount },
    { key: "nonce", label: "It has not been invalidated", ok: p.nonce === milestone.nonce },
    { key: "mode", label: "The demonstration-mode flag matches", ok: p.demoMode === a.demo },
    {
      key: "evidence",
      label: "The evidence hash is recomputed from the stored evidence list",
      ok: !!manifest && hashCanonicalText(manifest.manifestText).toLowerCase() === p.evidenceHash.toLowerCase(),
    },
    { key: "window", label: "It is still valid and ends before the execution deadline", ok: p.validUntil > i.nowSec && p.validUntil <= deadline && p.signedAt <= p.validUntil },
    { key: "digest", label: "Its digest matches the typed data your wallet will show", ok: hashOk },
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}
