import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** Immutable agreement parameters, in the exact order of the on-chain `termsHash` schema. */
export interface AgreementTerms {
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
}

const TERMS_ABI_TYPES = [
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256[2]" },
  { type: "uint64" },
  { type: "uint64" },
  { type: "bool" },
] as const;

/**
 * Recomputes the contract's `termsHash`: keccak256(abi.encode(payer, communitySigner, verifierSigner,
 * token, projectRefHash, metadataHash, methodologyHash, payeeCommunity, payeeMonitoring, communityBps,
 * milestoneAmounts, fundingDeadline, executionDeadline, demoMode)).
 * Clients use it to check the on-chain hash against the parameters they display before anyone signs.
 */
export function computeTermsHash(t: AgreementTerms): Hex {
  return keccak256(
    encodeAbiParameters(TERMS_ABI_TYPES, [
      t.payer,
      t.communitySigner,
      t.verifierSigner,
      t.token,
      t.projectRefHash,
      t.metadataHash,
      t.methodologyHash,
      t.payeeCommunity,
      t.payeeMonitoring,
      t.communityBps,
      t.milestoneAmounts,
      t.fundingDeadline,
      t.executionDeadline,
      t.demoMode,
    ])
  );
}
