"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { conservationAgreementAbi, mockUsdAbi } from "@minga/shared";
import { formatAmount, formatToken, formatUtc, percent } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/role";
import { refreshAgreementFromChain } from "@/data/queries";
import { useOnchainAction } from "@/data/tx";
import { useOnchainTerms, useTokenPosition } from "@/data/onchain";
import type { AgreementDetail } from "@/data/types";
import { Button, Card, Chip, Icon, MetricTile, Mono, Notice, TxStatus } from "@/components/ui";
import { sendBlocker, type Actor } from "./shared";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sec = (iso: string) => BigInt(Math.floor(new Date(iso).getTime() / 1000));

function Party({ label, address, accepted, you }: { label: string; address: string; accepted?: boolean; you: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low px-space-md py-space-sm">
      <div className="min-w-0">
        <div className="font-code-xs text-code-xs uppercase text-on-surface-variant">{label}{you && <span className="ml-2 rounded bg-primary-container px-1.5 py-0.5 text-on-primary">You</span>}</div>
        <Mono value={address} kind="address" />
      </div>
      {accepted !== undefined && (
        <Chip tone={accepted ? "verified" : "pending"} icon={accepted ? "check_circle" : "hourglass_top"}>{accepted ? "Terms accepted" : "Not accepted yet"}</Chip>
      )}
    </div>
  );
}

/** Terms as read from the contract, compared field by field with what the index shows. */
function OnchainCheck({ a, onVerified }: { a: AgreementDetail; onVerified: (ok: boolean) => void }) {
  const { terms, loading, error } = useOnchainTerms(a.address as Address);
  const rows = useMemo(() => {
    if (!terms) return [];
    return [
      { label: "Funder, community representative and reviewer", ok: same(terms.payer, a.funder) && same(terms.communitySigner, a.communitySigner) && same(terms.verifierSigner, a.verifierSigner) },
      { label: "Payment recipients and split", ok: same(terms.payeeCommunity, a.payeeCommunity) && same(terms.payeeMonitoring, a.payeeMonitoring) && Number(terms.communityBps) === a.communityBps },
      { label: "Milestone amounts", ok: terms.milestoneAmounts[0].toString() === a.milestones[0].amount && terms.milestoneAmounts[1].toString() === a.milestones[1].amount },
      { label: "Deadlines and mode", ok: terms.fundingDeadline === sec(a.fundingDeadline) && terms.executionDeadline === sec(a.executionDeadline) && terms.demoMode === a.demo },
      { label: "Terms hash recomputed from the on-chain values", ok: terms.hashRecomputed && same(terms.termsHash, a.termsHash) },
    ];
  }, [terms, a]);
  const allOk = rows.length > 0 && rows.every((r) => r.ok);
  useEffect(() => onVerified(allOk), [allOk, onVerified]);

  return (
    <Card className="space-y-space-sm">
      <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-primary"><Icon name="verified_user" /> Checked against the chain</h3>
      {loading && <p className="font-body-sm text-body-sm text-on-surface-variant">Reading the terms from the contract…</p>}
      {error && <Notice tone="warn" icon="cloud_off">The terms could not be read from the chain right now. Accepting is disabled until they can.</Notice>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 font-body-sm text-body-sm">
            <Icon name={r.ok ? "check_circle" : "error"} className={`!text-[18px] ${r.ok ? "text-[#166534]" : "text-error"}`} />
            <span className={r.ok ? "text-on-surface" : "text-error"}>{r.label}</span>
          </li>
        ))}
      </ul>
      {rows.length > 0 && !allOk && <Notice tone="error" icon="error">What is displayed here differs from the contract. Do not accept or sign anything until this is resolved.</Notice>}
    </Card>
  );
}

