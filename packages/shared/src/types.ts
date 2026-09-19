export type Role = "FUNDER" | "COMMUNITY" | "REVIEWER" | "OBSERVER";

export interface AgreementParameters {
  payer: string;
  communitySigner: string;
  verifierSigner: string;
  token: string;
  projectRefHash: `0x${string}`;
  metadataHash: `0x${string}`;
  methodologyHash: `0x${string}`;
  payeeCommunity: string;
  payeeMonitoring: string;
  communityBps: number;
  milestoneAmounts: [string, string];
  fundingDeadline: number;
  executionDeadline: number;
  demoMode: boolean;
}

export interface MilestoneApprovalPayload {
  milestoneId: number;
  termsHash: `0x${string}`;
  evidenceHash: `0x${string}`;
  amount: string;
  nonce: number;
  signedAt: number;
  validUntil: number;
  demoMode: boolean;
}

export interface EvidenceFileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
}

export interface ManifestFileEntry {
  requirementKey: string;
  fileName: string;
  sha256: string;
  mimeType: string;
  size: number;
}

export interface EvidenceManifest {
  manifestVersion: string;
  agreementAddress: string;
  chainId: number;
  milestoneId: number;
  mode: "DEMO" | "PRODUCTION";
  declaredDate: string;
  description: string;
  files: ManifestFileEntry[];
  unfulfilledRequirements: string[];
}

export interface AIReviewResult {
  status: "INCOMPLETE" | "READY_FOR_HUMAN_REVIEW" | "UNAVAILABLE";
  missingRequirements: string[];
  findings: Array<{
    message: string;
    fileId?: string;
    supportingExcerpt?: string;
  }>;
  evidenceReferences: string[];
  externalResearch: {
    status: "COMPLETED" | "SKIPPED" | "UNAVAILABLE" | "BUDGET_EXCEEDED";
    provider?: string;
    spendUsd?: number;
    runs?: number;
    sourceReferences?: string[];
  };
  limitations: string[];
  mode: "MODEL_ASSISTED" | "DETERMINISTIC_ONLY";
}
