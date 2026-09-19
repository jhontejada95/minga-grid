import crypto from "node:crypto";
import { canonicalize } from "@minga/shared";
import type { Config } from "./config.js";
import type { AppContext } from "./context.js";
import { all, get, run, tx } from "./db.js";

/** Only these Parallel gateway endpoints may ever be called. Everything else is refused. */
export const ALLOWED_ENDPOINTS = ["/api/search", "/api/extract"] as const;
export type AllowedEndpoint = (typeof ALLOWED_ENDPOINTS)[number];

/** USD-pegged stablecoins we agree to be charged in, with their known decimals. Unknown currencies are refused (fail closed). */
const TEMPO_PATH_USD = "0x20c0000000000000000000000000000000000000";
const ALLOWED_CURRENCY_DECIMALS: Record<string, number> = { [TEMPO_PATH_USD]: 6 };

export interface PaymentOffer {
  method: string;
  intent: string;
  /** Live amount from the 402 challenge, converted to micro-USD (1 USD = 1_000_000). */
  amountMicroUsd: number;
  currency: string;
  realm: string;
  challengeId: string;
}

export type Authorization = { ok: true } | { ok: false; reason: string; code: "BUDGET_EXCEEDED" | "REFUSED" };

export type PaymentOutcome =
  | { kind: "PAID"; data: unknown; offer: PaymentOffer; receiptRef?: string }
  | { kind: "FREE"; data: unknown }
  | { kind: "DECLINED"; reason: string; code: "BUDGET_EXCEEDED" | "REFUSED"; offer?: PaymentOffer }
  | { kind: "FAILED"; errorCode: string; offer?: PaymentOffer; ambiguous: boolean };

/**
 * Narrow port over the MPP client library. `authorize` is called with the LIVE payment offer after the
 * 402 challenge is received and BEFORE any credential is created or signed; returning `ok: false`
 * guarantees nothing is paid.
 */
export interface PaymentClient {
  fetchPaid(url: string, body: unknown, authorize: (offer: PaymentOffer) => Authorization): Promise<PaymentOutcome>;
}

// ------------------------------------------------------------------ URL validation

const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal|.*\.localhost|.*\.lan|.*\.home|.*\.corp)$/i;

/** Public https URLs only: no credentials, no IP literals, no localhost/private names, standard port. */
export function isPublicHttpsUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST_RE.test(host)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  return true;
}

// ------------------------------------------------------------------ real client (mppx)

/** Converts a Tempo charge challenge into a priced offer, or explains why it cannot be priced. */
export function offerFromChallenge(c: {
  id: string; method: string; intent: string; realm: string; request: Record<string, unknown>;
}): PaymentOffer | { error: string } {
  if (c.method !== "tempo" || c.intent !== "charge") return { error: `Unsupported payment offer (${c.method}/${c.intent}).` };
  const amount = String(c.request.amount ?? "");
  const currency = String(c.request.currency ?? "");
  if (!/^\d+$/.test(amount)) return { error: "The payment offer has no readable amount." };
  const decimals = ALLOWED_CURRENCY_DECIMALS[currency.toLowerCase()];
  if (decimals === undefined) return { error: "The payment offer uses a currency that is not on the allowlist." };
  // The live offer's own `decimals`, when present, must agree with the known value: the gateway cannot
  // make a price look smaller by claiming a different precision.
  if (c.request.decimals !== undefined && Number(c.request.decimals) !== decimals) {
    return { error: "The payment offer declares unexpected token precision." };
  }
  // micro-USD = amount * 10^6 / 10^decimals, rounded up so we never under-count what we would pay.
  const num = BigInt(amount) * 1_000_000n;
  const den = 10n ** BigInt(decimals);
  const micro = (num + den - 1n) / den;
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) return { error: "The payment offer amount is out of range." };
  return { method: c.method, intent: c.intent, amountMicroUsd: Number(micro), currency, realm: c.realm, challengeId: c.id };
}

/**
 * Real MPP client built on `mppx`. Uses `prepareRequest` so the 402 challenge can be inspected and
 * authorized by deterministic server-side policy before `payment.pay()` signs anything. Redirects are
 * refused so a payment can never be steered to another host. Not exercised against the live gateway in
 * automated tests (that needs a funded account); the pre-payment path is tested against a local 402 server.
 */
