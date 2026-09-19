import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createSiweMessage } from "viem/siwe";
import type { LocalAccount } from "viem/accounts";
import { buildApp } from "../src/server.js";
import { all } from "../src/db.js";
import { anvilAvailable, call, login, makeContext, ORIGIN, startHarness, type Harness, type TestContext } from "./helpers/harness.js";

const skip = anvilAvailable() ? false : "anvil not found (install Foundry or set ANVIL_BIN)";

describe("SIWE login and sessions (brief 14, items 12 and 18)", { skip }, () => {
  let h: Harness;
  let tc: TestContext;
  let app: FastifyInstance;

  before(async () => {
    h = (await startHarness())!;
    tc = makeContext(h);
    app = await buildApp(tc.ctx);
  });
  after(async () => {
    await app?.close();
    tc?.cleanup();
    h?.stop();
  });

  const challenge = async (wallet?: string) => (await call(app, "POST", "/api/v1/auth/challenge", { body: wallet ? { wallet } : {}, origin: null })).json;

  async function signMessage(
    signer: LocalAccount,
    ch: Awaited<ReturnType<typeof challenge>>,
    over: Partial<Parameters<typeof createSiweMessage>[0]> = {}
  ) {
    const message = createSiweMessage({
      address: signer.address, chainId: ch.chainId, domain: ch.domain, nonce: ch.nonce, uri: ch.uri, version: "1",
      statement: ch.statement, issuedAt: new Date(ch.issuedAt), expirationTime: new Date(ch.expirationTime), ...over,
    });
    return { message, signature: await signer.signMessage({ message }) };
  }
  const verify = (body: { message: string; signature: string }) => call(app, "POST", "/api/v1/auth/verify", { body, origin: null });
  const errorCode = (r: { json: any }) => r.json?.error?.code;

  it("logs in with a valid signature and binds the session to the wallet", async () => {
    const cookie = await login(app, tc.ctx, h.accounts.community);
    const me = await call(app, "GET", "/api/v1/auth/me", { cookie });
    assert.equal(me.json.authenticated, true);
    assert.equal(me.json.wallet, h.accounts.community.address.toLowerCase());
    const anon = await call(app, "GET", "/api/v1/auth/me");
    assert.equal(anon.json.authenticated, false);
  });

  it("sets an HttpOnly, SameSite session cookie", async () => {
    const ch = await challenge();
    const res = await verify(await signMessage(h.accounts.funder, ch));
    assert.equal(res.status, 200);
    const setCookie = String(res.headers["set-cookie"]);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//);
  });

  it("stores only a hash of the session id", async () => {
    const cookie = await login(app, tc.ctx, h.accounts.reviewer);
    const id = cookie.split("=")[1]!;
    const rows = all<{ id_hash: string }>(tc.ctx.db, "SELECT id_hash FROM sessions");
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash) && r.id_hash !== id));
  });

  it("rejects replay of a used challenge", async () => {
    const ch = await challenge();
    const signed = await signMessage(h.accounts.funder, ch);
    assert.equal((await verify(signed)).status, 200);
    const replay = await verify(signed);
    assert.equal(replay.status, 401);
    assert.equal(errorCode(replay), "LOGIN_CHALLENGE_INVALID");
  });

  it("rejects an unknown nonce", async () => {
    const ch = await challenge();
    const forged = await signMessage(h.accounts.funder, { ...ch, nonce: "forgednonce12345" });
    assert.equal(errorCode(await verify(forged)), "LOGIN_CHALLENGE_INVALID");
  });

  it("rejects a message issued for another domain, origin or chain", async () => {
    let ch = await challenge();
    assert.equal(errorCode(await verify(await signMessage(h.accounts.funder, ch, { domain: "evil.example" }))), "LOGIN_DOMAIN_MISMATCH");
    ch = await challenge();
    assert.equal(errorCode(await verify(await signMessage(h.accounts.funder, ch, { uri: "http://evil.example" }))), "LOGIN_URI_MISMATCH");
    ch = await challenge();
    assert.equal(errorCode(await verify(await signMessage(h.accounts.funder, ch, { chainId: 1 }))), "LOGIN_WRONG_CHAIN");
  });

  it("rejects an expired challenge", async () => {
    const ch = await challenge();
    const signed = await signMessage(h.accounts.funder, ch);
    tc.clock.advance(tc.ctx.config.challengeTtlMs + 5_000);
    assert.equal(errorCode(await verify(signed)), "LOGIN_CHALLENGE_EXPIRED");
  });

  it("rejects a message that outlives its challenge or comes from the future", async () => {
    let ch = await challenge();
    const long = await signMessage(h.accounts.funder, ch, { expirationTime: new Date(Date.parse(ch.expirationTime) + 3_600_000) });
    assert.equal(errorCode(await verify(long)), "LOGIN_MESSAGE_TOO_LONG_LIVED");
    ch = await challenge();
    const future = await signMessage(h.accounts.funder, ch, { issuedAt: new Date(tc.clock.now + 600_000) });
    assert.equal(errorCode(await verify(future)), "LOGIN_MESSAGE_FROM_FUTURE");
  });

  it("rejects an account other than the one the challenge was requested for", async () => {
    const ch = await challenge(h.accounts.funder.address);
    const other = await signMessage(h.accounts.outsider, ch);
    assert.equal(errorCode(await verify(other)), "LOGIN_ACCOUNT_MISMATCH");
  });

  it("rejects a signature by a different key and does not burn the nonce", async () => {
    const ch = await challenge();
    const good = await signMessage(h.accounts.funder, ch);
    const forged = { message: good.message, signature: (await h.accounts.outsider.signMessage({ message: good.message })) };
    assert.equal(errorCode(await verify(forged)), "LOGIN_BAD_SIGNATURE");
    assert.equal((await verify(good)).status, 200);
  });

  it("accepts a nonce only once when verifications race", async () => {
    const ch = await challenge();
    const signed = await signMessage(h.accounts.funder, ch);
    const results = await Promise.all([verify(signed), verify(signed), verify(signed)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401, 401]);
  });

  it("expires sessions", async () => {
    const cookie = await login(app, tc.ctx, h.accounts.funder);
    assert.equal((await call(app, "GET", "/api/v1/auth/me", { cookie })).json.authenticated, true);
    tc.clock.advance(tc.ctx.config.sessionTtlMs + 1_000);
    assert.equal((await call(app, "GET", "/api/v1/auth/me", { cookie })).json.authenticated, false);
  });

  it("logout invalidates the session", async () => {
    const cookie = await login(app, tc.ctx, h.accounts.funder);
    assert.equal((await call(app, "POST", "/api/v1/auth/logout", { cookie })).status, 200);
    assert.equal((await call(app, "GET", "/api/v1/auth/me", { cookie })).json.authenticated, false);
  });

  it("blocks cross-site state changes: Origin is required and checked when a session cookie is sent", async () => {
    const cookie = await login(app, tc.ctx, h.accounts.funder);
    const evil = await call(app, "POST", "/api/v1/auth/logout", { cookie, origin: "http://evil.example" });
    assert.equal(evil.status, 403);
    assert.equal(errorCode(evil), "ORIGIN_NOT_ALLOWED");
    const missing = await call(app, "POST", "/api/v1/auth/logout", { cookie, origin: null });
    assert.equal(missing.status, 403);
    assert.equal(errorCode(missing), "ORIGIN_REQUIRED");
    const fine = await call(app, "POST", "/api/v1/auth/logout", { cookie, origin: ORIGIN });
    assert.equal(fine.status, 200);
  });

  it("does not echo CORS credentials to unknown origins", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/api/v1/auth/me", headers: { origin: "http://evil.example", "access-control-request-method": "GET" } });
    assert.notEqual(res.headers["access-control-allow-origin"], "http://evil.example");
  });

  it("rate limits challenge creation per client", async () => {
    const own = makeContext(h);
    const limited = await buildApp(own.ctx);
    let last = 0;
    for (let i = 0; i < 35; i++) last = (await call(limited, "POST", "/api/v1/auth/challenge", { body: {}, origin: null })).status;
    assert.equal(last, 429);
    await limited.close();
    own.cleanup();
  });

  it("validates request bodies", async () => {
    assert.equal((await call(app, "POST", "/api/v1/auth/verify", { body: { message: "x" }, origin: null })).status, 400);
    assert.equal((await call(app, "POST", "/api/v1/auth/verify", { body: { message: "not a siwe message", signature: "0x00" }, origin: null })).status, 400);
    assert.equal((await call(app, "POST", "/api/v1/auth/challenge", { body: { wallet: "nope" }, origin: null })).status, 400);
  });
});
