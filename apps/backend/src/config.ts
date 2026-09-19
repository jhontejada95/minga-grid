import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: src/ (or dist/) -> apps/backend -> apps -> root. */
export const REPO_ROOT = path.resolve(here, "../../..");

const ALLOWED_MPP_HOST = "parallelmpp.dev";
const PLACEHOLDER_SECRET_MARKER = "a_very_secret";

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");
const int = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) => Number(v))
    .pipe(z.number().int().nonnegative());
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: int("4000"),
  HOST: z.string().default("127.0.0.1"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  SIWE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  DATABASE_PATH: z.string().default("./data/minga.sqlite"),
  EVIDENCE_STORAGE_PATH: z.string().default("./data/evidence"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: int("12"),
  CHALLENGE_TTL_MINUTES: int("10"),

  HSK_RPC_URL: z.string().url().default("https://testnet.hsk.xyz"),
  HSK_CHAIN_ID: int("133"),
  FACTORY_ADDRESS: addr.optional().or(z.literal("").transform(() => undefined)),
  FACTORY_DEPLOYMENT_BLOCK: int("0"),
  MOCK_USD_ADDRESS: addr.optional().or(z.literal("").transform(() => undefined)),

  INDEXER_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  INDEXER_POLL_MS: int("10000"),
  INDEXER_MAX_RANGE: int("1000"),
  INDEXER_CONFIRMATIONS: int("5"),
  INDEXER_REORG_WINDOW: int("12"),

  EVIDENCE_MAX_BYTES: int("1048576"),
  EVIDENCE_MAX_FILES_PER_AGREEMENT: int("200"),
  APPROVAL_TTL_HOURS: int("24"),

  AI_PROVIDER: z.enum(["none", "groq", "openai", "gemini", "anthropic"]).default("none"),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  /** Override for tests or a compatible gateway. Must be https unless the host is loopback and NODE_ENV is not production. */
  AI_BASE_URL: z.string().optional(),
  AI_TIMEOUT_MS: int("25000"),

  MPP_ENABLED: flag,
  MPP_PARALLEL_BASE_URL: z.string().default(`https://${ALLOWED_MPP_HOST}`),
  MPP_PAYMENT_METHOD: z.string().optional(),
  /** Private key of the SEPARATE operational account that pays for research. Never an agreement or participant key. */
  MPP_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  MPP_MAX_SPEND_PER_REVIEW_USD: z.string().default("0.05"),
  MPP_MAX_CALLS_PER_REVIEW: int("5"),
  MPP_MAX_EXTRACT_URLS_PER_REVIEW: int("3"),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  host: string;
  allowedOrigins: string[];
  siweDomain: string;
  siweUri: string;
  cookieSecure: boolean;
  dbPath: string;
  evidencePath: string;
  sessionSecret: string;
  sessionTtlMs: number;
  challengeTtlMs: number;
  chain: {
    id: number;
    rpcUrl: string;
    factory?: `0x${string}`;
    factoryDeploymentBlock: number;
    token?: `0x${string}`;
  };
  indexer: { enabled: boolean; pollMs: number; maxRange: number; confirmations: number; reorgWindow: number };
  evidence: { maxBytes: number; maxFilesPerAgreement: number };
  approvalTtlSeconds: number;
  ai: {
    provider: string;
    model: string;
    /** True only when the provider is implemented and a key is set. */
    enabled: boolean;
    /** Why model-assisted review is off; shown to users. */
    disabledReason?: string;
    baseUrl: string;
    apiKey?: string;
    timeoutMs: number;
  };
  mpp: {
    enabled: boolean;
    /** Why MPP is off although it was requested; shown to users as the real reason. */
    disabledReason?: string;
    baseUrl: string;
    method?: string;
    secret?: string;
    maxSpendMicroUsd: number;
    maxCalls: number;
    maxExtractUrls: number;
  };
}

/**
 * Loads the root `.env` into `process.env` (existing variables win). Called only by the real entry point,
 * so tests that pass an explicit environment to `loadConfig` are never affected by a developer's `.env`.
 */
export function loadEnvFile(): void {
  dotenv.config({ path: path.resolve(REPO_ROOT, ".env") });
}

/** "0.05" -> 50000 (micro-USD). Rejects anything that is not a plain non-negative decimal. */
export function parseUsdToMicro(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid USD amount: ${value}`);
  return Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0"));
}

function resolvePath(p: string): string {
  return p === ":memory:" ? p : path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

/**
 * Loads and validates the environment. Throws a readable error listing every invalid variable.
 * Blockchain contract addresses are optional here so tests and read-only tooling can start;
 * `assertRuntimeConfig` enforces them for the real server.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid backend configuration:\n${lines.join("\n")}`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === "production" && e.SESSION_SECRET.includes(PLACEHOLDER_SECRET_MARKER)) {
    throw new Error("Invalid backend configuration:\n  - SESSION_SECRET: replace the example placeholder with a random secret");
  }

  const allowedOrigins = e.FRONTEND_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const primary = new URL(allowedOrigins[0] ?? "http://localhost:3000");
  const siweDomain = e.SIWE_DOMAIN ?? primary.host;

  // MPP: enabled only when it can actually work; otherwise disabled with the real reason.
  let mppReason: string | undefined;
  let maxSpendMicroUsd = 0;
  try {
    maxSpendMicroUsd = parseUsdToMicro(e.MPP_MAX_SPEND_PER_REVIEW_USD);
  } catch {
    mppReason = "MPP_MAX_SPEND_PER_REVIEW_USD is not a valid decimal amount.";
  }
  if (e.MPP_ENABLED && !mppReason) {
    let host = "";
    try {
      const u = new URL(e.MPP_PARALLEL_BASE_URL);
      host = u.protocol === "https:" ? u.hostname : "";
    } catch {
      host = "";
    }
    if (host !== ALLOWED_MPP_HOST) mppReason = `MPP_PARALLEL_BASE_URL must be https://${ALLOWED_MPP_HOST}.`;
    else if (!e.MPP_PAYMENT_METHOD) mppReason = "MPP_PAYMENT_METHOD is not set.";
    else if (e.MPP_PAYMENT_METHOD !== "tempo") mppReason = 'Only the "tempo" payment method is implemented.';
    else if (!e.MPP_ACCOUNT_PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(e.MPP_ACCOUNT_PRIVATE_KEY))
      mppReason = "MPP_ACCOUNT_PRIVATE_KEY is not set or is not a 0x-prefixed 32-byte key.";
    else if (maxSpendMicroUsd <= 0 || e.MPP_MAX_CALLS_PER_REVIEW <= 0 || e.MPP_MAX_EXTRACT_URLS_PER_REVIEW < 0)
      mppReason = "MPP spending limits must be positive.";
  }
  const mppEnabled = e.MPP_ENABLED && !mppReason;

  // AI: only "groq" is implemented. Anything else is reported honestly instead of pretending to work.
  const GROQ_BASE = "https://api.groq.com/openai/v1";
  let aiBase = GROQ_BASE;
  let aiReason: string | undefined;
  if (e.AI_BASE_URL) {
    try {
      const u = new URL(e.AI_BASE_URL);
      const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      if (u.protocol === "https:" || (loopback && e.NODE_ENV !== "production")) aiBase = e.AI_BASE_URL.replace(/\/$/, "");
      else aiReason = "AI_BASE_URL must be an https URL.";
    } catch {
      aiReason = "AI_BASE_URL is not a valid URL.";
    }
  }
  if (!aiReason) {
    if (e.AI_PROVIDER === "none") aiReason = "AI provider not connected.";
    else if (e.AI_PROVIDER !== "groq") aiReason = `AI provider "${e.AI_PROVIDER}" is not implemented; only "groq" is supported.`;
    else if (!e.AI_API_KEY) aiReason = "AI_API_KEY is not set.";
  }
  const aiEnabled = !aiReason;

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    allowedOrigins,
    siweDomain,
    siweUri: primary.origin,
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : e.NODE_ENV === "production",
    dbPath: resolvePath(e.DATABASE_PATH),
    evidencePath: resolvePath(e.EVIDENCE_STORAGE_PATH),
    sessionSecret: e.SESSION_SECRET,
    sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
    challengeTtlMs: e.CHALLENGE_TTL_MINUTES * 60_000,
    chain: {
      id: e.HSK_CHAIN_ID,
      rpcUrl: e.HSK_RPC_URL,
      factory: e.FACTORY_ADDRESS as `0x${string}` | undefined,
      factoryDeploymentBlock: e.FACTORY_DEPLOYMENT_BLOCK,
      token: e.MOCK_USD_ADDRESS as `0x${string}` | undefined,
    },
    indexer: {
      enabled: e.INDEXER_ENABLED,
      pollMs: e.INDEXER_POLL_MS,
      maxRange: Math.max(1, e.INDEXER_MAX_RANGE),
      confirmations: e.INDEXER_CONFIRMATIONS,
      reorgWindow: Math.max(1, e.INDEXER_REORG_WINDOW),
    },
    evidence: { maxBytes: e.EVIDENCE_MAX_BYTES, maxFilesPerAgreement: e.EVIDENCE_MAX_FILES_PER_AGREEMENT },
    approvalTtlSeconds: e.APPROVAL_TTL_HOURS * 3600,
    ai: {
      provider: e.AI_PROVIDER,
      model: e.AI_MODEL ?? "llama-3.3-70b-versatile",
      enabled: aiEnabled,
      disabledReason: aiReason,
      baseUrl: aiBase,
      apiKey: aiEnabled ? e.AI_API_KEY : undefined,
      timeoutMs: Math.max(1, e.AI_TIMEOUT_MS),
    },
    mpp: {
      enabled: mppEnabled,
      disabledReason: e.MPP_ENABLED && !mppEnabled ? mppReason : undefined,
      baseUrl: e.MPP_PARALLEL_BASE_URL,
      method: e.MPP_PAYMENT_METHOD,
      secret: mppEnabled ? e.MPP_ACCOUNT_PRIVATE_KEY : undefined,
      maxSpendMicroUsd,
      maxCalls: e.MPP_MAX_CALLS_PER_REVIEW,
      maxExtractUrls: e.MPP_MAX_EXTRACT_URLS_PER_REVIEW,
    },
  };
}

/** Fails clearly when the blockchain configuration required by the real server is missing. */
export function assertRuntimeConfig(config: Config): void {
  const missing: string[] = [];
  if (!config.chain.factory) missing.push("FACTORY_ADDRESS");
  if (missing.length) {
    throw new Error(
      `Missing blockchain configuration: ${missing.join(", ")}. Deploy the contracts and set them in the root .env.`
    );
  }
}

export { ALLOWED_MPP_HOST };
