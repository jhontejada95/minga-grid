"use client";

import { formatToken, formatUtc } from "@/lib/format";
import { useActivity } from "@/data/queries";
import type { ActivityEvent } from "@/data/types";
import { Card, Chip, Icon, Mono, Notice, Skeleton } from "@/components/ui";

const LABEL: Record<string, { icon: string; text: string }> = {
  AgreementCreated: { icon: "add_circle", text: "Agreement created" },
  TermsAccepted: { icon: "task_alt", text: "Terms accepted" },
  AgreementFunded: { icon: "lock", text: "Budget deposited into escrow" },
  MilestonePaid: { icon: "payments", text: "Milestone paid" },
  ApprovalInvalidated: { icon: "block", text: "Approval invalidated" },
  RemainingRefunded: { icon: "undo", text: "Remaining funds refunded" },
};

function detail(e: ActivityEvent): string | null {
  const d = e.details;
  const s = (k: string) => (typeof d[k] === "string" || typeof d[k] === "number" ? String(d[k]) : null);
  switch (e.type) {
    case "MilestonePaid": {
      const id = s("milestoneId");
      const c = s("communityAmount");
      const m = s("monitoringAmount");
      return `${id !== null ? `Milestone ${Number(id) + 1}` : "Milestone"}${c && m ? ` — ${formatToken(c)} to the community, ${formatToken(m)} to monitoring` : ""}`;
    }
    case "AgreementFunded": return s("amount") ? formatToken(s("amount")!) : null;
    case "RemainingRefunded": return s("amount") ? formatToken(s("amount")!) : null;
    case "ApprovalInvalidated": return s("milestoneId") !== null ? `Milestone ${Number(s("milestoneId")) + 1}` : null;
    default: return null;
  }
}

export function ActivityTab({ address }: { address: string }) {
  const q = useActivity(address);
  return (
    <Card className="space-y-space-md">
      <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-primary"><Icon name="history" /> Activity</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Every entry is an event emitted by the contract, with its transaction on the explorer.</p>
      {q.isLoading && <Skeleton className="h-24 w-full" />}
      {q.isError && <Notice tone="error" icon="error">The activity could not be loaded.</Notice>}
      {q.data && q.data.items.length === 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">No events yet.</p>}
      <ol className="space-y-space-sm">
        {q.data?.items.map((e) => {
          const l = LABEL[e.type] ?? { icon: "bolt", text: e.type };
          const extra = detail(e);
          return (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#e2e8f0] p-space-md">
              <div className="flex items-start gap-space-sm">
                <Icon name={l.icon} className="mt-0.5 text-primary" />
                <div>
                  <div className="font-label-md text-label-md text-on-surface">{l.text}</div>
                  {extra && <div className="font-body-sm text-body-sm text-on-surface-variant">{extra}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-code-xs text-code-xs text-on-surface-variant">
                    {e.actor && <span>By <Mono value={e.actor} kind="address" /></span>}
                    <span>Block {e.blockNumber.toLocaleString("en-US")}</span>
                    <span>{formatUtc(e.at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!e.confirmed && <Chip tone="pending" icon="hourglass_top">Waiting for confirmations</Chip>}
                <Mono value={e.txHash} kind="tx" />
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