function ActionPanel({ a, actor, terms: chainOk }: { a: AgreementDetail; actor: Actor; terms: boolean }) {
  const qc = useQueryClient();
  const address = a.address as Address;
  const { terms } = useOnchainTerms(address);
  const position = useTokenPosition(a.token.address as Address, address);
  const accept = useOnchainAction();
  const mint = useOnchainAction();
  const approve = useOnchainAction();
  const fund = useOnchainAction();
  const refund = useOnchainAction();
  const after = async () => { await refreshAgreementFromChain(qc, a.address); await position.refetch(); };
  const blocker = sendBlocker(actor);
  const budget = BigInt(a.totalBudget);
  const myAccepted = actor.role === "COMMUNITY" ? a.communityAccepted : actor.role === "REVIEWER" ? a.verifierAccepted : false;

  if (a.status === "AWAITING_ACCEPTANCE" && (actor.role === "COMMUNITY" || actor.role === "REVIEWER")) {
    return (
      <Card className="space-y-space-sm">
        <h3 className="font-headline-sm text-headline-sm text-primary">Accept the terms</h3>
        {myAccepted ? (
          <Notice tone="ok" icon="check_circle">You accepted these terms. The funder can deposit the budget once both signers have accepted.</Notice>
        ) : (
          <>
            <p className="font-body-md text-body-md text-on-surface-variant">
              By accepting you confirm, as {ROLE_LABEL[actor.role].toLowerCase()}, that you have read the terms above. They cannot be changed. Accepting costs a little HSK in gas.
            </p>
            {blocker && <Notice tone="warn" icon="info">{blocker}</Notice>}
            {!chainOk && !blocker && <Notice tone="warn" icon="info">Accepting unlocks after the terms are verified against the chain.</Notice>}
            <Button
              variant="onchain" busy={accept.busy} disabled={Boolean(blocker) || !chainOk || !terms}
              onClick={() => terms && accept.run({ address, abi: conservationAgreementAbi as never, functionName: "acceptTerms", args: [terms.termsHash] }, after)}
            >
              <Icon name="task_alt" className="!text-[18px]" /> Accept terms
            </Button>
            <TxStatus state={accept.state} />
          </>
        )}
      </Card>
    );
  }

  if (a.status === "READY_TO_FUND" && actor.role === "FUNDER") {
    const balance = position.balance;
    const allowance = position.allowance;
    const short = balance !== undefined && balance < budget;
    const needsApproval = allowance !== undefined && allowance < budget;
    return (
      <Card className="space-y-space-md">
        <h3 className="font-headline-sm text-headline-sm text-primary">Fund the escrow</h3>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Depositing {formatToken(budget)} locks the whole budget in the agreement contract. It can only leave through a milestone approved by both signers or come back to you after the execution deadline.
        </p>
        <p className="font-code-sm text-code-sm text-on-surface-variant">Your balance: {balance !== undefined ? formatToken(balance) : "…"} · Allowance for this agreement: {allowance !== undefined ? formatToken(allowance) : "…"}</p>
        {blocker && <Notice tone="warn" icon="info">{blocker}</Notice>}

        {short && (
          <div className="space-y-2">
            <Notice tone="warn" icon="account_balance_wallet">Your wallet holds less mUSD than the budget. mUSD is a demonstration token anyone can mint on the testnet; it has no value.</Notice>
            <Button variant="onchain" busy={mint.busy} disabled={Boolean(blocker)} onClick={() => mint.run({ address: a.token.address as Address, abi: mockUsdAbi as never, functionName: "mint", args: [actor.address, budget - (balance ?? 0n)] }, after)}>
              Get {formatAmount(budget - (balance ?? 0n))} demo mUSD
            </Button>
            <TxStatus state={mint.state} />
          </div>
        )}

        <ol className="space-y-space-md">
          <li className="space-y-2">
            <div className="font-label-md text-label-md text-on-surface">Step 1 — Allow the agreement to take exactly {formatToken(budget)}</div>
            <Button variant="onchain" busy={approve.busy} disabled={Boolean(blocker) || short || !needsApproval} onClick={() => approve.run({ address: a.token.address as Address, abi: mockUsdAbi as never, functionName: "approve", args: [address, budget] }, after)}>
              {needsApproval ? `Approve exactly ${formatToken(budget)}` : "Allowance in place"}
            </Button>
            <TxStatus state={approve.state} />
          </li>
          <li className="space-y-2">
            <div className="font-label-md text-label-md text-on-surface">Step 2 — Deposit the budget</div>
            <Button variant="onchain" busy={fund.busy} disabled={Boolean(blocker) || short || needsApproval || allowance === undefined || !chainOk} onClick={() => fund.run({ address, abi: conservationAgreementAbi as never, functionName: "fund" }, after)}>
              <Icon name="lock" className="!text-[18px]" /> Fund {formatToken(budget)}
            </Button>
            <TxStatus state={fund.state} />
          </li>
        </ol>
      </Card>
    );
  }

  if (a.status === "READY_TO_FUND") {
    return <Notice tone="info" icon="hourglass_top">Both signers accepted. Waiting for the funder to deposit {formatToken(budget)}.</Notice>;
  }
  if (a.status === "AWAITING_ACCEPTANCE") {
    return <Notice tone="info" icon="hourglass_top">Waiting for the community representative and the independent reviewer to accept the terms. The funder deposits the budget after that.</Notice>;
  }

  if (a.status === "EXPIRED_REFUNDABLE") {
    return (
      <Card className="space-y-space-sm">
        <h3 className="font-headline-sm text-headline-sm text-primary">Refund the remaining funds</h3>
        <p className="font-body-md text-body-md text-on-surface-variant">The execution deadline has passed. {formatToken(a.money.refundable)} can go back to the funder. Anyone can trigger the refund; the tokens always go to the funder.</p>
        {blocker && <Notice tone="warn" icon="info">{blocker}</Notice>}
        <Button variant="onchain" busy={refund.busy} disabled={Boolean(blocker)} onClick={() => refund.run({ address, abi: conservationAgreementAbi as never, functionName: "refundRemaining" }, after)}>
          <Icon name="undo" className="!text-[18px]" /> Refund {formatToken(a.money.refundable)}
        </Button>
        <TxStatus state={refund.state} />
      </Card>
    );
  }
  if (a.status === "EXPIRED_UNFUNDED") return <Notice tone="warn" icon="event_busy">The funding deadline passed before the budget was deposited. Nothing was locked and nothing can be paid.</Notice>;
  if (a.status === "REFUNDED") return <Notice tone="info" icon="undo">The remaining funds were returned to the funder.</Notice>;
  if (a.status === "COMPLETED") return <Notice tone="ok" icon="task_alt">Both milestones were paid. The agreement is complete.</Notice>;
  return null;
}

