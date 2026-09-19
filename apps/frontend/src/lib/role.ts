export type Role = "FUNDER" | "COMMUNITY" | "REVIEWER" | "OBSERVER";

export interface Participants {
  funder: string;
  communitySigner: string;
  verifierSigner: string;
}

/** Role of a wallet in ONE agreement, derived only from the contract's participant addresses. */
export function roleOf(p: Participants, wallet: string | undefined | null): Role {
  if (!wallet) return "OBSERVER";
  const w = wallet.toLowerCase();
  if (w === p.funder.toLowerCase()) return "FUNDER";
  if (w === p.communitySigner.toLowerCase()) return "COMMUNITY";
  if (w === p.verifierSigner.toLowerCase()) return "REVIEWER";
  return "OBSERVER";
}

export const isParticipant = (r: Role) => r !== "OBSERVER";

export const ROLE_LABEL: Record<Role, string> = {
  FUNDER: "Funder",
  COMMUNITY: "Community Representative",
  REVIEWER: "Independent Reviewer",
  OBSERVER: "Observer",
};
