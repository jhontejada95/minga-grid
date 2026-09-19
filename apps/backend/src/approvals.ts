import crypto from "node:crypto";
import type { Address, Hex } from "viem";
import {
  approvalToPayload,
  hashApproval,
  payloadToApproval,
  type ApprovalMessage,
  type MilestoneApprovalPayload,
} from "@minga/shared";
import type { AppContext } from "./context.js";
import { all, get, run } from "./db.js";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { refreshAgreementState, roleOf, type AgreementRow } from "./agreements.js";
import { findManifestByHash, latestManifest } from "./evidence.js";

const MIN_SIGNING_WINDOW_SECONDS = 60;
/** A stored payload is reused only while at least this much validity remains. */
const MIN_REUSE_REMAINING_SECONDS = 300;

interface PayloadRow {
  id: string;
  agreement: string;
  milestone_id: number;
  nonce: number;
  evidence_hash: string;
  terms_hash: string;
  payload_json: string;
  payload_hash: string;
  valid_until: number;
  created_by: string;
  created_at: number;
}

interface SignatureRow {
  id: string;
  payload_hash: string;
  role: "COMMUNITY" | "REVIEWER";
  signer: string;
  signature: string;
  created_at: number;
}

const nonceOf = (row: AgreementRow, m: number) => (m === 0 ? row.nonce_0 : row.nonce_1);
const amountOf = (row: AgreementRow, m: number) => (m === 0 ? row.milestone_amount_0 : row.milestone_amount_1);

export interface ApprovalPayloadDto {
  id: string;
  payload: MilestoneApprovalPayload;
  payloadHash: Hex;
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  reused: boolean;
}

function payloadDto(ctx: AppContext, p: PayloadRow, reused: boolean): ApprovalPayloadDto {
  return {
    id: p.id,
    payload: JSON.parse(p.payload_json) as MilestoneApprovalPayload,
    payloadHash: p.payload_hash as Hex,
    domain: { name: "MingaConservationAgreement", version: "1", chainId: ctx.chain.chainId, verifyingContract: p.agreement },
    reused,
  };
}

/** Milestone that can currently be approved: funded, active, next in sequence and before the deadline. */
function assertApprovable(row: AgreementRow, milestoneId: number, chainNow: bigint) {
  if (row.funded !== 1) throw conflict("NOT_FUNDED", "The agreement has not been funded yet.");
  if (row.refunded === 1) throw conflict("AGREEMENT_REFUNDED", "The remaining funds were already refunded.");
  if (milestoneId !== row.next_milestone_id) {
    throw conflict("MILESTONE_NOT_NEXT", "Only the next unpaid milestone can be approved.");
  }
  if (chainNow >= BigInt(row.execution_deadline)) throw conflict("DEADLINE_PASSED", "The execution deadline has passed.");
}

/**
 * Returns the shared typed-data payload for (milestone, evidence version, current nonce), creating it
 * if needed. Both participants sign this identical payload; the server never builds a per-signer copy.
 * Timestamps come from chain time so `signedAt <= block.timestamp` always holds at release.
 */