export async function createMppxPaymentClient(config: Config): Promise<PaymentClient> {
  const { Mppx, tempo } = await import("mppx/client");
  const { privateKeyToAccount } = await import("viem/accounts");
  const key = config.mpp.secret;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("MPP_ACCOUNT_PRIVATE_KEY must be a 0x-prefixed 32-byte key.");
  const mppx = Mppx.create({ methods: [tempo({ account: privateKeyToAccount(key as `0x${string}`) })], polyfill: false });

  return {
    async fetchPaid(url, body, authorize) {
      const init: RequestInit = {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      };
      let prepared;
      try {
        prepared = await mppx.prepareRequest(url, init, { maxRedirects: 0 });
      } catch {
        return { kind: "FAILED", errorCode: "GATEWAY_UNREACHABLE", ambiguous: false };
      }

      if (!prepared.payment) {
        if (!prepared.response.ok) return { kind: "FAILED", errorCode: `HTTP_${prepared.response.status}`, ambiguous: false };
        return { kind: "FREE", data: await prepared.response.json().catch(() => null) };
      }

      const priced = offerFromChallenge(prepared.payment.challenge as never);
      if ("error" in priced) return { kind: "DECLINED", reason: priced.error, code: "REFUSED" };
      const decision = authorize(priced);
      if (!decision.ok) return { kind: "DECLINED", reason: decision.reason, code: decision.code, offer: priced };

      let response: Response;
      try {
        response = await prepared.payment.pay();
      } catch {
        // The credential may already have been sent: treat as ambiguous so we never pay twice blindly.
        return { kind: "FAILED", errorCode: "PAYMENT_NETWORK_ERROR", offer: priced, ambiguous: true };
      }
      if (!response.ok) {
        return { kind: "FAILED", errorCode: `HTTP_${response.status}`, offer: priced, ambiguous: response.status >= 500 };
      }
      const receipt = response.headers.get("payment-receipt") ?? undefined;
      return {
        kind: "PAID",
        data: await response.json().catch(() => null),
        offer: priced,
        receiptRef: receipt ? crypto.createHash("sha256").update(receipt).digest("hex") : undefined,
      };
    },
  };
}

// ------------------------------------------------------------------ policy engine

export type ResearchStatus = "COMPLETED" | "SKIPPED" | "UNAVAILABLE" | "BUDGET_EXCEEDED" | "FAILED" | "AMBIGUOUS";

export interface ResearchRequest {
  agreement: string;
  milestoneId: number;
  manifestHash: string;
  reviewId: string;
  endpoint: AllowedEndpoint;
  /** Built by the backend from trusted metadata; never from evidence or web content. */
  objective: string;
  body: { query: string } | { urls: string[] };
}

export interface ResearchResult {
  status: ResearchStatus;
  runId?: string;
  spendUsd: string;
  sourceReferences: string[];
  reason?: string;
}

export const MPP_UNAVAILABLE_TEXT = "External research unavailable — MPP payment service not configured or funded.";

const microToUsd = (m: number) => (m / 1_000_000).toFixed(2);
const RESERVING = "('AUTHORIZED','COMPLETED','AMBIGUOUS')";

interface RunRow {
  id: string;
  status: string;
  authorized_micro_usd: number;
  actual_micro_usd: number;
  source_references_json: string | null;
  error_code: string | null;
}

/** Pulls plausible source URLs out of a gateway response, keeping only public https URLs. */
export function extractSourceUrls(data: unknown): string[] {
  const out = new Set<string>();
  const results = (data && typeof data === "object" ? (data as Record<string, unknown>).results : undefined) as unknown;
  if (Array.isArray(results)) {
    for (const item of results) {
      const url = item && typeof item === "object" ? ((item as Record<string, unknown>).url ?? (item as Record<string, unknown>).link) : undefined;
      if (typeof url === "string" && isPublicHttpsUrl(url)) out.add(url);
      if (out.size >= 20) break;
    }
  }
  return [...out];
}

/**
 * Runs one bounded, allowlisted, paid research request. The deterministic policy here — not any model —
 * decides whether money may be spent: it enforces the per-review call and spend caps against the LIVE
 * offer, reserves the spend transactionally before signing, never repeats a completed or unresolved
 * request, and never touches agreement funds (a separate operational account pays).
 */
