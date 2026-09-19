"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useSignTypedData } from "wagmi";
import { buildApprovalTypedData, conservationAgreementAbi, payloadToApproval } from "@minga/shared";
import { checkApproval } from "@/lib/approval";
import { chain } from "@/lib/config";
import { translateError } from "@/lib/errors";
import { formatAmount, formatToken, formatUtc } from "@/lib/format";
import { api } from "@/data/api";
import { refreshAgreementFromChain, useApprovals } from "@/data/queries";
import { useOnchainAction } from "@/data/tx";
import type { AgreementDetail, ApprovalPayloadResponse, Manifest } from "@/data/types";
import { Button, Card, Chip, Icon, Mono, Notice, TxStatus } from "@/components/ui";
import { sendBlocker, type Actor } from "./shared";

export function ApprovalPanel({ a, milestoneId, actor, current, manifests }: { a: AgreementDetail; milestoneId: 0 | 1; actor: Actor; current: Manifest | undefined; manifests: Manifest[] }) {
  const qc = useQueryClient();
  const approvals = useApprovals(a.address, milestoneId, true);
  const { signTypedDataAsync } = useSignTypedData();
  const invalidate = useOnchainAction();
  const release = useOnchainAction();
  const [busy, setBusy] = useState<"prepare" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);

  const milestone = a.milestones[milestoneId];
  const state = approvals.data;
  const isSigner = actor.role === "COMMUNITY" || actor.role === "REVIEWER";
  const blocker = sendBlocker(actor);
  const mine = state?.signatures.find((s) => s.role === actor.role);
  const nowSec = Math.floor(Date.now() / 1000);

  const verification = useMemo(() => {
    if (!state?.payload || !state.payloadHash) return null;
    return checkApproval({ agreement: a, milestoneId, payload: state.payload, payloadHash: state.payloadHash, manifests, chainId: chain.id, nowSec });
    // `nowSec` is intentionally frozen per render of new data; validity is re-checked when the state refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.payload, state?.payloadHash, a, milestoneId, manifests]);

  const staleEvidence = !!state?.payload && !!current && state.payload.evidenceHash.toLowerCase() !== current.evidenceHash.toLowerCase();
  const refresh = async () => { await refreshAgreementFromChain(qc, a.address); };

  async function prepare() {
    if (!current) return;
    setError(null);
    setSigned(null);
    setBusy("prepare");
    try {
      await api<ApprovalPayloadResponse>(`/api/v1/agreements/${a.address}/milestones/${milestoneId}/approval-payloads`, { json: { evidenceHash: current.evidenceHash } });
      await qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e) {
      setError(translateError(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!state?.payload || !state.payloadHash || !verification?.ok) return;
    setError(null);
    setBusy("sign");
    try {
      // The typed data shown in the wallet is rebuilt here from the verified payload, not taken from the server as-is.
      const message = payloadToApproval(state.payload);
      const td = buildApprovalTypedData(chain.id, a.address as Address, message);
      const signature = await signTypedDataAsync({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message } as never);
      await api(`/api/v1/agreements/${a.address}/milestones/${milestoneId}/approval-signatures`, { json: { payloadHash: state.payloadHash, signature } });
      setSigned("Your signature was recorded. It authorizes nothing by itself: the payment needs both signatures.");
      await qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e) {
      const f = translateError(e);
      setError(f.code === "USER_REJECTED" ? f.message : f.message);
    } finally {
      setBusy(null);
    }
  }

  const releaseDisabled = Boolean(blocker) || !state?.executable || !state.release;
  const community = (BigInt(milestone.amount) * BigInt(a.communityBps)) / 10000n;

  return (
    <Card className="space-y-space-md">
      <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-primary"><Icon name="draw" /> Approval and payment</h3>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Paying {formatToken(milestone.amount)} needs the same approval signed by the community representative and by the independent reviewer. Each signature is made in the signer's own wallet; nobody else can sign for them.
      </p>

      {approvals.isError && <Notice tone="error" icon="error">Approvals could not be loaded. {translateError(approvals.error).message}</Notice>}
      {error && <Notice tone="error" icon="error">{error}</Notice>}
      {signed && <Notice tone="ok" icon="check_circle">{signed}</Notice>}

      {!state?.payload && (
        <div className="space-y-space-sm">
          <p className="font-body-sm text-body-sm text-on-surface-variant">{current ? `No approval is open. It will refer to evidence version ${current.version}.` : "Create an evidence version before preparing an approval."}</p>
          {isSigner ? (
            <Button variant="primary" busy={busy === "prepare"} disabled={!current || !actor.signedIn} onClick={prepare}>
              <Icon name="assignment_turned_in" className="!text-[18px]" /> Prepare approval for the current evidence
            </Button>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant">Waiting for the community representative or the reviewer to prepare it.</p>
          )}
        </div>
      )}

      {state?.payload && (
        <div className="space-y-space-md">
          <dl className="grid gap-space-sm rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm md:grid-cols-2">
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Milestone</dt><dd>{milestone.title}</dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Amount</dt><dd>{formatToken(state.payload.amount)}</dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Evidence hash</dt><dd><Mono value={state.payload.evidenceHash} /></dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Valid until</dt><dd>{formatUtc(new Date(state.payload.validUntil * 1000).toISOString())}</dd></div>
          </dl>

          {staleEvidence && (
            <Notice tone="warn" icon="warning">
              This approval refers to an earlier evidence version. Prepare a new approval for version {current?.version} before signing.
              {isSigner && <div className="mt-2"><Button variant="secondary" busy={busy === "prepare"} onClick={prepare}>Prepare approval for the latest evidence</Button></div>}
            </Notice>
          )}

          {verification && (
            <div>
              <div className="font-label-md text-label-md text-on-surface">Checked in your browser before you sign</div>
              <ul className="mt-1 space-y-1">
                {verification.checks.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 font-body-sm text-body-sm">
                    <Icon name={c.ok ? "check_circle" : "error"} className={`!text-[18px] ${c.ok ? "text-[#166534]" : "text-error"}`} />
                    <span className={c.ok ? "text-on-surface" : "text-error"}>{c.label}</span>
                  </li>
                ))}
              </ul>
              {!verification.ok && <Notice tone="error" icon="error" className="mt-space-sm">Signing is blocked because the approval does not match the agreement. Prepare a new approval.</Notice>}
            </div>
          )}

          <div className="grid gap-space-sm md:grid-cols-2">
            {(["COMMUNITY", "REVIEWER"] as const).map((role) => {
              const sig = state.signatures.find((s) => s.role === role);
              return (
                <div key={role} className="flex items-center justify-between gap-2 rounded-lg border border-[#e2e8f0] p-space-md">
                  <div>
                    <div className="font-label-md text-label-md text-on-surface">{role === "COMMUNITY" ? "Community representative" : "Independent reviewer"}</div>
                    <div className="font-code-xs text-code-xs text-on-surface-variant">{sig ? `Signed ${formatUtc(sig.signedAt)}` : "Not signed yet"}</div>
                  </div>
                  <Chip tone={sig ? "verified" : "pending"} icon={sig ? "check_circle" : "hourglass_top"}>{sig ? "Signed" : "Pending"}</Chip>
                </div>
              );
            })}
          </div>

          {isSigner && !mine && !staleEvidence && (
            <div className="space-y-2">
              {blocker && <Notice tone="warn" icon="info">{blocker}</Notice>}
              <Button variant="onchain" busy={busy === "sign"} disabled={Boolean(blocker) || !verification?.ok || !actor.signedIn} onClick={sign}>
                <Icon name="draw" className="!text-[18px]" /> Sign as {actor.role === "COMMUNITY" ? "community representative" : "independent reviewer"}
              </Button>
              <p className="font-code-xs text-code-xs text-on-surface-variant">Your wallet will show the structured approval. Signing is free and sends no transaction.</p>
            </div>
          )}
          {isSigner && mine && <Notice tone="ok" icon="check_circle">You signed this approval. {state.executable ? "Both signatures are in." : "Waiting for the other signer."}</Notice>}
          {!isSigner && <p className="font-body-sm text-body-sm text-on-surface-variant">Only the two signers sign. Once both signatures exist, any participant can send the payment.</p>}
        </div>
      )}

      {state?.executable && state.release && (
        <div className="space-y-space-sm rounded-lg border border-[#bae6fd] bg-[#f0f9ff] p-space-md">
          <div className="font-label-md text-label-md text-[#0369a1]">Both signatures are in. The payment can be released.</div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The contract pays {formatAmount(community)} mUSD to the community recipient and {formatAmount(BigInt(milestone.amount) - community)} mUSD to the monitoring recipient. Any of the three participants can send this transaction; the tokens go only to the recipients fixed in the agreement.
          </p>
          {blocker && <Notice tone="warn" icon="info">{blocker}</Notice>}
          <Button
            variant="onchain" busy={release.busy} disabled={releaseDisabled}
            onClick={() => state.release && release.run({
              address: a.address as Address, abi: conservationAgreementAbi as never, functionName: "release",
              args: [payloadToApproval(state.release.approval), state.release.communitySignature as Hex, state.release.verifierSignature as Hex],
            }, refresh)}
          >
            <Icon name="payments" className="!text-[18px]" /> Release {formatToken(milestone.amount)}
          </Button>
          <TxStatus state={release.state} />
        </div>
      )}

      {isSigner && state?.payload && a.funded && !milestone.receipt && (
        <div className="space-y-2 border-t border-[#e2e8f0] pt-space-md">
          <div className="font-label-md text-label-md text-on-surface">Changed your mind or found a problem?</div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Invalidating cancels every signature collected for this milestone. It costs a little HSK in gas.</p>
          <Button variant="danger" busy={invalidate.busy} disabled={Boolean(blocker)}
            onClick={() => invalidate.run({ address: a.address as Address, abi: conservationAgreementAbi as never, functionName: "invalidateApproval", args: [BigInt(milestoneId)] }, refresh)}>
            <Icon name="block" className="!text-[18px]" /> Invalidate the current approval
          </Button>
          <TxStatus state={invalidate.state} />
        </div>
      )}
    </Card>
  );
}
