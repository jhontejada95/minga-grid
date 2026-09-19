import crypto from "node:crypto";
import type { AppContext } from "./context.js";
import { all, get, run } from "./db.js";
import { conflict, forbidden, notFound } from "./errors.js";
import { isParticipant, loadMetadata, requirementsOf, roleOf, type AgreementRow, type LoadedMetadata } from "./agreements.js";
import { findFile, findManifestByHash, readFileBytes, type ManifestRow } from "./evidence.js";
import { listResearchRuns, MPP_UNAVAILABLE_TEXT, runBoundedResearch, type ResearchRunDto } from "./mpp.js";
import { analyzeManifest, type AiFile } from "./ai.js";

const MAX_AI_ATTEMPTS = 3;

export interface ReviewFinding {
  message: string;
  fileId?: string;
  supportingExcerpt?: string;
  source: "deterministic" | "model";
  /** For model findings: true only when the quoted excerpt was found literally in the file. Otherwise it is uncertain. */
  supported?: boolean;
}

interface AiBlock {
  status: "NOT_CONFIGURED" | "SKIPPED" | "COMPLETED" | "FAILED";
  provider?: string;
  model?: string;
  summary?: string;
  reason?: string;
  attempts: number;
  discardedObservations?: number;
}

interface StoredResult {
  missingRequirements: string[];
  findings: ReviewFinding[];
  evidenceReferences: string[];
  externalResearch: ReviewDto["externalResearch"];
  baseLimitations: string[];
  ai: AiBlock;
}

export interface ReviewDto {
  id: string;
  agreement: string;
  milestoneId: number;
  manifestHash: string;
  status: "INCOMPLETE" | "READY_FOR_HUMAN_REVIEW" | "UNAVAILABLE";
  missingRequirements: string[];
  findings: ReviewFinding[];
  evidenceReferences: string[];
  externalResearch: {
    status: string;
    provider?: string;
    spendUsd?: string;
    runs?: number;
    sourceReferences?: string[];
    reason?: string;
  };
  ai: AiBlock;
  limitations: string[];
  mode: "MODEL_ASSISTED" | "DETERMINISTIC_ONLY";
  createdAt: string;
  research: ResearchRunDto[];
}

interface ReviewRow {
  id: string;
  agreement: string;
  milestone_id: number;
  manifest_hash: string;
  status: ReviewDto["status"];
  result_json: string;
  mode: ReviewDto["mode"];
  created_at: number;
}

const BASE_LIMITATIONS = [
  "This review is advisory. It does not certify ecological outcomes, carbon, biodiversity or land rights.",
  "The contract never reads documents. Payment requires both human signatures.",
];

function aiLimitation(ai: AiBlock): string {
  switch (ai.status) {
    case "COMPLETED":
      return `Model observations were produced by ${ai.provider ?? "an AI provider"} (${ai.model ?? "unknown model"}), are advisory and may be wrong. Only observations with a verified excerpt point to text that exists in a file.`;
    case "FAILED":
      return `AI review unavailable — ${ai.reason ?? "the provider failed"}. Document checks only.`;
    case "SKIPPED":
      return "Model-assisted review was skipped for this package. Document checks only.";
    default:
      return ai.reason && ai.reason !== "AI provider not connected."
        ? `Document checks only — AI provider not connected. (${ai.reason})`
        : "Document checks only — AI provider not connected.";
  }
}

function toDto(ctx: AppContext, r: ReviewRow): ReviewDto {
  const s = JSON.parse(r.result_json) as StoredResult;
  return {
    id: r.id,
    agreement: r.agreement,
    milestoneId: r.milestone_id,
    manifestHash: r.manifest_hash,
    status: r.status,
    mode: r.mode,
    createdAt: new Date(r.created_at).toISOString(),
    missingRequirements: s.missingRequirements,
    findings: s.findings,
    evidenceReferences: s.evidenceReferences,
    externalResearch: s.externalResearch,
    ai: s.ai,
    limitations: [...s.baseLimitations, aiLimitation(s.ai)],
    research: listResearchRuns(ctx, r.agreement, r.milestone_id).filter((x) => x.manifestHash === r.manifest_hash),
  };
}

export function findReview(ctx: AppContext, agreement: string, milestoneId: number, manifestHash: string): ReviewDto | undefined {
  const r = get<ReviewRow>(
    ctx.db,
    "SELECT * FROM reviews WHERE agreement = ? AND milestone_id = ? AND manifest_hash = ?",
    agreement, milestoneId, manifestHash.toLowerCase()
  );
  return r ? toDto(ctx, r) : undefined;
}

export function listReviews(ctx: AppContext, agreement: string, milestoneId: number): ReviewDto[] {
  return all<ReviewRow>(
    ctx.db,
    "SELECT * FROM reviews WHERE agreement = ? AND milestone_id = ? ORDER BY created_at DESC",
    agreement, milestoneId
  ).map((r) => toDto(ctx, r));
}

type ManifestFile = { fileId: string; requirementKey: string | null; fileName: string; sha256: string };

