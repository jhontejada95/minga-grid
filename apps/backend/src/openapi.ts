type Access = "public" | "session" | "participant" | "community" | "signer";

interface RouteDoc {
  method: "get" | "post";
  /** Fastify style (`:param`), converted to OpenAPI style when rendered. */
  path: string;
  summary: string;
  access: Access;
  tag: string;
  body?: Record<string, unknown>;
  multipart?: boolean;
}

const hash32 = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" };

/** Single source of truth for the documented surface. A test asserts it matches the registered routes. */
export const ROUTE_DOCS: RouteDoc[] = [
  { method: "get", path: "/health", summary: "Service status and indexer freshness. Exposes no secrets.", access: "public", tag: "Meta" },
  { method: "get", path: "/api/v1/config", summary: "Public chain configuration, contract addresses, deployment block and feature flags (including why external research is unavailable).", access: "public", tag: "Meta" },
  { method: "get", path: "/api/v1/openapi.json", summary: "This document.", access: "public", tag: "Meta" },
  { method: "post", path: "/api/v1/auth/challenge", summary: "Create a single-use, short-lived Sign-In with Ethereum challenge. The server fixes domain, URI, chain ID and lifetime.", access: "public", tag: "Auth", body: { wallet: { type: "string", description: "Optional: bind the challenge to this address." } } },
  { method: "post", path: "/api/v1/auth/verify", summary: "Verify the signed SIWE message, consume the nonce atomically and open an HttpOnly session cookie.", access: "public", tag: "Auth", body: { message: { type: "string" }, signature: { type: "string" } } },
  { method: "post", path: "/api/v1/auth/logout", summary: "End the session.", access: "public", tag: "Auth" },
  { method: "get", path: "/api/v1/auth/me", summary: "Current authenticated wallet, if any.", access: "public", tag: "Auth" },
  { method: "post", path: "/api/v1/agreement-drafts", summary: "Store the exact public metadata bytes for a proposed agreement and return the hashes to pass to createAgreement.", access: "session", tag: "Agreements", body: { metadata: { type: "object" }, proposedParameters: { type: "object" } } },
  { method: "get", path: "/api/v1/agreements", summary: "Paginated agreements registered by the factory (from indexed events). Filters: status, demo, q, mine.", access: "public", tag: "Agreements" },
  { method: "get", path: "/api/v1/agreements/:address", summary: "Agreement detail adapted to the caller's on-chain role. Add ?refresh=true to re-read state from the chain first.", access: "public", tag: "Agreements" },
  { method: "get", path: "/api/v1/agreements/:address/activity", summary: "Paginated confirmed and pending on-chain history.", access: "public", tag: "Agreements" },
  { method: "get", path: "/api/v1/agreements/:address/evidence/files", summary: "List uploaded evidence files.", access: "participant", tag: "Evidence" },
  { method: "post", path: "/api/v1/agreements/:address/evidence/files", summary: "Upload one text or JSON evidence file (multipart). Community representative only.", access: "community", tag: "Evidence", multipart: true },
  { method: "get", path: "/api/v1/evidence/files/:id", summary: "Download a stored file (always served as an attachment, hash re-verified).", access: "participant", tag: "Evidence" },
  { method: "post", path: "/api/v1/agreements/:address/milestones/:id/manifests", summary: "Freeze uploaded files into an immutable manifest version. Community representative only. Identical content returns the existing version.", access: "community", tag: "Evidence", body: { files: { type: "array", items: { type: "object", properties: { fileId: { type: "string", format: "uuid" }, requirementKey: { type: "string" } } } }, declaredDate: { type: "string" }, description: { type: "string" } } },
  { method: "get", path: "/api/v1/agreements/:address/milestones/:id/evidence", summary: "Files, manifest versions (with the exact hashed bytes) and checklist progress.", access: "participant", tag: "Evidence" },
  { method: "post", path: "/api/v1/agreements/:address/milestones/:id/reviews", summary: "Run the deterministic document check on a stored manifest. Repeating the request returns the stored review and never repeats a paid action.", access: "participant", tag: "Review", body: { manifestHash: hash32 } },
  { method: "get", path: "/api/v1/agreements/:address/milestones/:id/reviews", summary: "Stored reviews for a milestone.", access: "participant", tag: "Review" },
  { method: "get", path: "/api/v1/agreements/:address/milestones/:id/research-runs", summary: "External research history: spend, sources and receipt references.", access: "participant", tag: "Review" },
  { method: "post", path: "/api/v1/agreements/:address/milestones/:id/approval-payloads", summary: "Prepare or return the shared EIP-712 payload for the current nonce and evidence version. Times come from chain time.", access: "signer", tag: "Approvals", body: { evidenceHash: hash32 } },
  { method: "post", path: "/api/v1/agreements/:address/milestones/:id/approval-signatures", summary: "Store a signature after proving it valid for the stored payload, the authenticated wallet and its on-chain role.", access: "signer", tag: "Approvals", body: { payloadHash: hash32, signature: { type: "string" } } },
  { method: "get", path: "/api/v1/agreements/:address/milestones/:id/approvals", summary: "Current payload, signatures, stale history and, when executable, the exact release() arguments.", access: "participant", tag: "Approvals" },
];

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z]+)/g, "{$1}");

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTE_DOCS) {
    const parameters = [...r.path.matchAll(/:([A-Za-z]+)/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: m[1] === "id" && r.path.includes("milestones") ? { type: "integer", enum: [0, 1] } : { type: "string" },
    }));
    const secured = r.access !== "public";
    const op: Record<string, unknown> = {
      tags: [r.tag],
      summary: r.summary,
      description: `Access: ${r.access}.`,
      parameters,
      responses: {
        "200": { description: "OK" },
        "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        ...(secured
          ? {
              "401": { description: "Not signed in", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
              "403": { description: "Not allowed for this wallet's role", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            }
          : {}),
      },
      ...(secured ? { security: [{ cookieAuth: [] }] } : {}),
    };
    if (r.body) {
      op.requestBody = { required: true, content: { "application/json": { schema: { type: "object", properties: r.body } } } };
    }
    if (r.multipart) {
      op.requestBody = {
        required: true,
        content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } },
      };
    }
    (paths[toOpenApiPath(r.path)] ??= {})[r.method] = op;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "MINGA Nature API",
      version: "1.0.0",
      description:
        "Standalone backend for evidence, review, sign-in and event indexing. It cannot move funds or sign for anyone: milestone payments happen only through wallet transactions on HSK. Token amounts are decimal strings in base units; timestamps are UTC ISO 8601.",
    },
    servers: [{ url: "http://localhost:4000" }],
    tags: ["Meta", "Auth", "Agreements", "Evidence", "Review", "Approvals"].map((name) => ({ name })),
    components: {
      securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "minga_session" } },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } },
        },
      },
    },
    paths,
  };
}
