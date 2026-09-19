import crypto from "node:crypto";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import { z } from "zod";
import { canonicalize, deriveAgreementStatus, type AgreementStatus } from "@minga/shared";
import type { AppContext } from "./context.js";
import { all, get, run, tx } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import type { DecodedEvent } from "./chain.js";

export type Role = "FUNDER" | "COMMUNITY" | "REVIEWER" | "OBSERVER";

export interface AgreementRow {
  address: string;
  chain_id: number;
  factory: string;
  factory_id: number;
  created_block: number;
  created_tx: string;
  payer: string;
  community_signer: string;
  verifier_signer: string;
  token: string;
  project_ref_hash: string;
  metadata_hash: string;
  methodology_hash: string;
  payee_community: string;
  payee_monitoring: string;
  community_bps: number;
  milestone_amount_0: string;
  milestone_amount_1: string;
  total_budget: string;
  funding_deadline: number;
  execution_deadline: number;
  demo_mode: number;
  terms_hash: string;
  community_accepted: number;
  verifier_accepted: number;
  funded: number;
  funded_at: number;
  refunded: number;
  total_paid: string;
  next_milestone_id: number;
  nonce_0: number;
  nonce_1: number;
  status: string;
  draft_id: string | null;
  state_block: number;
  state_at: number;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeAddress(input: string): Address {
  if (!ADDRESS_RE.test(input)) throw badRequest("INVALID_ADDRESS", "Expected a 0x-prefixed 20-byte address.");
  return input.toLowerCase() as Address;
}

// ---------------------------------------------------------------- metadata

const requirement = z.union([
  z.string().min(1).max(80),
  z.object({ key: z.string().min(1).max(80), description: z.string().max(400).optional() }).strict(),
]);
const milestoneMeta = z
  .object({
    id: z.number().int().min(0).max(1).optional(),
    title: z.string().min(1).max(160),
    amount: z.string().regex(/^\d+$/).optional(),
    requiredEvidence: z.array(requirement).max(20),
  })
  .strict();

/** Public agreement metadata. Strict: unknown keys are rejected so nothing private is published by accident. */
export const metadataSchema = z
  .object({
    projectId: z.string().min(1).max(80).optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
    location: z
      .object({
        region: z.string().max(120).optional(),
        country: z.string().max(80).optional(),
        coordinates: z.string().max(60).optional(),
      })
      .strict()
      .optional(),
    methodology: z
      .object({ name: z.string().max(160), version: z.string().max(40), hash: z.string().max(80).optional() })
      .strict()
      .optional(),
    currency: z.string().max(10).optional(),
    totalBudget: z.string().regex(/^\d+$/).optional(),
    communitySplitBps: z.number().int().min(1).max(9999).optional(),
    milestones: z.tuple([milestoneMeta, milestoneMeta]),
  })
  .strict();
export type AgreementMetadata = z.infer<typeof metadataSchema>;

export interface RequirementItem {
  key: string;
  description: string;
}

export function requirementsOf(meta: AgreementMetadata, milestoneId: 0 | 1): RequirementItem[] {
  return meta.milestones[milestoneId].requiredEvidence.map((r) =>
    typeof r === "string" ? { key: r, description: r } : { key: r.key, description: r.description ?? r.key }
  );
}

export interface DraftResult {
  id: string;
  metadataHash: Hex;
  projectRefHash: Hex;
  methodologyHash: Hex;
  metadataText: string;
}

/**
 * Stores the exact public metadata bytes for a proposed agreement. The client must pass the returned
 * hashes to `createAgreement`; the indexer later matches the factory event to this draft by
 * (metadataHash, payer), never by anything the client claims.
 */
export function createDraft(ctx: AppContext, owner: string, body: unknown, proposedParams?: unknown): DraftResult {
  const meta = metadataSchema.safeParse(body);
  if (!meta.success) {
    throw badRequest("INVALID_METADATA", meta.error.issues.map((i) => `${i.path.join(".") || "metadata"}: ${i.message}`).join("; "));
  }
  const { text, hash } = canonicalize(meta.data);
  const projectRef = meta.data.projectId ?? meta.data.name;
  const projectRefHash = keccak256(toBytes(projectRef));
  const methodologyHash = canonicalize(meta.data.methodology ?? { name: "unspecified", version: "0" }).hash;

  const existing = get<{ id: string }>(
    ctx.db,
    "SELECT id FROM agreement_drafts WHERE owner = ? AND metadata_hash = ?",
    owner,
    hash
  );
  const id = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    run(
      ctx.db,
      `INSERT INTO agreement_drafts (id, owner, project_ref, metadata_text, metadata_hash, proposed_params_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      owner,
      projectRef,
      text,
      hash,
      proposedParams ? JSON.stringify(proposedParams) : null,
      ctx.now()
    );
  }
  return { id, metadataHash: hash, projectRefHash, methodologyHash, metadataText: text };
}

export interface LoadedMetadata {
  meta: AgreementMetadata;
  text: string;
  /** True when the stored bytes hash to the metadataHash committed on-chain. */
  hashVerified: boolean;
}

export function loadMetadata(ctx: AppContext, row: AgreementRow): LoadedMetadata | null {
  if (!row.draft_id) return null;
  const draft = get<{ metadata_text: string }>(ctx.db, "SELECT metadata_text FROM agreement_drafts WHERE id = ?", row.draft_id);
  if (!draft) return null;
  const parsed = metadataSchema.safeParse(JSON.parse(draft.metadata_text));
  if (!parsed.success) return null;
  return {
    meta: parsed.data,
    text: draft.metadata_text,
    hashVerified: keccak256(toBytes(draft.metadata_text)).toLowerCase() === row.metadata_hash.toLowerCase(),
  };
}

// ---------------------------------------------------------------- rows

export function findAgreement(ctx: AppContext, address: string): AgreementRow | undefined {
  return get<AgreementRow>(ctx.db, "SELECT * FROM agreement_cache WHERE address = ?", normalizeAddress(address));
}

/** Only agreements created by the configured factory are known; anything else is a 404. */
export function requireAgreement(ctx: AppContext, address: string): AgreementRow {
  const row = findAgreement(ctx, address);
  if (!row) throw notFound("AGREEMENT_NOT_FOUND", "This agreement is not registered by the MINGA factory.");
  return row;
}

/** Role of a wallet in an agreement, derived from the contract's participant addresses only. */
export function roleOf(row: AgreementRow, wallet: string | undefined): Role {
  if (!wallet) return "OBSERVER";
  const w = wallet.toLowerCase();
  if (w === row.payer) return "FUNDER";
  if (w === row.community_signer) return "COMMUNITY";
  if (w === row.verifier_signer) return "REVIEWER";
  return "OBSERVER";
}

export const isParticipant = (role: Role) => role !== "OBSERVER";

export function statusOf(row: AgreementRow, nowSeconds: bigint): AgreementStatus {
  return deriveAgreementStatus({
    funded: row.funded === 1,
    refunded: row.refunded === 1,
    communityAccepted: row.community_accepted === 1,
    verifierAccepted: row.verifier_accepted === 1,
    nextMilestoneId: BigInt(row.next_milestone_id),
    totalPaid: BigInt(row.total_paid),
    totalBudget: BigInt(row.total_budget),
    fundingDeadline: BigInt(row.funding_deadline),
    executionDeadline: BigInt(row.execution_deadline),
    now: nowSeconds,
  });
}

// ---------------------------------------------------------------- discovery and refresh

/**
 * Registers an agreement announced by a factory `AgreementCreated` event. The address comes from an
 * indexed log emitted by the configured factory, never from a client request or a transaction hash.
 */
export async function discoverAgreement(ctx: AppContext, ev: DecodedEvent): Promise<AgreementRow | undefined> {
  const factory = ctx.config.chain.factory?.toLowerCase();
  if (!factory || ev.address.toLowerCase() !== factory || ev.eventName !== "AgreementCreated") return undefined;

  const address = String(ev.args.agreementAddress).toLowerCase() as Address;
  const existing = findAgreement(ctx, address);
  if (existing) return existing;

  const imm = await ctx.chain.readAgreementImmutable(address, ev.blockNumber);
  if (String(ev.args.payer).toLowerCase() !== imm.payer.toLowerCase()) {
    ctx.log.warn("Ignoring AgreementCreated: payer in event does not match the contract", { address });
    return undefined;
  }

  const draft = get<{ id: string }>(
    ctx.db,
    // The match is by the exact bytes' hash and the payer, so a draft may serve several agreements that commit to the same public
    // metadata (for example the same funder creating the same project twice). Restricting it to one agreement left the second unnamed.
    `SELECT id FROM agreement_drafts WHERE metadata_hash = ? AND owner = ?
     ORDER BY created_at DESC LIMIT 1`,
    imm.metadataHash.toLowerCase(),
    imm.payer.toLowerCase()
  );

  tx(ctx.db, () => {
    run(
      ctx.db,
      `INSERT OR IGNORE INTO agreement_cache (
         address, chain_id, factory, factory_id, created_block, created_tx, payer, community_signer, verifier_signer,
         token, project_ref_hash, metadata_hash, methodology_hash, payee_community, payee_monitoring, community_bps,
         milestone_amount_0, milestone_amount_1, total_budget, funding_deadline, execution_deadline, demo_mode,
         terms_hash, draft_id, state_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      address,
      ctx.chain.chainId,
      factory,
      Number(ev.args.id),
      Number(ev.blockNumber),
      ev.txHash.toLowerCase(),
      imm.payer.toLowerCase(),
      imm.communitySigner.toLowerCase(),
      imm.verifierSigner.toLowerCase(),
      imm.token.toLowerCase(),
      imm.projectRefHash.toLowerCase(),
      imm.metadataHash.toLowerCase(),
      imm.methodologyHash.toLowerCase(),
      imm.payeeCommunity.toLowerCase(),
      imm.payeeMonitoring.toLowerCase(),
      Number(imm.communityBps),
      imm.milestoneAmounts[0].toString(),
      imm.milestoneAmounts[1].toString(),
      imm.totalBudget.toString(),
      Number(imm.fundingDeadline),
      Number(imm.executionDeadline),
      imm.demoMode ? 1 : 0,
      imm.termsHash.toLowerCase(),
      draft?.id ?? null,
      ctx.now()
    );
    if (draft) run(ctx.db, "UPDATE agreement_drafts SET matched_agreement = ? WHERE id = ? AND matched_agreement IS NULL", address, draft.id);
  });

