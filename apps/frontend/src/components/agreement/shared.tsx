"use client";

import { useAccount } from "wagmi";
import { chain } from "@/lib/config";
import { translateError } from "@/lib/errors";
import { roleOf, ROLE_LABEL, type Role } from "@/lib/role";
import { useSession, useSignIn } from "@/data/session";
import type { AgreementDetail } from "@/data/types";
import { Button, Card, Icon, Notice } from "@/components/ui";

/** Who is looking at this agreement: the wallet, its role in THIS agreement (from the contract's participants) and whether writes are possible. */
export function useActor(a: AgreementDetail) {
  const s = useSession();
  const { chainId } = useAccount();
  const role: Role = roleOf(a, s.address);
  const wrongChain = s.isConnected && chainId !== chain.id;
  return { ...s, role, wrongChain, canSend: s.isConnected && !wrongChain };
}

export type Actor = ReturnType<typeof useActor>;

/** Why a wallet action is unavailable, in words; null when it can go ahead. */
export function sendBlocker(actor: Actor): string | null {
  if (!actor.isConnected) return "Connect your wallet to continue.";
  if (actor.wrongChain) return "Switch to HSKChain Testnet (chain ID 133) in your wallet.";
  return null;
}

/**
 * Evidence, reviews and approvals are visible to participants only. Observers see why the section is locked; a participant
 * without a session signs in (free, no gas, no payment) to unlock it.
 */
export function PrivateGate({ actor, what, children }: { actor: Actor; what: string; children: React.ReactNode }) {
  const signIn = useSignIn();
  if (!actor.isConnected) {
    return <Notice tone="info" icon="lock">{what} are visible to the funder, the community representative and the reviewer. Connect a wallet to check whether you take part in this agreement.</Notice>;
  }
  if (actor.role === "OBSERVER") {
    return <Notice tone="info" icon="lock">{what} are private to the three participants of this agreement. Your wallet is not one of them, so you can only see the public terms, the on-chain receipts and the activity.</Notice>;
  }
  if (!actor.signedIn) {
    return (
      <Card className="space-y-space-sm">
        <p className="flex items-center gap-2 font-body-md text-body-md text-on-surface"><Icon name="lock" className="text-primary" /> Sign in to open the {what.toLowerCase()} as {ROLE_LABEL[actor.role].toLowerCase()}.</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Signing in proves you own this wallet. It is free, uses no gas and does not authorize any payment.</p>
        {signIn.error && <Notice tone="error" icon="error">{translateError(signIn.error).message}</Notice>}
        <Button variant="onchain" busy={signIn.isPending} onClick={() => signIn.mutate()}><Icon name="key" className="!text-[18px]" /> Sign in with wallet</Button>
      </Card>
    );
  }
  return <>{children}</>;
}
