import crypto from "node:crypto";
import type { Address, Hex } from "viem";
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import type { AppContext } from "./context.js";
import { get, run } from "./db.js";
import { ApiError, badRequest, unauthorized } from "./errors.js";

export const SIWE_STATEMENT = "Sign in to MINGA Nature. This does not authorize any payment.";

export interface Challenge {
  nonce: string;
  domain: string;
  uri: string;
  chainId: number;
  version: "1";
  statement: string;
  issuedAt: string;
  expirationTime: string;
}

/**
 * Creates a single-use, short-lived login challenge. The server, not the client, decides the domain,
 * URI, chain and lifetime that the signed message must carry.
 */
export function createChallenge(ctx: AppContext, opts: { wallet?: string } = {}): Challenge {
  const issuedAt = ctx.now();
  const expiresAt = issuedAt + ctx.config.challengeTtlMs;
  const nonce = generateSiweNonce();
  run(
    ctx.db,
    `INSERT INTO auth_challenges (nonce, domain, uri, chain_id, wallet, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    nonce,
    ctx.config.siweDomain,
    ctx.config.siweUri,
    ctx.chain.chainId,
    opts.wallet ? opts.wallet.toLowerCase() : null,
    issuedAt,
    expiresAt
  );
  return {
    nonce,
    domain: ctx.config.siweDomain,
    uri: ctx.config.siweUri,
    chainId: ctx.chain.chainId,
    version: "1",
    statement: SIWE_STATEMENT,
    issuedAt: new Date(issuedAt).toISOString(),
    expirationTime: new Date(expiresAt).toISOString(),
  };
}

const authError = (code: string, message: string) => new ApiError(401, code, message);

export interface SessionInfo {
  wallet: string;
  expiresAt: number;
}

export function hashSessionId(secret: string, id: string): string {
  return crypto.createHmac("sha256", secret).update(id).digest("hex");
}

/** Verifies a signed SIWE message against a stored challenge and opens a session bound to the signer. */
export async function verifyLogin(
  ctx: AppContext,
  input: { message: string; signature: string }
): Promise<{ sessionId: string } & SessionInfo> {
  const p = parseSiweMessage(input.message);
  if (
    !p.address || !p.nonce || !p.domain || !p.uri || p.chainId === undefined ||
    !p.issuedAt || !p.expirationTime || p.version !== "1"
  ) {
    throw badRequest("INVALID_SIWE_MESSAGE", "The login message is malformed or incomplete.");
  }
  if (!/^0x[0-9a-fA-F]+$/.test(input.signature)) throw badRequest("INVALID_SIGNATURE", "The signature must be a hex string.");

  const ch = get<{
    nonce: string; domain: string; uri: string; chain_id: number; wallet: string | null;
    issued_at: number; expires_at: number; consumed_at: number | null;
  }>(ctx.db, "SELECT * FROM auth_challenges WHERE nonce = ?", p.nonce);
  const nowMs = ctx.now();

  if (!ch || ch.consumed_at !== null) throw authError("LOGIN_CHALLENGE_INVALID", "This login challenge is unknown or was already used. Request a new one.");
  if (nowMs > ch.expires_at) throw authError("LOGIN_CHALLENGE_EXPIRED", "This login challenge has expired. Request a new one.");
  if (p.domain !== ch.domain) throw authError("LOGIN_DOMAIN_MISMATCH", "The login message was issued for a different site.");
  if (p.uri !== ch.uri) throw authError("LOGIN_URI_MISMATCH", "The login message was issued for a different origin.");
  if (p.chainId !== ch.chain_id) throw authError("LOGIN_WRONG_CHAIN", `The login message must use chain ID ${ch.chain_id}.`);
  if (ch.wallet && p.address.toLowerCase() !== ch.wallet) {
    throw authError("LOGIN_ACCOUNT_MISMATCH", "The signing account is not the account this challenge was requested for.");
  }
  if (p.expirationTime.getTime() > ch.expires_at + 1000) {
    throw authError("LOGIN_MESSAGE_TOO_LONG_LIVED", "The login message expires later than the challenge allows.");
  }
  if (p.issuedAt.getTime() > nowMs + 60_000) throw authError("LOGIN_MESSAGE_FROM_FUTURE", "The login message was issued in the future.");
  if (
    !validateSiweMessage({
      message: p as Parameters<typeof validateSiweMessage>[0]["message"],
      domain: ch.domain,
      nonce: ch.nonce,
      time: new Date(nowMs),
    })
  ) {
    throw authError("LOGIN_MESSAGE_INVALID", "The login message is expired or does not match the challenge.");
  }

  const ok = await ctx.chain.verifyPersonalMessage({
    address: p.address as Address,
    message: input.message,
    signature: input.signature as Hex,
  });
  if (!ok) throw authError("LOGIN_BAD_SIGNATURE", "The signature does not match the account in the login message.");

  // Consume atomically: with concurrent verifications of the same nonce only one UPDATE matches.
  const consumed = run(
    ctx.db,
    "UPDATE auth_challenges SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL AND expires_at >= ?",
    nowMs,
    ch.nonce,
    nowMs
  );
  if (consumed.changes !== 1) throw authError("LOGIN_CHALLENGE_INVALID", "This login challenge was already used.");

  const wallet = p.address.toLowerCase();
  const id = crypto.randomBytes(32).toString("base64url");
  const expiresAt = nowMs + ctx.config.sessionTtlMs;
  run(
    ctx.db,
    "INSERT INTO sessions (id_hash, wallet, created_at, expires_at) VALUES (?, ?, ?, ?)",
    hashSessionId(ctx.config.sessionSecret, id),
    wallet,
    nowMs,
    expiresAt
  );
  purgeExpired(ctx);
  return { sessionId: id, wallet, expiresAt };
}

export function getSession(ctx: AppContext, sessionId: string | undefined): SessionInfo | undefined {
  if (!sessionId || sessionId.length > 200) return undefined;
  const row = get<{ wallet: string; expires_at: number }>(
    ctx.db,
    "SELECT wallet, expires_at FROM sessions WHERE id_hash = ? AND expires_at > ?",
    hashSessionId(ctx.config.sessionSecret, sessionId),
    ctx.now()
  );
  return row ? { wallet: row.wallet, expiresAt: row.expires_at } : undefined;
}

export function destroySession(ctx: AppContext, sessionId: string | undefined): void {
  if (!sessionId) return;
  run(ctx.db, "DELETE FROM sessions WHERE id_hash = ?", hashSessionId(ctx.config.sessionSecret, sessionId));
}

export function purgeExpired(ctx: AppContext): void {
  const now = ctx.now();
  run(ctx.db, "DELETE FROM sessions WHERE expires_at <= ?", now);
  run(ctx.db, "DELETE FROM auth_challenges WHERE expires_at <= ?", now - 3_600_000);
}

export function requireSession(session: SessionInfo | undefined): SessionInfo {
  if (!session) throw unauthorized();
  return session;
}

/** Fixed-window in-memory rate limiter (per process; the backend runs as a single instance). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number
  ) {}

  /** Returns true when the call is allowed. */
  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      if (this.hits.size > 10_000) this.prune(t);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (t >= v.resetAt) this.hits.delete(k);
  }
}