export async function runBoundedResearch(ctx: AppContext, req: ResearchRequest): Promise<ResearchResult> {
  const { mpp } = ctx.config;
  const unavailable = (reason: string): ResearchResult => ({ status: "UNAVAILABLE", spendUsd: "0.00", sourceReferences: [], reason });

  if (!mpp.enabled) return unavailable(MPP_UNAVAILABLE_TEXT + (mpp.disabledReason ? ` (${mpp.disabledReason})` : ""));
  if (!ctx.payments) return unavailable(MPP_UNAVAILABLE_TEXT);
  if (!ALLOWED_ENDPOINTS.includes(req.endpoint)) return unavailable("That research endpoint is not allowed.");

  if ("urls" in req.body) {
    if (req.endpoint !== "/api/extract" || req.body.urls.length === 0 || !req.body.urls.every(isPublicHttpsUrl)) {
      return unavailable("Extraction is limited to public https URLs.");
    }
  } else if (req.endpoint !== "/api/search" || req.body.query.trim().length === 0 || req.body.query.length > 300) {
    return unavailable("Invalid research query.");
  }

  const baseUrl = new URL(mpp.baseUrl);
  const url = new URL(req.endpoint, baseUrl).toString(); // host is fixed by config; only the path varies
  const requestHash = canonicalize({ endpoint: req.endpoint, body: req.body }).hash;

  // Idempotency: never repurchase a completed request, never re-pay an unresolved one.
  const existing = get<RunRow>(ctx.db, "SELECT * FROM external_research_runs WHERE review_id = ? AND request_hash = ?", req.reviewId, requestHash);
  if (existing?.status === "COMPLETED") {
    return {
      status: "COMPLETED", runId: existing.id, spendUsd: microToUsd(existing.actual_micro_usd),
      sourceReferences: JSON.parse(existing.source_references_json ?? "[]") as string[],
    };
  }
  if (existing && (existing.status === "AUTHORIZED" || existing.status === "AMBIGUOUS")) {
    return {
      status: "AMBIGUOUS", runId: existing.id, spendUsd: microToUsd(existing.authorized_micro_usd), sourceReferences: [],
      reason: "A previous payment attempt for this exact request is unresolved. It will not be repeated automatically.",
    };
  }

  // Pre-flight limits (calls and extract URLs). The live spend cap is enforced again inside `authorize`.
  const used = get<{ calls: number; urls: number }>(
    ctx.db,
    `SELECT COUNT(*) AS calls, COALESCE(SUM(url_count), 0) AS urls
     FROM external_research_runs WHERE review_id = ? AND status IN ${RESERVING}`,
    req.reviewId
  ) ?? { calls: 0, urls: 0 };
  if (used.calls >= mpp.maxCalls) {
    return { status: "BUDGET_EXCEEDED", spendUsd: "0.00", sourceReferences: [], reason: `The limit of ${mpp.maxCalls} paid calls per review was reached.` };
  }
  if ("urls" in req.body && used.urls + req.body.urls.length > mpp.maxExtractUrls) {
    return { status: "BUDGET_EXCEEDED", spendUsd: "0.00", sourceReferences: [], reason: `The limit of ${mpp.maxExtractUrls} extracted URLs per review was reached.` };
  }

  const runId = existing?.id ?? crypto.randomUUID();
  const createdAt = ctx.now();
  if (existing) {
    run(ctx.db, "UPDATE external_research_runs SET status = 'PENDING', error_code = NULL, created_at = ? WHERE id = ?", createdAt, runId);
  } else {
    run(
      ctx.db,
      `INSERT INTO external_research_runs
         (id, agreement, milestone_id, manifest_hash, review_id, provider, endpoint, objective, request_hash, url_count, status, payment_method, created_at)
       VALUES (?, ?, ?, ?, ?, 'Parallel MPP', ?, ?, ?, ?, 'PENDING', ?, ?)`,
      runId, req.agreement, req.milestoneId, req.manifestHash, req.reviewId, req.endpoint,
      req.objective.slice(0, 500), requestHash, "urls" in req.body ? req.body.urls.length : 0, mpp.method ?? null, createdAt
    );
  }

  // Runs synchronously between receiving the live offer and signing: the spend is reserved atomically.
  const authorize = (offer: PaymentOffer): Authorization =>
    tx(ctx.db, () => {
      const spent = get<{ s: number }>(
        ctx.db,
        `SELECT COALESCE(SUM(authorized_micro_usd), 0) AS s FROM external_research_runs
         WHERE review_id = ? AND status IN ${RESERVING} AND id != ?`,
        req.reviewId, runId
      )?.s ?? 0;
      if (spent + offer.amountMicroUsd > mpp.maxSpendMicroUsd) {
        return {
          ok: false as const, code: "BUDGET_EXCEEDED" as const,
          reason: `The live price ($${microToUsd(offer.amountMicroUsd)}) would exceed the remaining review budget ($${microToUsd(Math.max(0, mpp.maxSpendMicroUsd - spent))}).`,
        };
      }
      run(
        ctx.db,
        `UPDATE external_research_runs SET status = 'AUTHORIZED', authorized_micro_usd = ?, currency = 'USD', challenge_reference = ? WHERE id = ?`,
        offer.amountMicroUsd, offer.challengeId.slice(0, 120), runId
      );
      return { ok: true as const };
    });

  const outcome = await ctx.payments.fetchPaid(url, req.body, authorize);
  const done = ctx.now();

  switch (outcome.kind) {
    case "PAID":
    case "FREE": {
      const sources = extractSourceUrls(outcome.data);
      const spent = outcome.kind === "PAID" ? outcome.offer.amountMicroUsd : 0;
      let resultHash: string | null = null;
      try {
        resultHash = canonicalize(outcome.data ?? null).hash;
      } catch {
        resultHash = null;
      }
      run(
        ctx.db,
        `UPDATE external_research_runs SET status = 'COMPLETED', actual_micro_usd = ?, receipt_reference = ?, result_hash = ?,
           source_references_json = ?, completed_at = ? WHERE id = ?`,
        spent, outcome.kind === "PAID" ? outcome.receiptRef ?? null : null, resultHash, JSON.stringify(sources), done, runId
      );
      return { status: "COMPLETED", runId, spendUsd: microToUsd(spent), sourceReferences: sources };
    }
    case "DECLINED": {
      run(ctx.db, "UPDATE external_research_runs SET status = 'DECLINED', authorized_micro_usd = 0, error_code = ?, completed_at = ? WHERE id = ?", outcome.code, done, runId);
      return {
        status: outcome.code === "BUDGET_EXCEEDED" ? "BUDGET_EXCEEDED" : "UNAVAILABLE",
        runId, spendUsd: "0.00", sourceReferences: [], reason: outcome.reason,
      };
    }
    case "FAILED": {
      // Ambiguous failures keep their reservation and are never retried automatically.
      run(ctx.db, "UPDATE external_research_runs SET status = ?, error_code = ?, completed_at = ? WHERE id = ?", outcome.ambiguous ? "AMBIGUOUS" : "FAILED", outcome.errorCode, done, runId);
      if (!outcome.ambiguous) run(ctx.db, "UPDATE external_research_runs SET authorized_micro_usd = 0 WHERE id = ?", runId);
      return {
        status: outcome.ambiguous ? "AMBIGUOUS" : "FAILED", runId,
        spendUsd: outcome.ambiguous ? microToUsd(outcome.offer?.amountMicroUsd ?? 0) : "0.00", sourceReferences: [],
        reason: outcome.ambiguous
          ? "The payment outcome could not be confirmed. It will not be retried automatically."
          : `The research request failed (${outcome.errorCode}). Nothing was charged.`,
      };
    }
  }
}

