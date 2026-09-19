import type { AppContext } from "./context.js";
import { get } from "./db.js";
import {
  getFreshness, isParticipant, loadMetadata, requirementsOf, statusOf, toSummary,
  type AgreementRow, type AgreementSummaryDto, type Role,
} from "./agreements.js";
import { latestManifest, manifestRequirementKeys } from "./evidence.js";

export type MilestoneStatus =
  | "LOCKED" | "COLLECTING_EVIDENCE" | "AWAITING_SIGNATURES" | "READY_TO_RELEASE" | "PAID" | "EXPIRED";

export interface MilestoneReceiptDto {
  txHash: string;
  blockNumber: number;
  paidAt: string | null;
  communityAmount: string;
  monitoringAmount: string;
  payeeCommunity: string;
  payeeMonitoring: string;
  evidenceHash: string;
  termsHash: string;
}

export interface MilestoneDto {
  id: 0 | 1;
  title: string;
  amount: string;
  status: MilestoneStatus;
  nonce: number;
  requiredEvidence: { key: string; description: string; satisfied?: boolean }[];
  receipt?: MilestoneReceiptDto;
}

export interface AgreementDetailDto extends AgreementSummaryDto {
  role: Role;
  description: string;
  location?: { region?: string; country?: string; coordinates?: string };
  token: { address: string; symbol: string | null; decimals: number | null };
  factory: string;
  termsHash: string;
  metadataHash: string;
  metadata: { text: string; hashVerified: boolean } | null;
  communityAccepted: boolean;
  verifierAccepted: boolean;
  funded: boolean;
  refunded: boolean;
  payeeCommunity: string;
  payeeMonitoring: string;
  communityBps: number;
  money: { budget: string; deposited: string; paidOut: string; refundable: string; pending: string };
  milestones: [MilestoneDto, MilestoneDto];
}

function receiptFor(ctx: AppContext, address: string, milestoneId: number): MilestoneReceiptDto | undefined {
  const r = get<{ tx_hash: string; block_number: number; block_timestamp: number; data_json: string }>(
    ctx.db,
    `SELECT tx_hash, block_number, block_timestamp, data_json FROM indexed_events
     WHERE contract = ? AND event_name = 'MilestonePaid' AND json_extract(data_json, '$.milestoneId') = ?
     ORDER BY block_number DESC LIMIT 1`,
    address, String(milestoneId)
  );
  if (!r) return undefined;
  const d = JSON.parse(r.data_json) as Record<string, string>;
  return {
    txHash: r.tx_hash,
    blockNumber: r.block_number,
    paidAt: r.block_timestamp ? new Date(r.block_timestamp * 1000).toISOString() : null,
    communityAmount: String(d.communityAmount),
    monitoringAmount: String(d.monitoringAmount),
    payeeCommunity: String(d.payeeCommunity).toLowerCase(),
    payeeMonitoring: String(d.payeeMonitoring).toLowerCase(),
    evidenceHash: String(d.evidenceHash),
    termsHash: String(d.termsHash),
  };
}

function signatureCount(ctx: AppContext, row: AgreementRow, milestoneId: number, nowSeconds: number): number {
  const nonce = milestoneId === 0 ? row.nonce_0 : row.nonce_1;
  const payload = get<{ payload_hash: string }>(
    ctx.db,
    `SELECT payload_hash FROM approval_payloads WHERE agreement = ? AND milestone_id = ? AND nonce = ? AND valid_until > ?
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    row.address, milestoneId, nonce, nowSeconds
  );
  if (!payload) return 0;
  return get<{ n: number }>(ctx.db, "SELECT COUNT(DISTINCT role) AS n FROM approval_signatures WHERE payload_hash = ?", payload.payload_hash)?.n ?? 0;
}

/**
 * Agreement detail for one viewer. Money, deadlines, participants and receipts are public on-chain data.
 * Evidence-derived progress (which requirements are satisfied, how many signatures exist) is participant-only.
 */
export function buildAgreementDetail(ctx: AppContext, row: AgreementRow, role: Role): AgreementDetailDto {
  const meta = loadMetadata(ctx, row);
  const participant = isParticipant(role);
  const nowSeconds = Math.floor(ctx.now() / 1000);
  const status = statusOf(row, BigInt(nowSeconds));
  const summary = toSummary(ctx, row, getFreshness(ctx));

  const build = (id: 0 | 1): MilestoneDto => {
    const amount = id === 0 ? row.milestone_amount_0 : row.milestone_amount_1;
    const paid = row.next_milestone_id > id;
    const reqs = meta ? requirementsOf(meta.meta, id) : [];
    const manifest = participant ? latestManifest(ctx, row.address, id) : undefined;
    const provided = new Set(manifest ? manifestRequirementKeys(manifest.manifest_text) : []);

    let ms: MilestoneStatus;
    if (paid) ms = "PAID";
    else if (row.refunded === 1 || (row.funded === 1 && nowSeconds >= row.execution_deadline)) ms = "EXPIRED";
    else if (id > row.next_milestone_id) ms = "LOCKED";
    else if (!participant) ms = "COLLECTING_EVIDENCE";
    else if (!manifest || reqs.some((r) => !provided.has(r.key))) ms = "COLLECTING_EVIDENCE";
    else ms = signatureCount(ctx, row, id, nowSeconds) >= 2 ? "READY_TO_RELEASE" : "AWAITING_SIGNATURES";

    return {
      id,
      title: meta?.meta.milestones[id].title ?? `Milestone ${id + 1}`,
      amount,
      status: ms,
      nonce: id === 0 ? row.nonce_0 : row.nonce_1,
      requiredEvidence: reqs.map((r) => (participant ? { ...r, satisfied: provided.has(r.key) } : r)),
      receipt: paid ? receiptFor(ctx, row.address, id) : undefined,
    };
  };

  const budget = BigInt(row.total_budget);
  const paidOut = BigInt(row.total_paid);
  const funded = row.funded === 1 && row.refunded === 0;
  const expired = nowSeconds >= row.execution_deadline;
  const known = ctx.config.chain.token?.toLowerCase() === row.token;

  return {
    ...summary,
    status,
    role,
    description: meta?.meta.description ?? "",
    location: meta?.meta.location,
    token: { address: row.token, symbol: known ? "mUSD" : null, decimals: known ? 6 : null },
    factory: row.factory,
    termsHash: row.terms_hash,
    metadataHash: row.metadata_hash,
    metadata: meta ? { text: meta.text, hashVerified: meta.hashVerified } : null,
    communityAccepted: row.community_accepted === 1,
    verifierAccepted: row.verifier_accepted === 1,
    funded: row.funded === 1,
    refunded: row.refunded === 1,
    payeeCommunity: row.payee_community,
    payeeMonitoring: row.payee_monitoring,
    communityBps: row.community_bps,
    money: {
      budget: budget.toString(),
      deposited: row.funded === 1 ? budget.toString() : "0",
      paidOut: paidOut.toString(),
      refundable: funded && expired ? (budget - paidOut).toString() : "0",
      pending: funded && !expired ? (budget - paidOut).toString() : "0",
    },
    milestones: [build(0), build(1)],
  };
}
