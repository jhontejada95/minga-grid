import { hashTypedData, type Address, type Hex } from "viem";
import type { MilestoneApprovalPayload } from "./types.js";

export const EIP712_DOMAIN_NAME = "MingaConservationAgreement";
export const EIP712_DOMAIN_VERSION = "1";

export const milestoneApprovalTypes = {
  MilestoneApproval: [
    { name: "milestoneId", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "signedAt", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "demoMode", type: "bool" },
  ],
} as const;

export function getEIP712Domain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** The exact struct the contract hashes in `release()`, with native bigint values. */
export interface ApprovalMessage {
  milestoneId: bigint;
  termsHash: Hex;
  evidenceHash: Hex;
  amount: bigint;
  nonce: bigint;
  signedAt: bigint;
  validUntil: bigint;
  demoMode: boolean;
}

/** Full typed-data request for `signTypedData` / `verifyTypedData` (viem shape). */
export function buildApprovalTypedData(chainId: number, agreement: Address, message: ApprovalMessage) {
  return {
    domain: getEIP712Domain(chainId, agreement),
    types: milestoneApprovalTypes,
    primaryType: "MilestoneApproval" as const,
    message,
  };
}

/** EIP-712 digest that both participants sign; used as the shared payload identifier. */
export function hashApproval(chainId: number, agreement: Address, message: ApprovalMessage): Hex {
  return hashTypedData(buildApprovalTypedData(chainId, agreement, message));
}

/** JSON-safe transport form (uint256 as decimal strings would also work; the API uses this shape). */
export function approvalToPayload(m: ApprovalMessage): MilestoneApprovalPayload {
  return {
    milestoneId: Number(m.milestoneId),
    termsHash: m.termsHash,
    evidenceHash: m.evidenceHash,
    amount: m.amount.toString(),
    nonce: Number(m.nonce),
    signedAt: Number(m.signedAt),
    validUntil: Number(m.validUntil),
    demoMode: m.demoMode,
  };
}

export function payloadToApproval(p: MilestoneApprovalPayload): ApprovalMessage {
  return {
    milestoneId: BigInt(p.milestoneId),
    termsHash: p.termsHash,
    evidenceHash: p.evidenceHash,
    amount: BigInt(p.amount),
    nonce: BigInt(p.nonce),
    signedAt: BigInt(p.signedAt),
    validUntil: BigInt(p.validUntil),
    demoMode: p.demoMode,
  };
}
