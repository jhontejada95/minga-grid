import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "@minga/shared";
import type { AppContext } from "./context.js";
import { all, get, run, tx } from "./db.js";
import { badRequest, conflict, forbidden, ApiError } from "./errors.js";
import { loadMetadata, requirementsOf, roleOf, type AgreementRow } from "./agreements.js";

const EXTENSION_MIME: Record<string, string> = {
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
};
/** MIME types a client may claim. The stored type is always derived from the extension. */
const CLAIMABLE_MIME = new Set([...Object.values(EXTENSION_MIME), "application/octet-stream", ""]);
const REQUIREMENT_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export interface EvidenceFileRow {
  id: string;
  agreement: string;
  uploader: string;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size: number;
  sha256: string;
  created_at: number;
}

export interface ManifestRow {
  id: string;
  agreement: string;
  milestone_id: number;
  version: number;
  manifest_text: string;
  evidence_hash: string;
  mode: string;
  created_by: string;
  created_at: number;
}

export interface EvidenceFileDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  uploader: string;
}

export const fileToDto = (r: EvidenceFileRow): EvidenceFileDto => ({
  id: r.id,
  fileName: r.file_name,
  mimeType: r.mime_type,
  size: r.size,
  sha256: r.sha256,
  uploadedAt: new Date(r.created_at).toISOString(),
  uploader: r.uploader,
});

/** Removes any directory part and unsafe characters. Never used to build a filesystem path. */
export function sanitizeFileName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? "";
  const cleaned = last
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w .()\-+]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

const sha256Hex = (bytes: Uint8Array) => `0x${crypto.createHash("sha256").update(bytes).digest("hex")}`;

function evidenceDir(ctx: AppContext, address: string): string {
  const base = path.resolve(ctx.config.evidencePath);
  const dir = path.resolve(base, address);
  if (!dir.startsWith(base + path.sep)) throw new ApiError(500, "STORAGE_PATH", "Invalid storage path.");
  return dir;
}

function looksExecutable(bytes: Uint8Array): boolean {
  const b0 = bytes[0], b1 = bytes[1];
  return (
    (b0 === 0x4d && b1 === 0x5a) || // MZ (Windows PE)
    (b0 === 0x7f && b1 === 0x45) || // ELF
    (b0 === 0x23 && b1 === 0x21) || // shebang
    (b0 === 0xca && b1 === 0xfe) || // Mach-O / Java class
    (b0 === 0x50 && b1 === 0x4b) // ZIP container
  );
}

export interface UploadInput {
  wallet: string;
  fileName: string;
  claimedMime: string;
  bytes: Uint8Array;
}

