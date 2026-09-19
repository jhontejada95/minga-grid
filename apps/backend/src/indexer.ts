import type { Address } from "viem";
import type { AppContext } from "./context.js";
import { jsonSafe, type DecodedEvent } from "./chain.js";
import { all, get, run, tx } from "./db.js";
import { discoverAgreement, refreshAgreementState } from "./agreements.js";

const AGREEMENT_ADDRESS_CHUNK = 50;

export interface SyncReport {
  fromBlock: number;
  toBlock: number;
  headBlock: number;
  events: number;
  newAgreements: number;
  reorgRolledBackTo: number | null;
}

const getState = (ctx: AppContext, key: string) =>
  get<{ value: string }>(ctx.db, "SELECT value FROM indexer_state WHERE key = ?", key)?.value;

const setState = (ctx: AppContext, key: string, value: string | number) =>
  run(
    ctx.db,
    "INSERT INTO indexer_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    String(value)
  );

/**
 * Event indexer with bounded log ranges, a persistent cursor and a small replay window for reorgs.
 * It discovers agreements from factory events, then backfills each agreement's own logs.
 * Ingestion is idempotent: a unique key per log makes replays and restarts harmless.
 */
export class Indexer {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly ctx: AppContext) {}

  start(): void {
    if (this.timer || !this.ctx.config.indexer.enabled) return;
    const tick = () => {
      this.syncOnce().catch((err) => this.ctx.log.warn(`Indexer pass failed: ${err instanceof Error ? err.message : String(err)}`));
    };
    tick();
    this.timer = setInterval(tick, this.ctx.config.indexer.pollMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One full catch-up pass. Safe to call repeatedly; overlapping calls are skipped. */
  async syncOnce(): Promise<SyncReport | undefined> {
    const { ctx } = this;
    const factory = ctx.config.chain.factory;
    if (!factory || this.running) return undefined;
    this.running = true;
    try {
      const head = Number(await ctx.chain.getBlockNumber());
      setState(ctx, "head", head);

      const startBlock = ctx.config.chain.factoryDeploymentBlock;
      let cursor = Number(getState(ctx, "cursor") ?? startBlock - 1);
      const rolledBackTo = await this.handleReorg(cursor);
      if (rolledBackTo !== null) cursor = rolledBackTo;

      const report: SyncReport = {
        fromBlock: cursor + 1, toBlock: cursor, headBlock: head, events: 0, newAgreements: 0, reorgRolledBackTo: rolledBackTo,
      };

      while (cursor < head) {
        const from = cursor + 1;
        const to = Math.min(from + ctx.config.indexer.maxRange - 1, head);
        const touched = new Set<string>();

        // 1) factory events first, so agreements created in this range are known before their own logs.
        const factoryEvents = await ctx.chain.getEvents({ addresses: [factory], fromBlock: BigInt(from), toBlock: BigInt(to) });
        await this.store(factoryEvents);
        for (const ev of factoryEvents) {
          if (ev.eventName !== "AgreementCreated") continue;
          const before = get(ctx.db, "SELECT 1 FROM agreement_cache WHERE address = ?", String(ev.args.agreementAddress).toLowerCase());
          const row = await discoverAgreement(ctx, ev);
          if (row && !before) report.newAgreements += 1;
          if (row) touched.add(row.address);
        }

        // 2) each known agreement's own events.
        const agreements = all<{ address: string }>(ctx.db, "SELECT address FROM agreement_cache").map((r) => r.address as Address);
        for (let i = 0; i < agreements.length; i += AGREEMENT_ADDRESS_CHUNK) {
          const chunk = agreements.slice(i, i + AGREEMENT_ADDRESS_CHUNK);
          const events = await ctx.chain.getEvents({ addresses: chunk, fromBlock: BigInt(from), toBlock: BigInt(to) });
          await this.store(events);
          for (const ev of events) touched.add(ev.address.toLowerCase());
          report.events += events.length;
        }
        report.events += factoryEvents.length;

        for (const address of touched) await refreshAgreementState(ctx, address);

        await this.recordBlocks(from, to);
        cursor = to;
        setState(ctx, "cursor", cursor);
        report.toBlock = cursor;
      }

      setState(ctx, "updated_at", ctx.now());
      return report;
    } finally {
      this.running = false;
    }
  }

  /** Stores events (idempotently) together with their block timestamp. */
  private async store(events: DecodedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const { ctx } = this;
    const stamps = new Map<bigint, number>();
    for (const ev of events) {
      if (!stamps.has(ev.blockNumber)) {
        const b = await ctx.chain.getBlock(ev.blockNumber);
        stamps.set(ev.blockNumber, b ? Number(b.timestamp) : 0);
      }
    }
    tx(ctx.db, () => {
      for (const ev of events) {
        const contract = ev.address.toLowerCase();
        run(
          ctx.db,
          `INSERT OR IGNORE INTO indexed_events
             (id, chain_id, contract, tx_hash, log_index, block_number, block_hash, block_timestamp, event_name, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `${ctx.chain.chainId}:${ev.txHash.toLowerCase()}:${ev.logIndex}`,
          ctx.chain.chainId,
          contract,
          ev.txHash.toLowerCase(),
          ev.logIndex,
          Number(ev.blockNumber),
          ev.blockHash.toLowerCase(),
          stamps.get(ev.blockNumber) ?? 0,
          ev.eventName,
          JSON.stringify(jsonSafe(ev.args))
        );
      }
    });
  }

  /** Remembers the hashes of the most recent processed blocks so a later reorg can be detected. */
  private async recordBlocks(from: number, to: number): Promise<void> {
    const { ctx } = this;
    const window = ctx.config.indexer.reorgWindow;
    for (let n = Math.max(from, to - window + 1); n <= to; n++) {
      const b = await ctx.chain.getBlock(BigInt(n));
      if (b) run(ctx.db, "INSERT OR REPLACE INTO indexer_blocks (number, hash) VALUES (?, ?)", n, b.hash.toLowerCase());
    }
    run(ctx.db, "DELETE FROM indexer_blocks WHERE number <= ?", to - window * 2);
  }

  /**
   * Compares stored block hashes with the chain. If the tip changed, rolls back everything after the
   * last block that still matches (events and block hashes) so it is re-ingested. Returns the new
   * cursor, or null when nothing was rolled back.
   */
  private async handleReorg(cursor: number): Promise<number | null> {
    const { ctx } = this;
    const recent = all<{ number: number; hash: string }>(
      ctx.db,
      "SELECT number, hash FROM indexer_blocks WHERE number <= ? ORDER BY number DESC LIMIT ?",
      cursor,
      ctx.config.indexer.reorgWindow
    );
    if (recent.length === 0) return null;

    let fork: number | null = null;
    for (const r of recent) {
      const b = await ctx.chain.getBlock(BigInt(r.number));
      if (b && b.hash.toLowerCase() === r.hash) {
        fork = r.number;
        break;
      }
    }
    if (fork === recent[0]!.number) return null; // tip still matches: no reorg

    const target = fork ?? Math.max(ctx.config.chain.factoryDeploymentBlock - 1, (recent.at(-1)?.number ?? cursor) - 1);
    ctx.log.warn(`Reorg detected: rolling back indexed data to block ${target}`);
    tx(ctx.db, () => {
      run(ctx.db, "DELETE FROM indexed_events WHERE block_number > ?", target);
      run(ctx.db, "DELETE FROM indexer_blocks WHERE number > ?", target);
      setState(ctx, "cursor", target);
    });
    // Agreements created in orphaned blocks are removed only if nothing depends on them; otherwise they
    // are kept and simply re-confirmed if the creation is re-mined.
    const orphaned = all<{ address: string }>(ctx.db, "SELECT address FROM agreement_cache WHERE created_block > ?", target);
    for (const { address } of orphaned) {
      const dependents =
        get(ctx.db, "SELECT 1 FROM evidence_files WHERE agreement = ? LIMIT 1", address) ||
        get(ctx.db, "SELECT 1 FROM evidence_manifests WHERE agreement = ? LIMIT 1", address);
      if (!dependents) {
        run(ctx.db, "UPDATE agreement_drafts SET matched_agreement = NULL WHERE matched_agreement = ?", address);
        run(ctx.db, "DELETE FROM agreement_cache WHERE address = ?", address);
      } else {
        ctx.log.warn("Agreement created in an orphaned block has stored evidence; keeping it", { address });
      }
    }
    return target;
  }
}

export interface ActivityEventDto {
  id: string;
  type: string;
  actor?: string;
  txHash: string;
  blockNumber: number;
  at: string | null;
  confirmed: boolean;
  details: Record<string, unknown>;
}

/** Confirmed and pending on-chain history of one agreement, newest first. */
export function getActivity(ctx: AppContext, address: string, page = 1, pageSize = 50): { items: ActivityEventDto[]; total: number } {
  const factory = ctx.config.chain.factory?.toLowerCase() ?? "";
  // Event args keep viem's checksummed addresses, so compare case-insensitively.
  const where = "(contract = ? OR (contract = ? AND lower(json_extract(data_json, '$.agreementAddress')) = ?))";
  const total = get<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM indexed_events WHERE ${where}`, address, factory, address)?.n ?? 0;
  const rows = all<{
    id: string; tx_hash: string; block_number: number; block_timestamp: number; event_name: string; data_json: string;
  }>(
    ctx.db,
    `SELECT id, tx_hash, block_number, block_timestamp, event_name, data_json FROM indexed_events WHERE ${where}
     ORDER BY block_number DESC, log_index DESC LIMIT ? OFFSET ?`,
    address, factory, address, pageSize, (page - 1) * pageSize
  );
  const head = Number(getState(ctx, "head") ?? 0);
  const confirmations = ctx.config.indexer.confirmations;
  return {
    total,
    items: rows.map((r) => {
      const data = JSON.parse(r.data_json) as Record<string, unknown>;
      return {
        id: r.id,
        type: r.event_name,
        actor: ((data.participant ?? data.payer ?? data.invalidator) as string | undefined)?.toLowerCase(),
        txHash: r.tx_hash,
        blockNumber: r.block_number,
        at: r.block_timestamp ? new Date(r.block_timestamp * 1000).toISOString() : null,
        confirmed: head - r.block_number >= confirmations,
        details: data,
      };
    }),
  };
}