/** Runs the model over the stored files. Text is read from disk after its hash is re-verified. */
async function runAiPart(ctx: AppContext, meta: LoadedMetadata | null, manifest: ManifestRow, files: ManifestFile[], milestoneId: 0 | 1, previous: AiBlock): Promise<{ block: AiBlock; findings: ReviewFinding[] }> {
  const { ai } = ctx.config;
  if (!ai.enabled) {
    return { block: { status: "NOT_CONFIGURED", provider: ai.provider === "none" ? undefined : ai.provider, reason: ai.disabledReason, attempts: 0 }, findings: [] };
  }
  const aiFiles: AiFile[] = [];
  for (const f of files) {
    const row = findFile(ctx, f.fileId);
    if (!row) continue;
    try {
      aiFiles.push({ fileId: f.fileId, fileName: f.fileName, requirementKey: f.requirementKey, text: new TextDecoder().decode(readFileBytes(ctx, row)) });
    } catch {
      // A file that fails its integrity check is already reported by the deterministic pass.
    }
  }
  if (aiFiles.length === 0) return { block: { status: "SKIPPED", provider: ai.provider, attempts: previous.attempts }, findings: [] };

  const result = await analyzeManifest(ctx, {
    projectName: meta?.meta.name ?? "Unnamed project",
    milestoneTitle: meta?.meta.milestones[milestoneId].title ?? `Milestone ${milestoneId + 1}`,
    requirements: meta ? requirementsOf(meta.meta, milestoneId) : [],
    files: aiFiles,
  });
  const attempts = previous.attempts + 1;
  if (!result.ok) return { block: { status: "FAILED", provider: ai.provider, model: ai.model, reason: result.reason, attempts }, findings: [] };

  const findings: ReviewFinding[] = result.observations.map((o) => ({
    message: o.supported ? o.message : `${o.message} (uncertain: no verified excerpt)`,
    fileId: o.fileId,
    supportingExcerpt: o.supportingExcerpt,
    source: "model",
    supported: o.supported,
  }));
  void manifest;
  return {
    block: { status: "COMPLETED", provider: ai.provider, model: result.model, summary: result.summary || undefined, attempts, discardedObservations: result.discarded },
    findings,
  };
}

/**
 * Document check of a STORED manifest against the agreed checklist, optionally enriched by a language model and
 * bounded paid research. Uploaded text is data: it never selects tools, URLs, amounts, budgets or recipients, and any
 * research query is built from trusted metadata only. One review exists per manifest; repeating the request returns it
 * (and only re-attempts a FAILED model call, at most three times) and never repeats a paid action.
 */