export async function prepareApprovalPayload(
  ctx: AppContext,
  address: string,
  milestoneId: 0 | 1,
  wallet: string,
  evidenceHash?: string
): Promise<ApprovalPayloadDto> {
  const row = await refreshAgreementState(ctx, address);
  const role = roleOf(row, wallet);
  if (role !== "COMMUNITY" && role !== "REVIEWER") {
    throw forbidden("NOT_A_SIGNER", "Only the community representative and the reviewer prepare approvals.");
  }
  const chainNow = await ctx.chain.getLatestTimestamp();
  assertApprovable(row, milestoneId, chainNow);

  const manifest = evidenceHash
    ? findManifestByHash(ctx, row.address, milestoneId, evidenceHash)
    : latestManifest(ctx, row.address, milestoneId);
  if (!manifest) throw conflict("NO_EVIDENCE", "Create an evidence version for this milestone before approving it.");

  const nonce = nonceOf(row, milestoneId);
  const existing = get<PayloadRow>(
    ctx.db,
    `SELECT * FROM approval_payloads WHERE agreement = ? AND milestone_id = ? AND nonce = ? AND evidence_hash = ?
     AND valid_until > ? ORDER BY created_at DESC LIMIT 1`,
    row.address, milestoneId, nonce, manifest.evidence_hash, Number(chainNow) + MIN_REUSE_REMAINING_SECONDS
  );
  if (existing) return payloadDto(ctx, existing, true);

  const signedAt = chainNow > BigInt(row.funded_at) ? chainNow : BigInt(row.funded_at);
  const execution = BigInt(row.execution_deadline);
  if (execution - signedAt < BigInt(MIN_SIGNING_WINDOW_SECONDS)) {
    throw conflict("APPROVAL_WINDOW_CLOSED", "Too little time remains before the execution deadline to collect signatures.");
  }
  const ttl = BigInt(ctx.config.approvalTtlSeconds);
  const validUntil = signedAt + ttl < execution ? signedAt + ttl : execution;

  const message: ApprovalMessage = {
    milestoneId: BigInt(milestoneId),
    termsHash: row.terms_hash as Hex,
    evidenceHash: manifest.evidence_hash as Hex,
    amount: BigInt(amountOf(row, milestoneId)),
    nonce: BigInt(nonce),
    signedAt,
    validUntil,
    demoMode: row.demo_mode === 1,
  };
  const payloadHash = hashApproval(ctx.chain.chainId, row.address as Address, message);
  run(
    ctx.db,
    `INSERT OR IGNORE INTO approval_payloads
       (id, agreement, milestone_id, nonce, evidence_hash, terms_hash, payload_json, payload_hash, valid_until, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), row.address, milestoneId, nonce, manifest.evidence_hash, row.terms_hash,
    JSON.stringify(approvalToPayload(message)), payloadHash, Number(validUntil), wallet.toLowerCase(), ctx.now()
  );
  const stored = get<PayloadRow>(ctx.db, "SELECT * FROM approval_payloads WHERE payload_hash = ?", payloadHash);
  if (!stored) throw notFound("PAYLOAD_NOT_FOUND", "Approval payload could not be stored.");
  return payloadDto(ctx, stored, false);
}

/**
 * Stores a signature only after it is proven valid for the exact stored payload, by the authenticated
 * wallet, in the role that wallet has on-chain, against the current nonce and deadline.
 */
export async function submitApprovalSignature(
  ctx: AppContext,
  address: string,
  milestoneId: 0 | 1,
  wallet: string,
  input: { payloadHash: string; signature: string }
): Promise<{ role: "COMMUNITY" | "REVIEWER"; payloadHash: string; signer: string }> {
  const row = await refreshAgreementState(ctx, address);
  const role = roleOf(row, wallet);
  if (role !== "COMMUNITY" && role !== "REVIEWER") {
    throw forbidden("NOT_A_SIGNER", "Only the community representative and the reviewer can sign approvals.");
  }
  if (!/^0x[0-9a-fA-F]+$/.test(input.signature) || input.signature.length > 4000) {
    throw badRequest("INVALID_SIGNATURE", "The signature must be a hex string.");
  }

  const stored = get<PayloadRow>(
    ctx.db,
    "SELECT * FROM approval_payloads WHERE payload_hash = ? AND agreement = ? AND milestone_id = ?",
    input.payloadHash.toLowerCase(), row.address, milestoneId
  );
  if (!stored) throw notFound("PAYLOAD_NOT_FOUND", "No approval payload with that hash exists for this milestone.");

  const chainNow = await ctx.chain.getLatestTimestamp();
  assertApprovable(row, milestoneId, chainNow);
  if (stored.nonce !== nonceOf(row, milestoneId)) {
    throw conflict("STALE_APPROVAL", "This approval was invalidated. Prepare a new approval and sign again.");
  }
  if (BigInt(stored.valid_until) <= chainNow) throw conflict("APPROVAL_EXPIRED", "This approval has expired. Prepare a new one.");

  const message = payloadToApproval(JSON.parse(stored.payload_json) as MilestoneApprovalPayload);
  const valid = await ctx.chain.verifyApprovalSignature({
    agreement: row.address as Address,
    signer: wallet as Address,
    message,
    signature: input.signature as Hex,
  });
  if (!valid) throw badRequest("INVALID_SIGNATURE", "The signature does not match this approval and your account.");

  run(
    ctx.db,
    `INSERT INTO approval_signatures (id, payload_hash, role, signer, signature, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (payload_hash, role) DO UPDATE SET signer = excluded.signer, signature = excluded.signature, created_at = excluded.created_at`,
    crypto.randomUUID(), stored.payload_hash, role, wallet.toLowerCase(), input.signature, ctx.now()
  );
  return { role, payloadHash: stored.payload_hash, signer: wallet.toLowerCase() };
}

export interface ApprovalSignatureDto {
  role: "COMMUNITY" | "REVIEWER";
  signer: string;
  signature: string;
  signedAt: string;
  stale: boolean;
}

export interface ApprovalStateDto {
  payload: MilestoneApprovalPayload | null;
  payloadHash: string | null;
  signatures: ApprovalSignatureDto[];
  matchesContract: { termsHash: boolean; amount: boolean; nonce: boolean; evidenceHash: boolean };
  /** Two current, non-stale signatures on the current payload while the agreement can still pay. */
  executable: boolean;
  release: null | { approval: MilestoneApprovalPayload; communitySignature: string; verifierSignature: string };
  history: { payloadHash: string; payload: MilestoneApprovalPayload; stale: boolean; signatures: ApprovalSignatureDto[] }[];
}

/**
 * Current payload and signatures for participants. State, roles, nonce and deadline are re-read from the
 * chain first; signatures on an invalidated or expired payload stay visible as history but are marked
 * stale and never marked executable.
 */
export async function getApprovalState(ctx: AppContext, address: string, milestoneId: 0 | 1): Promise<ApprovalStateDto> {
  const row = await refreshAgreementState(ctx, address);
  const chainNow = await ctx.chain.getLatestTimestamp();
  const payloads = all<PayloadRow>(
    ctx.db,
    "SELECT * FROM approval_payloads WHERE agreement = ? AND milestone_id = ? ORDER BY created_at DESC, rowid DESC",
    row.address, milestoneId
  );

  const currentNonce = nonceOf(row, milestoneId);
  const isStale = (p: PayloadRow) => p.nonce !== currentNonce || BigInt(p.valid_until) <= chainNow;
  const sigsOf = (p: PayloadRow, stale: boolean): ApprovalSignatureDto[] =>
    all<SignatureRow>(ctx.db, "SELECT * FROM approval_signatures WHERE payload_hash = ? ORDER BY role", p.payload_hash).map((s) => ({
      role: s.role,
      signer: s.signer,
      signature: s.signature,
      signedAt: new Date(s.created_at).toISOString(),
      stale,
    }));

  const current = payloads.find((p) => !isStale(p));
  const latest = current ?? payloads[0];
  const canPay =
    row.funded === 1 && row.refunded === 0 && milestoneId === row.next_milestone_id && chainNow < BigInt(row.execution_deadline);

  const currentSigs = current ? sigsOf(current, false) : [];
  const executable =
    !!current && canPay && currentSigs.some((s) => s.role === "COMMUNITY") && currentSigs.some((s) => s.role === "REVIEWER");

  const latestMessage = latest ? (JSON.parse(latest.payload_json) as MilestoneApprovalPayload) : null;
  const manifest = latest ? findManifestByHash(ctx, row.address, milestoneId, latest.evidence_hash) : undefined;

  return {
    payload: current ? (JSON.parse(current.payload_json) as MilestoneApprovalPayload) : null,
    payloadHash: current?.payload_hash ?? null,
    signatures: currentSigs,
    matchesContract: {
      termsHash: !!latestMessage && latestMessage.termsHash.toLowerCase() === row.terms_hash,
      amount: !!latestMessage && latestMessage.amount === amountOf(row, milestoneId),
      nonce: !!latest && !isStale(latest),
      evidenceHash: !!manifest,
    },
    executable,
    release:
      executable && current
        ? {
            approval: JSON.parse(current.payload_json) as MilestoneApprovalPayload,
            communitySignature: currentSigs.find((s) => s.role === "COMMUNITY")!.signature,
            verifierSignature: currentSigs.find((s) => s.role === "REVIEWER")!.signature,
          }
        : null,
    history: payloads
      .filter((p) => p !== current)
      .map((p) => ({
        payloadHash: p.payload_hash,
        payload: JSON.parse(p.payload_json) as MilestoneApprovalPayload,
        stale: true,
        signatures: sigsOf(p, true),
      })),
  };
}
