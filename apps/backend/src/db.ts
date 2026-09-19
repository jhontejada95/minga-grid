import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Db = DatabaseSync;
export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, SqlValue>;

/** Opens (creating directories as needed) a SQLite database and applies the pragmas we rely on. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  return db;
}

export function get<T = Row>(db: Db, sql: string, ...params: SqlValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T = Row>(db: Db, sql: string, ...params: SqlValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: Db, sql: string, ...params: SqlValue[]): { changes: number } {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes) };
}

/** Runs `fn` inside BEGIN IMMEDIATE ... COMMIT (ROLLBACK on error). Synchronous on purpose. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
CREATE TABLE auth_challenges (
  nonce TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  uri TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  wallet TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE agreement_drafts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  metadata_text TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  proposed_params_json TEXT,
  matched_agreement TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_drafts_match ON agreement_drafts(metadata_hash, owner);

CREATE TABLE agreement_cache (
  address TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  factory TEXT NOT NULL,
  factory_id INTEGER NOT NULL,
  created_block INTEGER NOT NULL,
  created_tx TEXT NOT NULL,
  payer TEXT NOT NULL,
  community_signer TEXT NOT NULL,
  verifier_signer TEXT NOT NULL,
  token TEXT NOT NULL,
  project_ref_hash TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  methodology_hash TEXT NOT NULL,
  payee_community TEXT NOT NULL,
  payee_monitoring TEXT NOT NULL,
  community_bps INTEGER NOT NULL,
  milestone_amount_0 TEXT NOT NULL,
  milestone_amount_1 TEXT NOT NULL,
  total_budget TEXT NOT NULL,
  funding_deadline INTEGER NOT NULL,
  execution_deadline INTEGER NOT NULL,
  demo_mode INTEGER NOT NULL,
  terms_hash TEXT NOT NULL,
  community_accepted INTEGER NOT NULL DEFAULT 0,
  verifier_accepted INTEGER NOT NULL DEFAULT 0,
  funded INTEGER NOT NULL DEFAULT 0,
  funded_at INTEGER NOT NULL DEFAULT 0,
  refunded INTEGER NOT NULL DEFAULT 0,
  total_paid TEXT NOT NULL DEFAULT '0',
  next_milestone_id INTEGER NOT NULL DEFAULT 0,
  nonce_0 INTEGER NOT NULL DEFAULT 0,
  nonce_1 INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AWAITING_ACCEPTANCE',
  draft_id TEXT,
  state_block INTEGER NOT NULL DEFAULT 0,
  state_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chain_id, factory, factory_id)
);
CREATE INDEX idx_agreements_payer ON agreement_cache(payer);
CREATE INDEX idx_agreements_community ON agreement_cache(community_signer);
CREATE INDEX idx_agreements_verifier ON agreement_cache(verifier_signer);

CREATE TABLE evidence_files (
  id TEXT PRIMARY KEY,
  agreement TEXT NOT NULL REFERENCES agreement_cache(address),
  uploader TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_files_agreement ON evidence_files(agreement);

CREATE TABLE evidence_manifests (
  id TEXT PRIMARY KEY,
  agreement TEXT NOT NULL REFERENCES agreement_cache(address),
  milestone_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  manifest_text TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (agreement, milestone_id, version),
  UNIQUE (agreement, milestone_id, evidence_hash)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  agreement TEXT NOT NULL REFERENCES agreement_cache(address),
  milestone_id INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL,
  mode TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (agreement, milestone_id, manifest_hash)
);

CREATE TABLE external_research_runs (
  id TEXT PRIMARY KEY,
  agreement TEXT NOT NULL,
  milestone_id INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  objective TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  url_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_method TEXT,
  authorized_micro_usd INTEGER NOT NULL DEFAULT 0,
  actual_micro_usd INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  challenge_reference TEXT,
  receipt_reference TEXT,
  result_hash TEXT,
  source_references_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE (review_id, request_hash)
);

CREATE TABLE approval_payloads (
  id TEXT PRIMARY KEY,
  agreement TEXT NOT NULL REFERENCES agreement_cache(address),
  milestone_id INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  evidence_hash TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL UNIQUE,
  valid_until INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_payloads_lookup ON approval_payloads(agreement, milestone_id, created_at);

CREATE TABLE approval_signatures (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL REFERENCES approval_payloads(payload_hash),
  role TEXT NOT NULL CHECK (role IN ('COMMUNITY', 'REVIEWER')),
  signer TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (payload_hash, role)
);

CREATE TABLE indexed_events (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  block_timestamp INTEGER NOT NULL DEFAULT 0,
  event_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  UNIQUE (chain_id, contract, tx_hash, log_index)
);
CREATE INDEX idx_events_contract ON indexed_events(contract, block_number, log_index);
CREATE INDEX idx_events_block ON indexed_events(block_number);

CREATE TABLE indexer_blocks (
  number INTEGER PRIMARY KEY,
  hash TEXT NOT NULL
);

CREATE TABLE indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];

/** Applies pending migrations in order; each one runs in its own transaction. Idempotent. */
export function migrate(db: Db): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const done = new Set(all<{ version: number }>(db, "SELECT version FROM schema_migrations").map((r) => Number(r.version)));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    tx(db, () => {
      db.exec(m.sql);
      run(db, "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)", m.version, m.name, Date.now());
    });
    applied.push(m.version);
  }
  return applied;
}