  return refreshAgreementState(ctx, address);
}

/** Reads the mutable state from the chain (one consistent block) and updates the cache row. */
export async function refreshAgreementState(ctx: AppContext, address: string): Promise<AgreementRow> {
  const row = requireAgreement(ctx, address);
  const s = await ctx.chain.readAgreementState(row.address as Address);
  const status = statusOf(
    {
      ...row,
      funded: s.funded ? 1 : 0,
      refunded: s.refunded ? 1 : 0,
      community_accepted: s.communityAccepted ? 1 : 0,
      verifier_accepted: s.verifierAccepted ? 1 : 0,
      next_milestone_id: Number(s.nextMilestoneId),
      total_paid: s.totalPaid.toString(),
    },
    s.blockTimestamp
  );
  run(
    ctx.db,
    `UPDATE agreement_cache SET community_accepted = ?, verifier_accepted = ?, funded = ?, funded_at = ?, refunded = ?,
       total_paid = ?, next_milestone_id = ?, nonce_0 = ?, nonce_1 = ?, status = ?, state_block = ?, state_at = ?
     WHERE address = ?`,
    s.communityAccepted ? 1 : 0,
    s.verifierAccepted ? 1 : 0,
    s.funded ? 1 : 0,
    Number(s.fundedAt),
    s.refunded ? 1 : 0,
    s.totalPaid.toString(),
    Number(s.nextMilestoneId),
    Number(s.nonces[0]),
    Number(s.nonces[1]),
    status,
    Number(s.blockNumber),
    ctx.now(),
    row.address
  );
  return requireAgreement(ctx, address);
}