export async function requestReview(
  ctx: AppContext,
  row: AgreementRow,
  milestoneId: 0 | 1,
  wallet: string,
  manifestHash: string
): Promise<{ review: ReviewDto; created: boolean }> {
  if (!isParticipant(roleOf(row, wallet))) {
    throw forbidden("NOT_A_PARTICIPANT", "Only participants of this agreement can request a review.");
  }
  const manifest: ManifestRow | undefined = findManifestByHash(ctx, row.address, milestoneId, manifestHash);
  if (!manifest) throw notFound("MANIFEST_NOT_FOUND", "No evidence version with that hash exists for this milestone.");

  const meta = loadMetadata(ctx, row);
  const manifestFiles = (JSON.parse(manifest.manifest_text) as { files: ManifestFile[] }).files;

  const existingRow = get<ReviewRow>(
    ctx.db, "SELECT * FROM reviews WHERE agreement = ? AND milestone_id = ? AND manifest_hash = ?",
    row.address, milestoneId, manifest.evidence_hash
  );
  if (existingRow) {
    const stored = JSON.parse(existingRow.result_json) as StoredResult;
    const retry = stored.ai.status === "FAILED" && stored.ai.attempts < MAX_AI_ATTEMPTS && ctx.config.ai.enabled;
    if (!retry) return { review: toDto(ctx, existingRow), created: false };
    const { block, findings } = await runAiPart(ctx, meta, manifest, manifestFiles, milestoneId, stored.ai);
    stored.findings = [...stored.findings.filter((f) => f.source !== "model"), ...findings];
    stored.ai = block;
    run(ctx.db, "UPDATE reviews SET result_json = ?, mode = ? WHERE id = ?", JSON.stringify(stored), block.status === "COMPLETED" ? "MODEL_ASSISTED" : "DETERMINISTIC_ONLY", existingRow.id);
    return { review: toDto(ctx, get<ReviewRow>(ctx.db, "SELECT * FROM reviews WHERE id = ?", existingRow.id)!), created: false };
  }
  if (row.refunded === 1) throw conflict("AGREEMENT_REFUNDED", "This agreement was refunded.");

  const findings: ReviewFinding[] = [];
  const evidenceReferences: string[] = [];
  const baseLimitations = [...BASE_LIMITATIONS];

  // 1) Integrity: every file in the manifest must still match its committed hash.
  for (const f of manifestFiles) {
    const file = findFile(ctx, f.fileId);
    if (!file) {
      findings.push({ message: `File "${f.fileName}" is listed in the manifest but is no longer stored.`, fileId: f.fileId, source: "deterministic" });
      continue;
    }
    try {
      readFileBytes(ctx, file);
      evidenceReferences.push(`${f.fileName} (${f.sha256.slice(0, 12)}…)`);
    } catch {
      findings.push({ message: `File "${f.fileName}" does not match the hash committed in the manifest.`, fileId: f.fileId, source: "deterministic" });
    }
  }

  // 2) Completeness against the agreed checklist (recomputed here, never trusted from the manifest).
  let missing: string[] = [];
  let status: ReviewDto["status"];
  if (!meta) {
    status = "UNAVAILABLE";
    baseLimitations.push("The agreed checklist is unavailable: no public metadata document is linked to this agreement.");
  } else {
    const required = requirementsOf(meta.meta, milestoneId);
    const provided = new Map<string, { fileId: string; fileName: string }>();
    for (const f of manifestFiles) if (f.requirementKey && !provided.has(f.requirementKey)) provided.set(f.requirementKey, f);
    missing = required.filter((r) => !provided.has(r.key)).map((r) => r.key);
    for (const r of required) {
      const hit = provided.get(r.key);
      findings.push(
        hit
          ? { message: `Requirement "${r.key}" is covered by "${hit.fileName}". Presence and hash were checked; the content was not judged.`, fileId: hit.fileId, source: "deterministic" }
          : { message: `Missing required evidence: "${r.key}".`, source: "deterministic" }
      );
    }
    if (!meta.hashVerified) baseLimitations.push("The stored metadata does not hash to the value committed on-chain; treat the checklist as unverified.");
    const broken = findings.some((f) => /does not match|no longer stored/.test(f.message));
    status = missing.length > 0 || broken ? "INCOMPLETE" : "READY_FOR_HUMAN_REVIEW";
  }

  const reviewId = crypto.randomUUID();
  const result: StoredResult = {
    missingRequirements: missing,
    findings,
    evidenceReferences,
    externalResearch: { status: "SKIPPED", reason: "Not attempted." },
    baseLimitations,
    ai: { status: "NOT_CONFIGURED", attempts: 0 },
  };
  try {
    run(
      ctx.db,
      `INSERT INTO reviews (id, agreement, milestone_id, manifest_hash, status, result_json, mode, requested_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DETERMINISTIC_ONLY', ?, ?)`,
      reviewId, row.address, milestoneId, manifest.evidence_hash, status, JSON.stringify(result), wallet.toLowerCase(), ctx.now()
    );
  } catch (err) {
    // A concurrent request created it first: return that one instead of failing.
    const again = findReview(ctx, row.address, milestoneId, manifest.evidence_hash);
    if (again) return { review: again, created: false };
    throw err;
  }

  // 3) Optional model observations (never for an unavailable checklist).
  if (status !== "UNAVAILABLE") {
    const { block, findings: modelFindings } = await runAiPart(ctx, meta, manifest, manifestFiles, milestoneId, result.ai);
    result.ai = block;
    result.findings.push(...modelFindings);
  } else {
    result.ai = { status: "SKIPPED", provider: ctx.config.ai.provider === "none" ? undefined : ctx.config.ai.provider, attempts: 0 };
  }

  // 4) Optional bounded paid research, only for a complete package and only from trusted metadata.
  if (status !== "READY_FOR_HUMAN_REVIEW" || !meta) {
    result.externalResearch = { status: "SKIPPED", reason: status === "INCOMPLETE" ? "Skipped: required evidence is missing." : "Skipped: no agreed checklist is available." };
  } else if (!ctx.config.mpp.enabled || !ctx.payments) {
    result.externalResearch = {
      status: "UNAVAILABLE",
      reason: ctx.config.mpp.disabledReason ? `${MPP_UNAVAILABLE_TEXT} (${ctx.config.mpp.disabledReason})` : MPP_UNAVAILABLE_TEXT,
    };
  } else {
    const where = [meta.meta.name, meta.meta.location?.region, meta.meta.location?.country].filter(Boolean).join(" ");
    const research = await runBoundedResearch(ctx, {
      agreement: row.address,
      milestoneId,
      manifestHash: manifest.evidence_hash,
      reviewId,
      endpoint: "/api/search",
      objective: `Look for public information consistent with the agreed project "${meta.meta.name}". Advisory only.`,
      body: { query: `${where} conservation restoration project public information`.slice(0, 280) },
    });
    result.externalResearch = {
      status: research.status,
      provider: "Parallel MPP",
      spendUsd: research.spendUsd,
      runs: research.runId ? 1 : 0,
      sourceReferences: research.sourceReferences,
      reason: research.reason,
    };
  }
  run(ctx.db, "UPDATE reviews SET result_json = ?, mode = ? WHERE id = ?", JSON.stringify(result), result.ai.status === "COMPLETED" ? "MODEL_ASSISTED" : "DETERMINISTIC_ONLY", reviewId);

  return { review: toDto(ctx, get<ReviewRow>(ctx.db, "SELECT * FROM reviews WHERE id = ?", reviewId)!), created: true };
}
