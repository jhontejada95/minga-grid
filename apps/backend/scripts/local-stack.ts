/**
 * Local development stack for exercising the whole product without spending anything:
 *   anvil (chain 31337) + the real MockUSD and AgreementFactoryRegistry + the real backend (real clock, real indexer).
 *
 * It listens on ports that do not collide with the HSK testnet setup (anvil 8545, API 4100) and seeds two agreements
 * so the UI has data. The anvil development mnemonic is public; nothing here ever touches a real network or a real key.
 *
 * Run from the repo root:  npm run local:stack --workspace=@minga/backend
 * Then point the frontend at it with the env file written to .local-stack/frontend.env (see docs/local-stack.md).
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig, REPO_ROOT } from "../src/config.js";
import { createViemChainReader } from "../src/chain.js";
import { migrate, openDb } from "../src/db.js";
import { Indexer } from "../src/indexer.js";
import { buildApp } from "../src/server.js";
import type { AppContext } from "../src/context.js";
import { CHAIN_ID, DEMO_METADATA, acceptAndFund, call, createAgreementOnChain, login, startHarness } from "../test/helpers/harness.js";

const ANVIL_PORT = 8545;
const API_PORT = 4100;
const FRONTEND_PORT = 3100;

async function main() {
  const dir = path.join(REPO_ROOT, ".local-stack");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const h = await startHarness({ port: ANVIL_PORT });
  if (!h) throw new Error("anvil was not found. Install Foundry (see .claude/CLAUDE.md) or set ANVIL_BIN.");
  const rpc = h.rpcUrl;

  const config = loadConfig({
    NODE_ENV: "development",
    PORT: String(API_PORT),
    HOST: "127.0.0.1",
    FRONTEND_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
    SESSION_SECRET: "local-stack-session-secret-local-stack-1234567890",
    HSK_RPC_URL: rpc,
    HSK_CHAIN_ID: String(CHAIN_ID),
    FACTORY_ADDRESS: h.factory,
    FACTORY_DEPLOYMENT_BLOCK: String(h.deployBlock),
    MOCK_USD_ADDRESS: h.token,
    DATABASE_PATH: path.join(dir, "local.sqlite"),
    EVIDENCE_STORAGE_PATH: path.join(dir, "evidence"),
    INDEXER_POLL_MS: "1000",
    INDEXER_CONFIRMATIONS: "1",
    INDEXER_MAX_RANGE: "200",
    INDEXER_REORG_WINDOW: "8",
    AI_PROVIDER: "none",
    MPP_ENABLED: "false",
  });
  const db = openDb(config.dbPath);
  migrate(db);
  const ctx: AppContext = {
    config, db,
    chain: createViemChainReader({ rpcUrl: rpc, chainId: CHAIN_ID }),
    now: () => Date.now(),
    log: { info: (m, e) => console.log(m, e ?? ""), warn: (m, e) => console.warn(m, e ?? "") },
  };
  const app = await buildApp(ctx);
  const indexer = new Indexer(ctx);
  await app.listen({ port: API_PORT, host: "127.0.0.1" });
  indexer.start();

  // Anvil mines only on demand, so a background miner keeps block time moving like a real chain.
  const miner = setInterval(() => { void h.mine(1).catch(() => {}); }, 2000);

  // Seed: A is funded and ready for milestone work, B waits for acceptance. Both created through the real API and contracts.
  const funderCookie = await login(app, ctx, h.accounts.funder);
  const seed = async (name: string, fund: boolean) => {
    const draft = await call(app, "POST", "/api/v1/agreement-drafts", { cookie: funderCookie, origin: config.allowedOrigins[0], body: { metadata: { ...DEMO_METADATA, name } } });
    if (draft.status !== 200) throw new Error(`draft failed: ${JSON.stringify(draft.json)}`);
    const address = await createAgreementOnChain(h, draft.json, { executionDeadline: (await h.chainNow()) + 7n * 86_400n, fundingDeadline: (await h.chainNow()) + 3n * 86_400n });
    if (fund) await acceptAndFund(h, address);
    return address;
  };
  const agreementA = await seed("Pacific Mangrove — Agreement A (funded)", true);
  const agreementB = await seed("Andean Wetlands — Agreement B (awaiting acceptance)", false);

  const wallets = Object.fromEntries(Object.entries(h.accounts).map(([k, v]) => [k, v.address]));
  const frontendEnv = [
    `NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`,
    `NEXT_PUBLIC_RPC_URL=${rpc}`,
    `NEXT_PUBLIC_API_BASE_URL=http://localhost:${API_PORT}`,
    `NEXT_PUBLIC_FACTORY_ADDRESS=${h.factory}`,
    `NEXT_PUBLIC_MOCK_USD_ADDRESS=${h.token}`,
    `NEXT_PUBLIC_EXPLORER_URL=http://localhost:${FRONTEND_PORT}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "frontend.env"), frontendEnv);
  fs.writeFileSync(path.join(dir, "stack.json"), JSON.stringify({ rpc, api: `http://localhost:${API_PORT}`, frontend: `http://localhost:${FRONTEND_PORT}`, factory: h.factory, token: h.token, agreementA, agreementB, wallets }, null, 2));
  console.log(`LOCAL STACK READY  rpc=${rpc}  api=http://localhost:${API_PORT}  A=${agreementA}  B=${agreementB}`);

  const shutdown = async () => {
    clearInterval(miner);
    indexer.stop();
    await app.close();
    db.close();
    h.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  // The anvil child is not tied to this process; stop it so a retry can bind the same port.
  process.exit(1);
});