// ---------------------------------------------------------------- listing

export interface Freshness {
  lastIndexedBlock: number;
  headBlock: number;
  syncing: boolean;
  updatedAt: string | null;
}

export function getFreshness(ctx: AppContext): Freshness {
  const val = (k: string) => get<{ value: string }>(ctx.db, "SELECT value FROM indexer_state WHERE key = ?", k)?.value;
  const cursor = Number(val("cursor") ?? 0);
  const head = Number(val("head") ?? 0);
  const at = val("updated_at");
  return {
    lastIndexedBlock: cursor,
    headBlock: head,
    syncing: head - cursor > ctx.config.indexer.confirmations,
    updatedAt: at ? new Date(Number(at)).toISOString() : null,
  };
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

export interface AgreementSummaryDto {
  address: string;
  projectName: string;
  demo: boolean;
  status: AgreementStatus;
  totalBudget: string;
  totalPaid: string;
  fundingDeadline: string;
  executionDeadline: string;
  funder: string;
  communitySigner: string;
  verifierSigner: string;
  freshness: Freshness;
}

export function toSummary(ctx: AppContext, row: AgreementRow, freshness = getFreshness(ctx)): AgreementSummaryDto {
  const meta = loadMetadata(ctx, row);
  return {
    address: row.address,
    projectName: meta?.meta.name ?? "Unnamed agreement",
    demo: row.demo_mode === 1,
    status: statusOf(row, BigInt(Math.floor(ctx.now() / 1000))),
    totalBudget: row.total_budget,
    totalPaid: row.total_paid,
    fundingDeadline: iso(row.funding_deadline),
    executionDeadline: iso(row.execution_deadline),
    funder: row.payer,
    communitySigner: row.community_signer,
    verifierSigner: row.verifier_signer,
    freshness,
  };
}

export interface ListFilter {
  status?: AgreementStatus;
  demo?: boolean;
  q?: string;
  wallet?: string;
  mine?: boolean;
  page: number;
  pageSize: number;
}

export function listAgreements(ctx: AppContext, f: ListFilter): { items: AgreementSummaryDto[]; total: number } {
  const rows = all<AgreementRow>(ctx.db, "SELECT * FROM agreement_cache ORDER BY factory_id DESC");
  const freshness = getFreshness(ctx);
  const q = f.q?.trim().toLowerCase();
  const wallet = f.wallet?.toLowerCase();
  const items = rows
    .filter((r) => !f.mine || (wallet && roleOf(r, wallet) !== "OBSERVER"))
    .map((r) => toSummary(ctx, r, freshness))
    .filter(
      (s) =>
        (!f.status || s.status === f.status) &&
        (f.demo === undefined || s.demo === f.demo) &&
        (!q || s.projectName.toLowerCase().includes(q) || s.address.includes(q))
    );
  const start = (f.page - 1) * f.pageSize;
  return { items: items.slice(start, start + f.pageSize), total: items.length };
}

export { iso as isoFromSeconds };
