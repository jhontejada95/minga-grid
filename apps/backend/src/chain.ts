import {
  createPublicClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  agreementFactoryRegistryAbi,
  buildApprovalTypedData,
  conservationAgreementAbi,
  type ApprovalMessage,
} from "@minga/shared";

/** Immutable agreement parameters, read once from the contract. */
export interface AgreementImmutable {
  payer: Address;
  communitySigner: Address;
  verifierSigner: Address;
  token: Address;
  projectRefHash: Hex;
  metadataHash: Hex;
  methodologyHash: Hex;
  payeeCommunity: Address;
  payeeMonitoring: Address;
  communityBps: bigint;
  milestoneAmounts: readonly [bigint, bigint];
  fundingDeadline: bigint;
  executionDeadline: bigint;
  demoMode: boolean;
  totalBudget: bigint;
  termsHash: Hex;
}

/** Mutable agreement state read at a single block, so all fields are consistent. */
export interface AgreementState {
  communityAccepted: boolean;
  verifierAccepted: boolean;
  funded: boolean;
  fundedAt: bigint;
  refunded: boolean;
  totalPaid: bigint;
  nextMilestoneId: bigint;
  nonces: readonly [bigint, bigint];
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface DecodedEvent {
  address: Address;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  blockHash: Hex;
  txHash: Hex;
  logIndex: number;
}

/**
 * Everything the backend needs from HSK. The real implementation talks to a JSON-RPC node with viem;
 * tests run the same code against a local anvil node with the real contracts.
 */
export interface ChainReader {
  readonly chainId: number;
  getBlockNumber(): Promise<bigint>;
  getBlock(number: bigint): Promise<{ hash: Hex; timestamp: bigint } | null>;
  getLatestTimestamp(): Promise<bigint>;
  getEvents(p: { addresses: Address[]; fromBlock: bigint; toBlock: bigint }): Promise<DecodedEvent[]>;
  readAgreementImmutable(address: Address, atBlock?: bigint): Promise<AgreementImmutable>;
  readAgreementState(address: Address): Promise<AgreementState>;
  verifyApprovalSignature(p: {
    agreement: Address;
    signer: Address;
    message: ApprovalMessage;
    signature: Hex;
  }): Promise<boolean>;
  verifyPersonalMessage(p: { address: Address; message: string; signature: Hex }): Promise<boolean>;
}

const EVENT_ABI = [...agreementFactoryRegistryAbi, ...conservationAgreementAbi] as const;

export function createViemChainReader(opts: { rpcUrl: string; chainId: number }): ChainReader {
  // cacheTime: 0 is essential. viem caches getBlockNumber for a few seconds by default, which would make
  // the indexer and the "refresh before signing" reads see a stale chain head.
  const client: PublicClient = createPublicClient({
    cacheTime: 0,
    transport: http(opts.rpcUrl, { batch: true, retryCount: 2, timeout: 20_000 }),
  });

  const readAgreement = <T>(address: Address, functionName: string, blockNumber: bigint | undefined, args?: readonly unknown[]) =>
    client.readContract({
      address,
      abi: conservationAgreementAbi,
      functionName: functionName as never,
      args: args as never,
      blockNumber,
    }) as Promise<T>;

  return {
    chainId: opts.chainId,

    getBlockNumber: () => client.getBlockNumber(),

    async getBlock(number) {
      try {
        const b = await client.getBlock({ blockNumber: number });
        return { hash: b.hash, timestamp: b.timestamp };
      } catch {
        return null;
      }
    },

    async getLatestTimestamp() {
      return (await client.getBlock({ blockTag: "latest" })).timestamp;
    },

    async getEvents({ addresses, fromBlock, toBlock }) {
      if (addresses.length === 0) return [];
      const logs = await client.getLogs({ address: addresses, fromBlock, toBlock });
      const parsed = parseEventLogs({ abi: EVENT_ABI, logs, strict: false });
      const out: DecodedEvent[] = [];
      for (const l of parsed) {
        if (l.removed || l.blockHash == null || l.blockNumber == null || l.transactionHash == null || l.logIndex == null) continue;
        out.push({
          address: l.address,
          eventName: l.eventName as string,
          args: (l.args ?? {}) as Record<string, unknown>,
          blockNumber: l.blockNumber,
          blockHash: l.blockHash,
          txHash: l.transactionHash,
          logIndex: l.logIndex,
        });
      }
      return out;
    },

    async readAgreementImmutable(address, atBlock) {
      const r = <T>(fn: string) => readAgreement<T>(address, fn, atBlock);
      const [
        payer, communitySigner, verifierSigner, token, projectRefHash, metadataHash, methodologyHash,
        payeeCommunity, payeeMonitoring, communityBps, amounts, fundingDeadline, executionDeadline,
        demoMode, totalBudget, termsHash,
      ] = await Promise.all([
        r<Address>("payer"), r<Address>("communitySigner"), r<Address>("verifierSigner"), r<Address>("token"),
        r<Hex>("projectRefHash"), r<Hex>("metadataHash"), r<Hex>("methodologyHash"),
        r<Address>("payeeCommunity"), r<Address>("payeeMonitoring"), r<bigint>("communityBps"),
        r<readonly [bigint, bigint]>("getMilestoneAmounts"), r<bigint>("fundingDeadline"), r<bigint>("executionDeadline"),
        r<boolean>("demoMode"), r<bigint>("totalBudget"), r<Hex>("termsHash"),
      ]);
      return {
        payer, communitySigner, verifierSigner, token, projectRefHash, metadataHash, methodologyHash,
        payeeCommunity, payeeMonitoring, communityBps, milestoneAmounts: [amounts[0], amounts[1]] as const,
        fundingDeadline, executionDeadline, demoMode, totalBudget, termsHash,
      };
    },

    async readAgreementState(address) {
      // Pin every read to one block so the snapshot is internally consistent.
      const blockNumber = await client.getBlockNumber();
      const block = await client.getBlock({ blockNumber });
      const r = <T>(fn: string, args?: readonly unknown[]) => readAgreement<T>(address, fn, blockNumber, args);
      const [communityAccepted, verifierAccepted, funded, fundedAt, refunded, totalPaid, nextMilestoneId, nonce0, nonce1] =
        await Promise.all([
          r<boolean>("communityAccepted"), r<boolean>("verifierAccepted"), r<boolean>("funded"), r<bigint>("fundedAt"),
          r<boolean>("refunded"), r<bigint>("totalPaid"), r<bigint>("nextMilestoneId"),
          r<bigint>("milestoneNonce", [0n]), r<bigint>("milestoneNonce", [1n]),
        ]);
      return {
        communityAccepted, verifierAccepted, funded, fundedAt, refunded, totalPaid, nextMilestoneId,
        nonces: [nonce0, nonce1] as const, blockNumber, blockTimestamp: block.timestamp,
      };
    },

    async verifyApprovalSignature({ agreement, signer, message, signature }) {
      try {
        const td = buildApprovalTypedData(opts.chainId, agreement, message);
        return await client.verifyTypedData({
          address: signer,
          signature,
          domain: td.domain,
          types: td.types,
          primaryType: td.primaryType,
          message: { ...td.message },
        });
      } catch {
        return false;
      }
    },

    async verifyPersonalMessage({ address, message, signature }) {
      try {
        return await client.verifyMessage({ address, message, signature });
      } catch {
        return false;
      }
    },
  };
}

/** Recursively converts bigint to decimal strings so values can be stored/returned as JSON. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}
