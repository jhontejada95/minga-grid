import { assertRuntimeConfig, loadConfig, loadEnvFile } from "./config.js";
import { createViemChainReader } from "./chain.js";
import { migrate, openDb } from "./db.js";
import { createMppxPaymentClient, type PaymentClient } from "./mpp.js";
import { Indexer } from "./indexer.js";
import { buildApp } from "./server.js";
import type { AppContext } from "./context.js";

async function main() {
  loadEnvFile();
  const config = loadConfig();
  assertRuntimeConfig(config);

  const db = openDb(config.dbPath);
  const applied = migrate(db);

  let payments: PaymentClient | undefined;
  if (config.mpp.enabled) payments = await createMppxPaymentClient(config);

  const log = {
    info: (msg: string, extra?: unknown) => console.log(msg, extra ?? ""),
    warn: (msg: string, extra?: unknown) => console.warn(msg, extra ?? ""),
  };
  const ctx: AppContext = {
    config,
    db,
    chain: createViemChainReader({ rpcUrl: config.chain.rpcUrl, chainId: config.chain.id }),
    now: () => Date.now(),
    payments,
    log,
  };

  const app = await buildApp(ctx);
  const indexer = new Indexer(ctx);
  await app.listen({ port: config.port, host: config.host });
  indexer.start();

  log.info(
    `MINGA Nature backend listening on http://${config.host}:${config.port} · chain ${config.chain.id} · ` +
      `migrations applied: ${applied.length ? applied.join(",") : "none (up to date)"} · ` +
      `external research: ${config.mpp.enabled ? "enabled" : `off (${config.mpp.disabledReason ?? "MPP_ENABLED=false"})`}`
  );

  const shutdown = async () => {
    indexer.stop();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
