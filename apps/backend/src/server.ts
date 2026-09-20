import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { HSK_TESTNET } from "@minga/shared";
import type { AppContext } from "./context.js";
import { ApiError, badRequest, forbidden, notFound, tooManyRequests, unauthorized } from "./errors.js";
import {
  createChallenge, destroySession, getSession, RateLimiter, requireSession, verifyLogin, type SessionInfo,
} from "./auth.js";
import {
  createDraft, getFreshness, isParticipant, listAgreements, normalizeAddress, refreshAgreementState,
  requireAgreement, requirementsOf, loadMetadata, roleOf, type AgreementRow, type Role,
} from "./agreements.js";
import { buildAgreementDetail } from "./detail.js";
import {
  createManifest, findFile, listFiles, listManifests, manifestRequirementKeys, readFileBytes, saveEvidenceFile,
  latestManifest,
} from "./evidence.js";
import { findReview, listReviews, requestReview } from "./review.js";
import { listResearchRuns } from "./mpp.js";
import { getApprovalState, prepareApprovalPayload, submitApprovalSignature } from "./approvals.js";
import { getActivity } from "./indexer.js";
import { registerGridRoutes } from "./grid.js";
import { buildOpenApi } from "./openapi.js";

export const SESSION_COOKIE = "minga_session";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionInfo;
  }
}

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hash");
const addressParam = z.object({ address: z.string() });
const milestoneParam = z.object({
  address: z.string(),
  id: z.coerce.number().int().min(0).max(1),
});
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest("INVALID_REQUEST", r.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
  }
  return r.data;
}

