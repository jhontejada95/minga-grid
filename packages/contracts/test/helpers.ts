import { ethers } from "hardhat";
import type { Contract } from "ethers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const usd = (amount: string) => ethers.parseUnits(amount, 6);

export const PROJECT_REF = ethers.id("pacific-mangrove-demo");
export const METADATA_HASH = ethers.id("pacific-mangrove-metadata-v1");
export const METHODOLOGY_HASH = ethers.id("demonstration-milestone-template-v1");

export interface Approval {
  milestoneId: bigint;
  termsHash: string;
  evidenceHash: string;
  amount: bigint;
  nonce: bigint;
  signedAt: bigint;
  validUntil: bigint;
  demoMode: boolean;
}

export const APPROVAL_TYPES = {
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
};

export interface Actors {
  deployer: HardhatEthersSigner;
  payer: HardhatEthersSigner;
  community: HardhatEthersSigner;
  verifier: HardhatEthersSigner;
  payeeCommunity: HardhatEthersSigner;
  payeeMonitoring: HardhatEthersSigner;
  outsider: HardhatEthersSigner;
}

export async function getActors(): Promise<Actors> {
  const [deployer, payer, community, verifier, payeeCommunity, payeeMonitoring, outsider] =
    await ethers.getSigners();
  return { deployer, payer, community, verifier, payeeCommunity, payeeMonitoring, outsider };
}

export interface AgreementInput {
  communitySigner: string;
  verifierSigner: string;
  token: string;
  projectRefHash: string;
  metadataHash: string;
  methodologyHash: string;
  payeeCommunity: string;
  payeeMonitoring: string;
  communityBps: number;
  milestoneAmounts: [bigint, bigint];
  fundingDeadline: bigint;
  executionDeadline: bigint;
  demoMode: boolean;
}

/** Default agreement: 2 x 50 mUSD, 80/20 split, funding window 1h, execution window 24h. */
export async function buildInput(
  token: string,
  actors: Actors,
  overrides: Partial<AgreementInput> = {}
): Promise<AgreementInput> {
  const now = BigInt(await time.latest());
  return {
    communitySigner: actors.community.address,
    verifierSigner: actors.verifier.address,
    token,
    projectRefHash: PROJECT_REF,
    metadataHash: METADATA_HASH,
    methodologyHash: METHODOLOGY_HASH,
    payeeCommunity: actors.payeeCommunity.address,
    payeeMonitoring: actors.payeeMonitoring.address,
    communityBps: 8000,
    milestoneAmounts: [usd("50"), usd("50")],
    fundingDeadline: now + 3600n,
    executionDeadline: now + 86400n,
    demoMode: true,
    ...overrides,
  };
}

export async function createAgreement(
  factory: Contract,
  caller: HardhatEthersSigner,
  input: AgreementInput
): Promise<Contract> {
  const tx = await factory.connect(caller).createAgreement(input);
  const receipt = await tx.wait();
  for (const log of receipt!.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "AgreementCreated") {
        return (await ethers.getContractAt("ConservationAgreement", parsed.args.agreementAddress)) as unknown as Contract;
      }
    } catch {
      // not a factory log
    }
  }
  throw new Error("AgreementCreated event not found");
}

export async function acceptBoth(agreement: Contract, actors: Actors) {
  const termsHash = await agreement.termsHash();
  await agreement.connect(actors.community).acceptTerms(termsHash);
  await agreement.connect(actors.verifier).acceptTerms(termsHash);
}

export async function fundAgreement(agreement: Contract, token: Contract, payer: HardhatEthersSigner) {
  await token.connect(payer).approve(await agreement.getAddress(), await agreement.totalBudget());
  await agreement.connect(payer).fund();
}

/** Builds a valid approval for the current state; override any field to build invalid ones. */
export async function makeApproval(
  agreement: Contract,
  overrides: Partial<Approval> = {},
  milestoneId = 0n
): Promise<Approval> {
  const now = BigInt(await time.latest());
  return {
    milestoneId,
    termsHash: await agreement.termsHash(),
    evidenceHash: ethers.id(`evidence-milestone-${milestoneId}`),
    amount: await agreement.milestoneAmounts(milestoneId),
    nonce: await agreement.milestoneNonce(milestoneId),
    signedAt: now,
    validUntil: now + 3600n,
    demoMode: await agreement.demoMode(),
    ...overrides,
  };
}

export async function signApproval(
  agreementAddress: string,
  signer: HardhatEthersSigner,
  approval: Approval,
  overrides: { chainId?: bigint; verifyingContract?: string } = {}
) {
  const network = await ethers.provider.getNetwork();
  return signer.signTypedData(
    {
      name: "MingaConservationAgreement",
      version: "1",
      chainId: overrides.chainId ?? network.chainId,
      verifyingContract: overrides.verifyingContract ?? agreementAddress,
    },
    APPROVAL_TYPES,
    approval
  );
}

/** Both authorized signers sign the identical payload. */
export async function signBoth(agreement: Contract, actors: Actors, approval: Approval) {
  const address = await agreement.getAddress();
  return {
    community: await signApproval(address, actors.community, approval),
    verifier: await signApproval(address, actors.verifier, approval),
  };
}
