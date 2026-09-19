export type AgreementStatus =
  | "AWAITING_ACCEPTANCE"
  | "READY_TO_FUND"
  | "EXPIRED_UNFUNDED"
  | "FUNDED"
  | "FIRST_MILESTONE_PAID"
  | "COMPLETED"
  | "EXPIRED_REFUNDABLE"
  | "REFUNDED";

export interface AgreementStatusInput {
  funded: boolean;
  refunded: boolean;
  communityAccepted: boolean;
  verifierAccepted: boolean;
  nextMilestoneId: bigint;
  totalPaid: bigint;
  totalBudget: bigint;
  /** unix seconds */
  fundingDeadline: bigint;
  executionDeadline: bigint;
  /** unix seconds, preferably the latest block timestamp */
  now: bigint;
}

/**
 * Derives the lifecycle status from contract reads (brief section 9.8).
 * Pure and shared, so the indexer, the API and the UI can never disagree.
 */
export function deriveAgreementStatus(s: AgreementStatusInput): AgreementStatus {
  if (s.refunded) return "REFUNDED";
  if (!s.funded) {
    if (s.now >= s.fundingDeadline) return "EXPIRED_UNFUNDED";
    return s.communityAccepted && s.verifierAccepted ? "READY_TO_FUND" : "AWAITING_ACCEPTANCE";
  }
  if (s.nextMilestoneId >= 2n || s.totalPaid >= s.totalBudget) return "COMPLETED";
  if (s.now >= s.executionDeadline) return "EXPIRED_REFUNDABLE";
  return s.nextMilestoneId === 1n ? "FIRST_MILESTONE_PAID" : "FUNDED";
}
