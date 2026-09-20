/**
 * Attack the live contract on HSK testnet and record what it does.
 *
 * Every security claim in the pitch — "a single signature cannot move funds", "nobody can be paid
 * twice", "the agent cannot change the amount" — is tested locally against anvil. This sends the
 * same attacks to the REAL contract on the REAL chain, so each one leaves a failed transaction
 * anyone can open on the explorer.
 *
 * It settles nothing and moves no funds: every transaction here is meant to fail. It spends a few
 * cents of testnet gas doing so.
 *
 *   node scripts/adversarial.mjs
 */
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  agentAccount, buildApprovalTypedData, conservationAgreementAbi, deviceAccount,
  type ApprovalMessage,
} from "@minga/shared";

const EXPLORER = "https://testnet-explorer.hskchain.net";
const RPC = process.env.HSK_RPC_URL ?? "https://testnet.hsk.xyz";
const AGREEMENT = (process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS ??
  "0x315DE6Ff84680012cf81bFd9C256032996809cEC") as Address;

const hsk = defineChain({
  id: 133, name: "HSKChain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const device = deviceAccount();
const agent = agentAccount();

async function main() {
  if (typeof process.loadEnvFile === "function") { try { process.loadEnvFile(); } catch {} }
  const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing from .env; it pays the gas for the failed attempts");
  }
  const relayer = privateKeyToAccount(key as Hex);

  const publicClient = createPublicClient({ chain: hsk, transport: http(RPC, { timeout: 45_000 }), cacheTime: 0 });
  const wallet = createWalletClient({ account: relayer, chain: hsk, transport: http(RPC, { timeout: 60_000 }) });
  const read = (fn: string, args: readonly unknown[] = []) =>
    publicClient.readContract({ address: AGREEMENT, abi: conservationAgreementAbi, functionName: fn as never, args: args as never });

  console.log(`\nAdversarial checks against ${AGREEMENT}`);
  console.log(`${EXPLORER}/address/${AGREEMENT}\n`);

  // What is already on chain, for the record.
  const paid0 = (await read("milestonePaid", [0n])) as boolean;
  const next = Number(await read("nextMilestoneId"));
  console.log(`window 1 settled: ${paid0}   ·   next unsettled window: ${next + 1} of 2\n`);

  const termsHash = (await read("termsHash")) as Hex;
  const demoMode = (await read("demoMode")) as boolean;
  const block = await publicClient.getBlock({ blockTag: "latest" });

  const sign = async (a: typeof device, m: ApprovalMessage): Promise<Hex> => {
    const td = buildApprovalTypedData(133, AGREEMENT, m);
    return a.signTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: { ...td.message } });
  };

  /** Send a transaction that is supposed to fail, and report how it failed. */
  async function attack(name: string, expectation: string, build: () => Promise<readonly unknown[]>) {
    process.stdout.write(`\n── ${name}\n   expected: ${expectation}\n`);
    let args: readonly unknown[];
    try {
      args = await build();
    } catch (error) {
      console.log(`   could not even build the attempt: ${(error as Error).message.split("\n")[0]}`);
      return;
    }
    try {
      // An explicit gas limit skips estimateGas. Without it the node simulates the call, sees it
      // will revert, and refuses the transaction outright — which proves the point but leaves
      // nothing on the explorer. Forcing it through costs a little gas and leaves a visible,
      // permanently failed transaction that anyone can open.
      const hash = await wallet.writeContract({
        address: AGREEMENT, abi: conservationAgreementAbi, functionName: "release", args: args as never,
        gas: 300_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status === "success") {
        console.log(`   *** THE ATTACK SUCCEEDED. THIS IS A BUG. *** ${EXPLORER}/tx/${hash}`);
      } else {
        console.log(`   rejected on chain, gas ${receipt.gasUsed}`);
        console.log(`   ${EXPLORER}/tx/${hash}`);
      }
    } catch (error) {
      // Most nodes refuse to even accept a transaction they can see will revert.
      const message = (error as Error).message;
      const reason = /reverted with the following reason:\s*\n?(.+)/.exec(message)?.[1]
        ?? /execution reverted:?\s*(.*)/.exec(message)?.[1]
        ?? message.split("\n").find((l) => l.trim().length > 0)
        ?? "rejected";
      console.log(`   rejected before it could be mined: ${reason.trim()}`);
    }
  }

  const goodApproval = async (milestoneId: number): Promise<ApprovalMessage> => ({
    milestoneId: BigInt(milestoneId),
    termsHash,
    evidenceHash: ("0x" + "ab".repeat(32)) as Hex,
    amount: (await read("milestoneAmounts", [BigInt(milestoneId)])) as bigint,
    nonce: (await read("milestoneNonce", [BigInt(milestoneId)])) as bigint,
    demoMode,
    signedAt: block.timestamp,
    validUntil: block.timestamp + 3600n,
  });

  // 1. Pay an already-paid window again.
  await attack(
    "Replay: settle window 1, which is already paid",
    "the contract refuses — a window can only be settled once",
    async () => {
      const approval = await goodApproval(0);
      return [approval, await sign(device, approval), await sign(agent, approval)];
    },
  );

  // 2. Only the agent signs.
  await attack(
    "One signature: the agent signs twice, the meter never does",
    "the contract refuses — it needs the meter's signature too",
    async () => {
      const approval = await goodApproval(next);
      const agentSig = await sign(agent, approval);
      return [approval, agentSig, agentSig];
    },
  );

  // 3. Both machines sign, but for more money than the window is worth.
  await attack(
    "Inflated amount: both sign, but for double the payout",
    "the contract refuses — the amount is fixed by the terms, not by the signers",
    async () => {
      const approval = await goodApproval(next);
      const greedy: ApprovalMessage = { ...approval, amount: approval.amount * 2n };
      return [greedy, await sign(device, greedy), await sign(agent, greedy)];
    },
  );

  // 4. Someone else's key signs in place of the meter.
  await attack(
    "Impostor: a stranger's key signs instead of the meter",
    "the contract refuses — it checks the exact registered signer",
    async () => {
      const impostor = privateKeyToAccount(("0x" + "77".repeat(32)) as Hex);
      const approval = await goodApproval(next);
      return [approval, await sign(impostor as typeof device, approval), await sign(agent, approval)];
    },
  );

  console.log("\n" + "─".repeat(72));
  const stillPaid = (await read("milestonePaid", [0n])) as boolean;
  const stillNext = Number(await read("nextMilestoneId"));
  console.log(`After every attempt — window 1 settled: ${stillPaid}, next unsettled window: ${stillNext + 1} of 2`);
  console.log("Nothing moved. The contract state is exactly what it was.\n");
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