/** Builds the API. All state lives in `ctx`, so tests can run it against an in-memory DB and a local chain. */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const { config } = ctx;
  const app = fastify({
    logger:
      config.env === "test"
        ? false
        : { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: config.env === "production",
    bodyLimit: 256 * 1024,
  });

  const challengeLimit = new RateLimiter(30, 60_000, ctx.now);
  const verifyLimit = new RateLimiter(20, 60_000, ctx.now);
  const uploadLimit = new RateLimiter(60, 60_000, ctx.now);
  const reviewLimit = new RateLimiter(10, 60_000, ctx.now);
  const writeLimit = new RateLimiter(60, 60_000, ctx.now);
  const draftLimit = new RateLimiter(20, 3_600_000, ctx.now);
  const limit = (rl: RateLimiter, key: string) => {
    if (!rl.allow(key)) throw tooManyRequests();
  };

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type"],
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: config.evidence.maxBytes, files: 1, fields: 4, parts: 6, headerPairs: 50 },
  });

  const routes: { method: string; url: string }[] = [];
  app.addHook("onRoute", (r) => {
    for (const m of Array.isArray(r.method) ? r.method : [r.method]) {
      if (m !== "HEAD" && m !== "OPTIONS") routes.push({ method: m, url: r.url });
    }
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    const sid = req.cookies?.[SESSION_COOKIE];
    req.session = getSession(ctx, sid);
    if (MUTATING.has(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        if (!config.allowedOrigins.includes(origin)) throw forbidden("ORIGIN_NOT_ALLOWED", "This origin is not allowed.");
      } else if (sid) {
        throw forbidden("ORIGIN_REQUIRED", "Requests that use a session must send an Origin header.");
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    }
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({ error: { code: "FILE_TOO_LARGE", message: `Files are limited to ${config.evidence.maxBytes} bytes.` } });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: "BAD_REQUEST", message: "The request could not be processed." } });
    }
    req.log.error({ err }, "Unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Nothing was changed." } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found." } }));

  const session = (req: FastifyRequest) => requireSession(req.session);
  const agreementOf = (address: string) => requireAgreement(ctx, normalizeAddress(address));
  const participant = (row: AgreementRow, req: FastifyRequest): Role => {
    const s = session(req);
    const role = roleOf(row, s.wallet);
    if (!isParticipant(role)) throw forbidden("NOT_A_PARTICIPANT", "Only participants of this agreement can see this.");
    return role;
  };

  // ------------------------------------------------------------ meta
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date(ctx.now()).toISOString(),
    chainId: ctx.chain.chainId,
    indexer: getFreshness(ctx),
  }));

  app.get("/api/v1/config", async () => ({
    chainId: config.chain.id,
    rpcUrl: config.chain.rpcUrl,
    factoryAddress: config.chain.factory ?? null,
    mockUsdAddress: config.chain.token ?? null,
    factoryDeploymentBlock: config.chain.factoryDeploymentBlock,
    explorerUrl: config.chain.id === HSK_TESTNET.id ? HSK_TESTNET.blockExplorerUrl : null,
    confirmations: config.indexer.confirmations,
    features: {
      documentChecks: true,
      aiReview: config.ai.enabled,
      aiProvider: config.ai.enabled ? config.ai.provider : null,
      aiUnavailableReason: config.ai.enabled ? null : (config.ai.disabledReason ?? "AI provider not connected."),
      aiDataNotice: config.ai.enabled ? `Text of the submitted evidence files is sent to ${config.ai.provider} for analysis.` : null,
      mppResearch: config.mpp.enabled,
      mppUnavailableReason: config.mpp.enabled ? null : (config.mpp.disabledReason ?? "MPP is not enabled."),
    },
    limits: { evidenceMaxBytes: config.evidence.maxBytes, evidenceMaxFilesPerAgreement: config.evidence.maxFilesPerAgreement },
  }));

  app.get("/api/v1/openapi.json", async () => buildOpenApi());

  // MINGA Grid demand-response surface. Kept separate from the inherited agreement routes.
  registerGridRoutes(app, ctx);

  // ------------------------------------------------------------ auth
  app.post("/api/v1/auth/challenge", async (req) => {
    limit(challengeLimit, req.ip);
    const body = parse(z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional() }).strict(), req.body ?? {});
    return createChallenge(ctx, { wallet: body.wallet });
  });

  app.post("/api/v1/auth/verify", async (req, reply) => {
    limit(verifyLimit, req.ip);
    const body = parse(z.object({ message: z.string().min(1).max(4000), signature: z.string().min(1).max(4000) }).strict(), req.body);
    const s = await verifyLogin(ctx, body);
    reply.setCookie(SESSION_COOKIE, s.sessionId, {
      path: "/",
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
    return { wallet: s.wallet, expiresAt: new Date(s.expiresAt).toISOString() };
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    destroySession(ctx, req.cookies?.[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { success: true };
  });

  app.get("/api/v1/auth/me", async (req) => ({
    authenticated: !!req.session,
    wallet: req.session?.wallet ?? null,
    expiresAt: req.session ? new Date(req.session.expiresAt).toISOString() : null,
  }));

  // ------------------------------------------------------------ drafts and agreements
  app.post("/api/v1/agreement-drafts", async (req) => {
    const s = session(req);
    limit(draftLimit, s.wallet);
    const body = parse(z.object({ metadata: z.unknown(), proposedParameters: z.unknown().optional() }).strict(), req.body);
    return createDraft(ctx, s.wallet, body.metadata, body.proposedParameters);
  });

  app.get("/api/v1/agreements", async (req) => {
    const q = parse(
      paging.extend({
        status: z.enum(["AWAITING_ACCEPTANCE", "READY_TO_FUND", "EXPIRED_UNFUNDED", "FUNDED", "FIRST_MILESTONE_PAID", "COMPLETED", "EXPIRED_REFUNDABLE", "REFUNDED"]).optional(),
        demo: z.enum(["true", "false"]).optional(),
        q: z.string().max(100).optional(),
        mine: z.enum(["true", "false"]).optional(),
      }),
      req.query
    );
    return listAgreements(ctx, {
      status: q.status,
      demo: q.demo === undefined ? undefined : q.demo === "true",
      q: q.q,
      wallet: req.session?.wallet,
      mine: q.mine === "true",
      page: q.page,
      pageSize: q.pageSize,
    });
  });

  app.get("/api/v1/agreements/:address", async (req) => {
    const { address } = parse(addressParam, req.params);
    const q = parse(z.object({ refresh: z.enum(["true", "false"]).optional() }), req.query);
    let row = agreementOf(address);
    if (q.refresh === "true") row = await refreshAgreementState(ctx, row.address);
    return buildAgreementDetail(ctx, row, roleOf(row, req.session?.wallet));
  });

  app.get("/api/v1/agreements/:address/activity", async (req) => {
    const { address } = parse(addressParam, req.params);
    const q = parse(paging, req.query);
    const row = agreementOf(address);
    return getActivity(ctx, row.address, q.page, q.pageSize);
  });

  // ------------------------------------------------------------ evidence
  app.get("/api/v1/agreements/:address/evidence/files", async (req) => {
    const { address } = parse(addressParam, req.params);
    const row = agreementOf(address);
    participant(row, req);
    return { files: listFiles(ctx, row.address) };
  });

  app.post("/api/v1/agreements/:address/evidence/files", async (req) => {
    const s = session(req);
    limit(uploadLimit, s.wallet);
    const { address } = parse(addressParam, req.params);
    const row = agreementOf(address);
    if (roleOf(row, s.wallet) !== "COMMUNITY") {
      throw forbidden("NOT_COMMUNITY_REPRESENTATIVE", "Only the community representative of this agreement can upload evidence.");
    }
    const part = await req.file();
    if (!part) throw badRequest("NO_FILE", "Attach one file as multipart form data.");
    const bytes = await part.toBuffer();
    return saveEvidenceFile(ctx, row, { wallet: s.wallet, fileName: part.filename, claimedMime: part.mimetype, bytes });
  });

  app.get("/api/v1/evidence/files/:id", async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const file = findFile(ctx, id);
    if (!file) throw notFound("FILE_NOT_FOUND", "File not found.");
    participant(requireAgreement(ctx, file.agreement), req);
    const bytes = readFileBytes(ctx, file);
    // Always served as an attachment with a fixed harmless type: uploaded content is never rendered.
    return reply
      .header("content-type", "text/plain; charset=utf-8")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`)
      .header("content-security-policy", "default-src 'none'; sandbox")
      .header("x-file-sha256", file.sha256)
      .send(Buffer.from(bytes));
  });

  app.post("/api/v1/agreements/:address/milestones/:id/manifests", async (req) => {
    const s = session(req);
    limit(writeLimit, s.wallet);
    const p = parse(milestoneParam, req.params);
    const body = parse(
      z.object({
        files: z.array(z.object({ fileId: z.string().uuid(), requirementKey: z.string().max(80).optional() }).strict()).min(1).max(50),
        declaredDate: z.string().max(40).optional(),
        description: z.string().max(500).optional(),
      }).strict(),
      req.body
    );
    const row = agreementOf(p.address);
    return createManifest(ctx, row, { wallet: s.wallet, milestoneId: p.id as 0 | 1, ...body });
  });

  app.get("/api/v1/agreements/:address/milestones/:id/evidence", async (req) => {
    const p = parse(milestoneParam, req.params);
    const row = agreementOf(p.address);
    participant(row, req);
    const meta = loadMetadata(ctx, row);
    const manifest = latestManifest(ctx, row.address, p.id);
    const provided = new Set(manifest ? manifestRequirementKeys(manifest.manifest_text) : []);
    return {
      files: listFiles(ctx, row.address),
      manifests: listManifests(ctx, row.address, p.id),
      checklist: (meta ? requirementsOf(meta.meta, p.id as 0 | 1) : []).map((r) => ({ ...r, satisfied: provided.has(r.key) })),
    };
  });

  // ------------------------------------------------------------ review and research
  app.post("/api/v1/agreements/:address/milestones/:id/reviews", async (req, reply) => {
    const s = session(req);
    limit(reviewLimit, s.wallet);
    const p = parse(milestoneParam, req.params);
    const body = parse(z.object({ manifestHash: hex32 }).strict(), req.body);
    const row = agreementOf(p.address);
    const { review, created } = await requestReview(ctx, row, p.id as 0 | 1, s.wallet, body.manifestHash);
    return reply.status(created ? 201 : 200).send(review);
  });

  app.get("/api/v1/agreements/:address/milestones/:id/reviews", async (req) => {
    const p = parse(milestoneParam, req.params);
    const q = parse(z.object({ manifestHash: hex32.optional() }), req.query);
    const row = agreementOf(p.address);
    participant(row, req);
    if (q.manifestHash) {
      const r = findReview(ctx, row.address, p.id, q.manifestHash);
      return { reviews: r ? [r] : [] };
    }
    return { reviews: listReviews(ctx, row.address, p.id) };
  });

  app.get("/api/v1/agreements/:address/milestones/:id/research-runs", async (req) => {
    const p = parse(milestoneParam, req.params);
    const row = agreementOf(p.address);
    participant(row, req);
    return { runs: listResearchRuns(ctx, row.address, p.id) };
  });

  // ------------------------------------------------------------ approvals
  app.post("/api/v1/agreements/:address/milestones/:id/approval-payloads", async (req) => {
    const s = session(req);
    limit(writeLimit, s.wallet);
    const p = parse(milestoneParam, req.params);
    const body = parse(z.object({ evidenceHash: hex32.optional() }).strict(), req.body ?? {});
    const row = agreementOf(p.address);
    return prepareApprovalPayload(ctx, row.address, p.id as 0 | 1, s.wallet, body.evidenceHash);
  });

  app.post("/api/v1/agreements/:address/milestones/:id/approval-signatures", async (req, reply) => {
    const s = session(req);
    limit(writeLimit, s.wallet);
    const p = parse(milestoneParam, req.params);
    const body = parse(z.object({ payloadHash: hex32, signature: z.string().min(1).max(4000) }).strict(), req.body);
    const row = agreementOf(p.address);
    const stored = await submitApprovalSignature(ctx, row.address, p.id as 0 | 1, s.wallet, body);
    return reply.status(201).send(stored);
  });

  app.get("/api/v1/agreements/:address/milestones/:id/approvals", async (req) => {
    const p = parse(milestoneParam, req.params);
    const row = agreementOf(p.address);
    participant(row, req);
    return getApprovalState(ctx, row.address, p.id as 0 | 1);
  });

  (app as unknown as { routeList: typeof routes }).routeList = routes;
  return app;
}

export { unauthorized };
