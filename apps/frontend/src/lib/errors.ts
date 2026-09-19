/**
 * Turns contract reverts, wallet errors and API errors into plain English. Raw strings, selectors and
 * "execution reverted" are never shown to people; the original is kept in `technical` for a collapsed detail.
 */
export interface FriendlyError {
  code: string;
  message: string;
  technical?: string;
}

const REVERTS: [RegExp, string, string][] = [
  [/Funding deadline passed/i, "FUNDING_DEADLINE_PASSED", "The funding window has closed."],
  [/Terms hash mismatch/i, "TERMS_MISMATCH", "These terms do not match the agreement. Reload the page and check the terms again."],
  [/Caller not authorized to accept terms/i, "NOT_A_PARTICIPANT", "This wallet is not the community representative or the reviewer of this agreement."],
  [/Only payer can fund/i, "NOT_PAYER", "Only the funder's wallet can deposit the budget."],
  [/Already funded/i, "ALREADY_FUNDED", "This agreement is already funded."],
  [/Both parties must accept terms/i, "ACCEPTANCE_MISSING", "The community representative and the reviewer must both accept the terms first."],
  [/Fee-on-transfer unsupported/i, "FEE_TOKEN", "This token charges a fee on transfer and cannot be used."],
  [/ERC20InsufficientAllowance/i, "ALLOWANCE", "The token allowance is too low. Approve the exact budget first."],
  [/ERC20InsufficientBalance/i, "BALANCE", "Your wallet does not hold enough mUSD."],
  [/Agreement not funded/i, "NOT_FUNDED", "The agreement has not been funded yet."],
  [/Agreement refunded/i, "REFUNDED", "The remaining funds were already returned to the funder."],
  [/Milestone out of sequence/i, "OUT_OF_SEQUENCE", "Milestone 2 cannot be paid before milestone 1, and a paid milestone cannot be paid again."],
  [/Milestone already paid/i, "ALREADY_PAID", "This milestone was already paid."],
  [/Amount mismatch|Demo mode mismatch/i, "APPROVAL_MISMATCH", "The approval does not match the agreement. Create a new approval."],
  [/Nonce mismatch/i, "STALE_APPROVAL", "This approval was invalidated. Create a new approval and collect both signatures again."],
  [/Evidence hash empty/i, "NO_EVIDENCE", "The approval has no evidence attached."],
  [/Signed before funding|Future signedAt/i, "BAD_TIMESTAMP", "The approval timestamp is not valid. Create a new approval."],
  [/Approval validity exceeds deadline/i, "VALIDITY_TOO_LONG", "The approval would be valid past the execution deadline."],
  [/Approval expired/i, "APPROVAL_EXPIRED", "This approval has expired. Create a new one."],
  [/Execution deadline reached/i, "DEADLINE_REACHED", "The execution deadline has passed. Payments are closed; the remaining funds can be refunded."],
  [/Invalid community signature/i, "COMMUNITY_SIGNATURE", "The community representative's signature is missing or does not match this approval."],
  [/Invalid verifier signature/i, "REVIEWER_SIGNATURE", "The reviewer's signature is missing or does not match this approval."],
  [/Only authorized signers can invalidate/i, "NOT_A_SIGNER", "Only the community representative or the reviewer can invalidate an approval."],
  [/Agreement not active/i, "NOT_ACTIVE", "The agreement is not active."],
  [/Milestone invalid or paid/i, "CANNOT_INVALIDATE", "This milestone cannot be invalidated."],
  [/Execution deadline passed/i, "DEADLINE_PASSED", "The execution deadline has passed."],
  [/Execution deadline not reached/i, "DEADLINE_NOT_REACHED", "Funds can be refunded only after the execution deadline."],
  [/Already refunded/i, "ALREADY_REFUNDED", "The remaining funds were already refunded."],
  [/No remaining balance/i, "NOTHING_TO_REFUND", "Nothing is left to refund."],
  [/Signers and payer must be distinct/i, "DISTINCT_ROLES", "The funder, the community representative and the reviewer must be three different wallets."],
  [/Payees must be distinct|Invalid payee/i, "PAYEES", "The two payment recipients must be valid and different."],
  [/Milestone amounts must be positive/i, "AMOUNTS", "Both milestone amounts must be greater than zero."],
  [/Community bps/i, "SPLIT", "The community share must be between 0.01% and 99.99%."],
  [/Invalid deadlines/i, "DEADLINES", "The funding deadline must be in the future and before the execution deadline."],
  [/Invalid (community|verifier) signer|Invalid token contract|Required hashes/i, "INVALID_PARAMS", "One of the agreement parameters is not valid."],
];

const WALLET_REJECTED = /user rejected|user denied|rejected the request|request rejected|denied transaction/i;

export function translateError(err: unknown): FriendlyError {
  const anyErr = err as { name?: string; code?: number; shortMessage?: string; message?: string; details?: string; reason?: string; data?: { errorName?: string }; cause?: unknown; walk?: (fn: (e: unknown) => boolean) => unknown };
  const technical = [anyErr?.shortMessage, anyErr?.details, anyErr?.message].filter(Boolean).join(" | ").slice(0, 600);

  // API errors already carry a stable code and an English message.
  if (anyErr?.name === "ApiError") return { code: (err as { code: string }).code, message: (err as { message: string }).message };

  if (anyErr?.code === 4001 || WALLET_REJECTED.test(technical)) {
    return { code: "USER_REJECTED", message: "Cancelled in your wallet. Nothing was sent.", technical };
  }

  // viem wraps the revert deep inside `cause`; collect every text it exposes.
  let haystack = technical;
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const c = cur as { reason?: string; data?: { errorName?: string }; shortMessage?: string; message?: string; cause?: unknown };
    haystack += ` ${c.reason ?? ""} ${c.data?.errorName ?? ""} ${c.shortMessage ?? ""} ${c.message ?? ""}`;
    cur = c.cause;
  }
  for (const [re, code, message] of REVERTS) if (re.test(haystack)) return { code, message, technical };

  if (/insufficient funds|exceeds the balance of the account/i.test(haystack)) {
    return { code: "NO_GAS", message: "Your wallet does not have enough HSK to pay the network fee. Get test HSK from the faucet.", technical };
  }
  if (/chain.*mismatch|does not match the target chain|unsupported chain|switch.*chain/i.test(haystack)) {
    return { code: "WRONG_NETWORK", message: "Wrong network. Switch to HSKChain Testnet (chain ID 133) to continue.", technical };
  }
  if (/failed to fetch|network error|networkerror/i.test(haystack)) {
    return { code: "NETWORK", message: "The service could not be reached. Check your connection and try again.", technical };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Nothing was changed.", technical };
}