/** Stores one text/JSON evidence file. Only the agreement's community representative may upload. */
export function saveEvidenceFile(ctx: AppContext, row: AgreementRow, input: UploadInput): EvidenceFileDto {
  if (roleOf(row, input.wallet) !== "COMMUNITY") {
    throw forbidden("NOT_COMMUNITY_REPRESENTATIVE", "Only the community representative of this agreement can upload evidence.");
  }
  if (row.refunded === 1) throw conflict("AGREEMENT_REFUNDED", "This agreement was refunded; evidence can no longer be added.");

  const { bytes } = input;
  if (bytes.length === 0) throw badRequest("EMPTY_FILE", "The file is empty.");
  if (bytes.length > ctx.config.evidence.maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", `Files are limited to ${ctx.config.evidence.maxBytes} bytes.`);
  }
  const count = get<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM evidence_files WHERE agreement = ?", row.address)?.n ?? 0;
  if (count >= ctx.config.evidence.maxFilesPerAgreement) {
    throw conflict("TOO_MANY_FILES", "This agreement reached its evidence file limit.");
  }

  const fileName = sanitizeFileName(input.fileName);
  const ext = path.extname(fileName).toLowerCase();
  const mime = EXTENSION_MIME[ext];
  if (!mime) throw badRequest("UNSUPPORTED_FILE_TYPE", "Only .json, .txt, .md and .csv text files are accepted.");
  if (!CLAIMABLE_MIME.has(input.claimedMime.split(";")[0]?.trim().toLowerCase() ?? "")) {
    throw badRequest("UNSUPPORTED_FILE_TYPE", "Only text or JSON content is accepted.");
  }
  if (looksExecutable(bytes)) throw badRequest("UNSUPPORTED_FILE_TYPE", "Executable or archive content is not accepted.");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw badRequest("NOT_UTF8", "The file must be valid UTF-8 text.");
  }
  if (text.includes("\u0000")) throw badRequest("NOT_TEXT", "The file contains binary data.");
  if (ext === ".json") {
    try {
      JSON.parse(text);
    } catch {
      throw badRequest("INVALID_JSON", "The .json file is not valid JSON.");
    }
  }

  const id = crypto.randomUUID();
  const storageKey = crypto.randomUUID();
  const dir = evidenceDir(ctx, row.address);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, storageKey);
  fs.writeFileSync(filePath, bytes, { flag: "wx" });

  const createdAt = ctx.now();
  const sha256 = sha256Hex(bytes);
  try {
    run(
      ctx.db,
      `INSERT INTO evidence_files (id, agreement, uploader, file_name, storage_key, mime_type, size, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, row.address, input.wallet.toLowerCase(), fileName, storageKey, mime, bytes.length, sha256, createdAt
    );
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    throw err;
  }
  return fileToDto({
    id, agreement: row.address, uploader: input.wallet.toLowerCase(), file_name: fileName, storage_key: storageKey,
    mime_type: mime, size: bytes.length, sha256, created_at: createdAt,
  });
}

export function findFile(ctx: AppContext, id: string): EvidenceFileRow | undefined {
  return get<EvidenceFileRow>(ctx.db, "SELECT * FROM evidence_files WHERE id = ?", id);
}

/** Reads the stored bytes and re-verifies their SHA-256 before returning them. */
export function readFileBytes(ctx: AppContext, row: EvidenceFileRow): Uint8Array {
  const filePath = path.join(evidenceDir(ctx, row.agreement), row.storage_key);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch {
    throw new ApiError(500, "EVIDENCE_MISSING", "The stored evidence file could not be read.");
  }
  if (sha256Hex(bytes) !== row.sha256) {
    throw new ApiError(500, "EVIDENCE_INTEGRITY", "The stored evidence file does not match its recorded hash.");
  }
  return bytes;
}

export function listFiles(ctx: AppContext, address: string): EvidenceFileDto[] {
  return all<EvidenceFileRow>(ctx.db, "SELECT * FROM evidence_files WHERE agreement = ? ORDER BY created_at, id", address).map(fileToDto);
}

// ---------------------------------------------------------------- manifests

export interface ManifestFileInput {
  fileId: string;
  requirementKey?: string;
}

export interface CreateManifestInput {
  wallet: string;
  milestoneId: 0 | 1;
  files: ManifestFileInput[];
  declaredDate?: string;
  description?: string;
}

export interface ManifestDto {
  id: string;
  version: number;
  evidenceHash: string;
  createdAt: string;
  createdBy: string;
  mode: string;
  manifestText: string;
  files: EvidenceFileDto[];
  requirementKeys: string[];
  current: boolean;
}

export function manifestRequirementKeys(manifestText: string): string[] {
  try {
    const m = JSON.parse(manifestText) as { files?: { requirementKey?: string }[] };
    return [...new Set((m.files ?? []).map((f) => f.requirementKey).filter((k): k is string => !!k))];
  } catch {
    return [];
  }
}

function manifestToDto(ctx: AppContext, r: ManifestRow, current: boolean): ManifestDto {
  const parsed = JSON.parse(r.manifest_text) as { files?: { fileId: string }[] };
  const files = (parsed.files ?? [])
    .map((f) => findFile(ctx, f.fileId))
    .filter((f): f is EvidenceFileRow => !!f)
    .map(fileToDto);
  return {
    id: r.id,
    version: r.version,
    evidenceHash: r.evidence_hash,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    mode: r.mode,
    manifestText: r.manifest_text,
    files,
    requirementKeys: manifestRequirementKeys(r.manifest_text),
    current,
  };
}

/**
 * Freezes a set of already-uploaded files into an immutable manifest. The exact canonical JSON that was
 * hashed is stored and returned. Identical content yields the identical hash and returns the existing
 * version instead of creating a duplicate.
 */
export function createManifest(ctx: AppContext, row: AgreementRow, input: CreateManifestInput): { manifest: ManifestDto; created: boolean } {
  if (roleOf(row, input.wallet) !== "COMMUNITY") {
    throw forbidden("NOT_COMMUNITY_REPRESENTATIVE", "Only the community representative of this agreement can create evidence versions.");
  }
  if (row.refunded === 1) throw conflict("AGREEMENT_REFUNDED", "This agreement was refunded.");
  if (row.next_milestone_id > input.milestoneId) throw conflict("MILESTONE_ALREADY_PAID", "This milestone was already paid.");
  if (input.files.length < 1 || input.files.length > 50) throw badRequest("INVALID_FILE_SET", "Select between 1 and 50 files.");

  const meta = loadMetadata(ctx, row);
  const allowedKeys = meta ? new Set(requirementsOf(meta.meta, input.milestoneId).map((r) => r.key)) : undefined;

  const seen = new Set<string>();
  const entries = input.files.map((f) => {
    if (seen.has(f.fileId)) throw badRequest("DUPLICATE_FILE", "A file was selected twice.");
    seen.add(f.fileId);
    const file = findFile(ctx, f.fileId);
    if (!file || file.agreement !== row.address) throw badRequest("UNKNOWN_FILE", "A selected file does not belong to this agreement.");
    if (f.requirementKey !== undefined) {
      if (!REQUIREMENT_KEY_RE.test(f.requirementKey)) throw badRequest("INVALID_REQUIREMENT_KEY", "Invalid requirement key.");
      if (allowedKeys && !allowedKeys.has(f.requirementKey)) {
        throw badRequest("UNKNOWN_REQUIREMENT", `"${f.requirementKey}" is not a required item of this milestone.`);
      }
    }
    // Re-verify the bytes on disk so the manifest never commits to a corrupted or swapped file.
    const bytes = readFileBytes(ctx, file);
    if (sha256Hex(bytes) !== file.sha256) throw new ApiError(500, "EVIDENCE_INTEGRITY", "A file does not match its recorded hash.");
    return {
      fileId: file.id,
      requirementKey: f.requirementKey ?? null,
      fileName: file.file_name,
      sha256: file.sha256,
      mimeType: file.mime_type,
      size: file.size,
    };
  });
  entries.sort((a, b) => (a.requirementKey ?? "").localeCompare(b.requirementKey ?? "") || a.fileName.localeCompare(b.fileName) || a.fileId.localeCompare(b.fileId));

  const provided = new Set(entries.map((e) => e.requirementKey).filter((k): k is string => !!k));
  const required = meta ? requirementsOf(meta.meta, input.milestoneId).map((r) => r.key) : [];
  const description = (input.description ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);

  const manifest: Record<string, unknown> = {
    manifestVersion: "1.0",
    chainId: ctx.chain.chainId,
    agreementAddress: row.address,
    milestoneId: input.milestoneId,
    mode: row.demo_mode === 1 ? "DEMO" : "PRODUCTION",
    hashAlgorithm: "sha256",
    description,
    files: entries,
    unfulfilledRequirements: required.filter((k) => !provided.has(k)),
  };
  if (input.declaredDate) {
    if (Number.isNaN(Date.parse(input.declaredDate))) throw badRequest("INVALID_DATE", "declaredDate must be an ISO 8601 date.");
    manifest.declaredDate = new Date(input.declaredDate).toISOString();
  }

  const { text, hash } = canonicalize(manifest);
  return tx(ctx.db, () => {
    const existing = get<ManifestRow>(
      ctx.db,
      "SELECT * FROM evidence_manifests WHERE agreement = ? AND milestone_id = ? AND evidence_hash = ?",
      row.address, input.milestoneId, hash
    );
    if (existing) return { manifest: manifestToDto(ctx, existing, isLatest(ctx, existing)), created: false };

    const version = (get<{ v: number | null }>(
      ctx.db,
      "SELECT MAX(version) AS v FROM evidence_manifests WHERE agreement = ? AND milestone_id = ?",
      row.address, input.milestoneId
    )?.v ?? 0) + 1;
    const id = crypto.randomUUID();
    const createdAt = ctx.now();
    run(
      ctx.db,
      `INSERT INTO evidence_manifests (id, agreement, milestone_id, version, manifest_text, evidence_hash, mode, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, row.address, input.milestoneId, version, text, hash, manifest.mode as string, input.wallet.toLowerCase(), createdAt
    );
    const created: ManifestRow = {
      id, agreement: row.address, milestone_id: input.milestoneId, version, manifest_text: text, evidence_hash: hash,
      mode: manifest.mode as string, created_by: input.wallet.toLowerCase(), created_at: createdAt,
    };
    return { manifest: manifestToDto(ctx, created, true), created: true };
  });
}