export interface ResearchRunDto {
  id: string;
  provider: string;
  endpoint: string;
  objective: string;
  status: string;
  paymentMethod: string | null;
  authorizedSpendUsd: string;
  actualSpendUsd: string;
  currency: string;
  receiptReference: string | null;
  sourceReferences: string[];
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  manifestHash: string;
}

export function listResearchRuns(ctx: AppContext, agreement: string, milestoneId: number): ResearchRunDto[] {
  return all<{
    id: string; provider: string; endpoint: string; objective: string; status: string; payment_method: string | null;
    authorized_micro_usd: number; actual_micro_usd: number; currency: string; receipt_reference: string | null;
    source_references_json: string | null; error_code: string | null; created_at: number; completed_at: number | null; manifest_hash: string;
  }>(
    ctx.db,
    "SELECT * FROM external_research_runs WHERE agreement = ? AND milestone_id = ? ORDER BY created_at DESC",
    agreement, milestoneId
  ).map((r) => ({
    id: r.id,
    provider: r.provider,
    endpoint: r.endpoint,
    objective: r.objective,
    status: r.status,
    paymentMethod: r.payment_method,
    authorizedSpendUsd: microToUsd(r.authorized_micro_usd),
    actualSpendUsd: microToUsd(r.actual_micro_usd),
    currency: r.currency,
    receiptReference: r.receipt_reference,
    sourceReferences: JSON.parse(r.source_references_json ?? "[]") as string[],
    errorCode: r.error_code,
    createdAt: new Date(r.created_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    manifestHash: r.manifest_hash,
  }));
}