export function OverviewTab({ a, actor, onVerified, chainOk }: { a: AgreementDetail; actor: Actor; onVerified: (ok: boolean) => void; chainOk: boolean }) {
  const paidPct = percent(a.money.paidOut, a.money.budget);
  // Once refunded the contract holds nothing, whatever the index derives from the deadline.
  const refundable = a.refunded ? 0n : BigInt(a.money.refundable);
  const inEscrow = a.refunded ? 0n : BigInt(a.money.pending) + BigInt(a.money.refundable);
  return (
    <div className="space-y-space-lg">
      <div className="grid grid-cols-2 gap-space-md lg:grid-cols-4">
        <MetricTile label="Total budget" value={formatAmount(a.money.budget)} sub="mUSD · demonstration token" />
        <MetricTile label="In escrow" value={formatAmount(inEscrow)} sub="Held by the contract" accent="blue" />
        <MetricTile label="Paid out" value={formatAmount(a.money.paidOut)} sub={`${paidPct}% of the budget`} accent="green" />
        <MetricTile label="Refundable" value={formatAmount(refundable)} sub={a.status === "EXPIRED_REFUNDABLE" ? "Available now" : "After the execution deadline"} />
      </div>

      <ActionPanel a={a} actor={actor} terms={chainOk} />

      <div className="grid gap-space-lg lg:grid-cols-2">
        <Card className="space-y-space-md">
          <h3 className="font-headline-sm text-headline-sm text-primary">Terms</h3>
          {a.description && <p className="font-body-md text-body-md text-on-surface-variant">{a.description}</p>}
          {a.location && (a.location.region || a.location.country) && (
            <p className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant"><Icon name="location_on" className="!text-[18px]" />{[a.location.region, a.location.country].filter(Boolean).join(", ")}</p>
          )}
          <dl className="grid grid-cols-2 gap-space-sm font-body-sm text-body-sm">
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Funding deadline</dt><dd>{formatUtc(a.fundingDeadline)}</dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Execution deadline</dt><dd>{formatUtc(a.executionDeadline)}</dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Split per payment</dt><dd>{a.communityBps / 100}% community / {(10000 - a.communityBps) / 100}% monitoring</dd></div>
            <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Mode</dt><dd>{a.demo ? "Demonstration" : "Production"}</dd></div>
          </dl>
          <div className="space-y-1 font-code-xs text-code-xs text-on-surface-variant">
            <div className="flex flex-wrap items-center gap-2">Terms hash <Mono value={a.termsHash} /></div>
            <div className="flex flex-wrap items-center gap-2">
              Public description hash <Mono value={a.metadataHash} />
              {a.metadata && <Chip tone={a.metadata.hashVerified ? "verified" : "danger"} icon={a.metadata.hashVerified ? "check_circle" : "error"}>{a.metadata.hashVerified ? "Hash matches" : "Hash does not match"}</Chip>}
            </div>
            <div className="flex flex-wrap items-center gap-2">Token <Mono value={a.token.address} kind="address" />{a.token.symbol && <span>({a.token.symbol})</span>}</div>
          </div>
        </Card>

        <Card className="space-y-space-sm">
          <h3 className="font-headline-sm text-headline-sm text-primary">Participants</h3>
          <Party label="Funder" address={a.funder} you={actor.role === "FUNDER"} />
          <Party label="Community representative" address={a.communitySigner} accepted={a.communityAccepted} you={actor.role === "COMMUNITY"} />
          <Party label="Independent reviewer" address={a.verifierSigner} accepted={a.verifierAccepted} you={actor.role === "REVIEWER"} />
          <Party label="Community payment recipient" address={a.payeeCommunity} you={false} />
          <Party label="Monitoring payment recipient" address={a.payeeMonitoring} you={false} />
        </Card>
      </div>

      <OnchainCheck a={a} onVerified={onVerified} />
    </div>
  );
}