function isLatest(ctx: AppContext, r: ManifestRow): boolean {
  const max = get<{ v: number }>(
    ctx.db,
    "SELECT MAX(version) AS v FROM evidence_manifests WHERE agreement = ? AND milestone_id = ?",
    r.agreement, r.milestone_id
  )?.v;
  return max === r.version;
}

export function listManifests(ctx: AppContext, address: string, milestoneId: number): ManifestDto[] {
  const rows = all<ManifestRow>(
    ctx.db,
    "SELECT * FROM evidence_manifests WHERE agreement = ? AND milestone_id = ? ORDER BY version DESC",
    address, milestoneId
  );
  return rows.map((r, i) => manifestToDto(ctx, r, i === 0));
}

export function findManifestByHash(ctx: AppContext, address: string, milestoneId: number, hash: string): ManifestRow | undefined {
  return get<ManifestRow>(
    ctx.db,
    "SELECT * FROM evidence_manifests WHERE agreement = ? AND milestone_id = ? AND evidence_hash = ?",
    address, milestoneId, hash.toLowerCase()
  );
}

export function latestManifest(ctx: AppContext, address: string, milestoneId: number): ManifestRow | undefined {
  return get<ManifestRow>(
    ctx.db,
    "SELECT * FROM evidence_manifests WHERE agreement = ? AND milestone_id = ? ORDER BY version DESC LIMIT 1",
    address, milestoneId
  );
}
