import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { ChainReader } from "./chain.js";
import type { PaymentClient } from "./mpp.js";

/** Everything a service needs. Injected so tests can run against a local chain and in-memory SQLite. */
export interface AppContext {
  config: Config;
  db: Db;
  chain: ChainReader;
  /** Wall clock in milliseconds; overridable in tests. */
  now: () => number;
  /** Paid-research client (mppx). Absent when MPP is not configured. */
  payments?: PaymentClient;
  log: { info: (msg: string, extra?: unknown) => void; warn: (msg: string, extra?: unknown) => void };
}
