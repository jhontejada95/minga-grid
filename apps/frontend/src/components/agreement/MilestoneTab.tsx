"use client";

import { formatToken, formatUtc } from "@/lib/format";
import { useEvidence } from "@/data/queries";
import type { AgreementDetail } from "@/data/types";
import { Card, Icon, MilestoneStatusChip, Mono, Notice } from "@/components/ui";
import { ApprovalPanel } from "./ApprovalPanel";
import { EvidencePanel } from "./EvidencePanel";
import { ReviewPanel } from "./ReviewPanel";
import { PrivateGate, type Actor } from "./shared";

function Receipt({ a, id }: { a: AgreementDetail; id: 0 | 1 }) {
  const r = a.milestones[id].receipt;
  if (!r) return null;
  return (
    <Card className="space-y-space-sm border-[#bbf7d0] bg-[#f0fdf4]">
      <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-[#166534]"><Icon name="receipt_long" /> Payment receipt</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Read from the contract's own record of this payment. Anyone can check it on the explorer.</p>
      <dl className="grid gap-space-sm font-body-sm text-body-sm md:grid-cols-2">
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Paid</dt><dd>{formatUtc(r.paidAt)}</dd></div>
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Transaction</dt><dd><Mono value={r.txHash} kind="tx" /></dd></div>
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">To the community</dt><dd>{formatToken(r.communityAmount)} → <Mono value={r.payeeCommunity} kind="address" /></dd></div>
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">To monitoring</dt><dd>{formatToken(r.monitoringAmount)} → <Mono value={r.payeeMonitoring} kind="address" /></dd></div>
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Evidence hash</dt><dd><Mono value={r.evidenceHash} /></dd></div>
        <div><dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">Terms hash</dt><dd><Mono value={r.termsHash} /></dd></div>
      </dl>
    </Card>
  );
}

function Private({ a, id, actor }: { a: AgreementDetail; id: 0 | 1; actor: Actor }) {
  const evidence = useEvidence(a.address, id, true);
  const paid = a.milestones[id].status === "PAID";
  const current = evidence.data?.manifests.find((m) => m.current);
  const canEdit = !paid && a.status !== "REFUNDED" && a.status !== "EXPIRED_REFUNDABLE";
  return (
    <div className="space-y-space-lg">
      <EvidencePanel a={a} milestoneId={id} actor={actor} canEdit={canEdit} />
      {!paid && <ReviewPanel address={a.address} milestoneId={id} actor={actor} current={current} />}
      {!paid && canEdit && <ApprovalPanel a={a} milestoneId={id} actor={actor} current={current} manifests={evidence.data?.manifests ?? []} />}
    </div>
  );
}

export function MilestoneTab({ a, id, actor }: { a: AgreementDetail; id: 0 | 1; actor: Actor }) {
  const m = a.milestones[id];
  return (
    <div className="space-y-space-lg">
      <Card className="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <div className="font-code-xs text-code-xs uppercase text-on-surface-variant">Milestone {id + 1}</div>
          <h2 className="font-headline-lg text-headline-lg text-primary">{m.title}</h2>
        </div>
        <div className="text-right">
          <div className="font-headline-lg text-headline-lg text-on-surface">{formatToken(m.amount)}</div>
          <MilestoneStatusChip status={m.status} />
        </div>
      </Card>

      <Receipt a={a} id={id} />

      {m.status === "LOCKED" ? (
        <Notice tone="info" icon="lock">
          {!a.funded ? "This milestone unlocks after the funder deposits the budget." : id === 1 ? "Milestone 2 unlocks after milestone 1 is paid." : "This milestone is not open yet."}
        </Notice>
      ) : (
        <PrivateGate actor={actor} what="Evidence, reviews and approvals">
          <Private a={a} id={id} actor={actor} />
        </PrivateGate>
      )}
    </div>
  );
}
