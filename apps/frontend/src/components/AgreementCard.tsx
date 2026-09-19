"use client";

import Link from "next/link";
import { formatAmount, formatToken, relativeTime, shortAddress, percent } from "@/lib/format";
import { roleOf, type Role } from "@/lib/role";
import type { AgreementSummary } from "@/data/types";
import { AgreementStatusChip, Chip, Icon, Mono } from "./ui";

/** The one thing this wallet could do next on this agreement, from public data only. */
export function nextAction(a: AgreementSummary, role: Role): string | null {
  switch (a.status) {
    case "AWAITING_ACCEPTANCE":
      return role === "COMMUNITY" || role === "REVIEWER" ? "Review the terms and accept them" : role === "FUNDER" ? "Waiting for acceptance by the community and the reviewer" : null;
    case "READY_TO_FUND":
      return role === "FUNDER" ? `Fund ${formatToken(a.totalBudget)}` : role === "OBSERVER" ? null : "Waiting for the funder to deposit the budget";
    case "FUNDED":
    case "FIRST_MILESTONE_PAID":
      return role === "COMMUNITY" ? "Upload evidence and sign the next milestone" : role === "REVIEWER" ? "Review evidence and sign the next milestone" : role === "FUNDER" ? "Waiting for milestone approvals" : null;
    case "EXPIRED_REFUNDABLE":
      return role === "FUNDER" ? "Refund the remaining funds" : role === "OBSERVER" ? null : "The deadline passed; remaining funds can be refunded";
    default:
      return null;
  }
}

export function AgreementCard({ agreement: a, wallet, compact }: { agreement: AgreementSummary; wallet: string | undefined; compact?: boolean }) {
  const role = roleOf(a, wallet);
  const action = wallet ? nextAction(a, role) : null;
  const funded = a.status !== "AWAITING_ACCEPTANCE" && a.status !== "READY_TO_FUND" && a.status !== "EXPIRED_UNFUNDED";
  const deadline = funded ? a.executionDeadline : a.fundingDeadline;
  const paidPct = percent(a.totalPaid, a.totalBudget);

  return (
    <article className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h3 className="font-headline-sm text-headline-sm text-primary">{a.projectName}</h3>
            {a.demo && <Chip tone="neutral">Demo</Chip>}
            <AgreementStatusChip status={a.status} />
          </div>
          <p className="mt-1 font-code-xs text-code-xs text-on-surface-variant">
            Agreement <Mono value={a.address} kind="address" className="!text-code-xs" />
          </p>
        </div>
        <Link
          href={`/app/agreements/${a.address}`}
          className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-space-md py-2 font-label-md text-label-md text-primary hover:bg-surface-container-high"
        >
          Open agreement <Icon name="arrow_forward" className="!text-[16px]" />
        </Link>
      </div>

      {!compact && (
        <div className="mt-space-md grid grid-cols-2 gap-space-sm md:grid-cols-4">
          <Metric label="Total budget" value={formatToken(a.totalBudget)} />
          <Metric label="Paid out" value={formatToken(a.totalPaid)} />
          <Metric label={funded ? "Execution deadline" : "Funding deadline"} value={relativeTime(deadline)} />
          <Metric label="Community" value={shortAddress(a.communitySigner)} mono />
        </div>
      )}

      {!compact && (
        <div className="mt-space-md">
          <div className="flex items-center justify-between font-code-xs text-code-xs text-on-surface-variant">
            <span>Payout progress</span>
            <span>{formatAmount(a.totalPaid)} of {formatAmount(a.totalBudget)} mUSD</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full bg-primary-container" style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      )}

      {action && (
        <p className="mt-space-md inline-flex items-center gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-space-md py-1.5 font-body-sm text-body-sm text-[#92400e]">
          <Icon name="bolt" className="!text-[16px]" /> Your next action: {action}
        </p>
      )}
    </article>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-space-md py-space-sm">
      <div className="font-code-xs text-code-xs uppercase text-on-surface-variant">{label}</div>
      <div className={mono ? "font-code-sm text-code-sm text-on-surface" : "font-label-md text-label-md text-on-surface"}>{value}</div>
    </div>
  );
}
