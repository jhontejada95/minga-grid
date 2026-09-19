"use client";

import { useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { ApiError } from "@/data/api";
import { useAgreement, useRefreshAgreement } from "@/data/queries";
import { useSession } from "@/data/session";
import { ROLE_LABEL } from "@/lib/role";
import { AgreementStatusChip, Button, Chip, Icon, MilestoneStatusChip, Mono, Notice, Skeleton } from "@/components/ui";
import { ActivityTab } from "./ActivityTab";
import { MilestoneTab } from "./MilestoneTab";
import { OverviewTab } from "./OverviewTab";
import { useActor } from "./shared";
import type { AgreementDetail } from "@/data/types";

type Tab = "overview" | "m0" | "m1" | "activity";

function Loaded({ a }: { a: AgreementDetail }) {
  const actor = useActor(a);
  const [tab, setTab] = useState<Tab>("overview");
  const [chainOk, setChainOk] = useState(false);
  const refresh = useRefreshAgreement(a.address);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: { key: Tab; label: string; badge?: React.ReactNode }[] = [
    { key: "overview", label: "Overview" },
    { key: "m0", label: "Milestone 1", badge: <MilestoneStatusChip status={a.milestones[0].status} /> },
    { key: "m1", label: "Milestone 2", badge: <MilestoneStatusChip status={a.milestones[1].status} /> },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="mx-auto max-w-[1100px] space-y-space-lg px-margin-mobile pb-space-2xl pt-space-lg md:px-margin">
      <Link href="/app" className="inline-flex items-center gap-1 font-label-md text-label-md text-secondary hover:underline"><Icon name="arrow_back" className="!text-[16px]" /> All agreements</Link>

      <header className="space-y-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <h1 className="font-headline-xl text-headline-xl text-primary">{a.projectName}</h1>
          {a.demo && <Chip tone="neutral">Demo</Chip>}
          <AgreementStatusChip status={a.status} />
        </div>
        <div className="flex flex-wrap items-center gap-space-md font-code-xs text-code-xs text-on-surface-variant">
          <span className="flex items-center gap-1">Agreement <Mono value={a.address} kind="address" /></span>
          <span>{actor.isConnected ? <>You are the <strong className="text-on-surface">{ROLE_LABEL[actor.role].toLowerCase()}</strong> here</> : "Not connected — read-only"}</span>
          <span className="flex items-center gap-1">
            Indexed to block {a.freshness.lastIndexedBlock.toLocaleString("en-US")}{a.freshness.syncing ? " · syncing" : ""}
            <button
              type="button" className="ml-1 inline-flex items-center gap-1 text-secondary hover:underline disabled:opacity-50" disabled={refreshing}
              onClick={async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } }}
            >
              <Icon name="refresh" className={`!text-[14px] ${refreshing ? "animate-spin" : ""}`} /> Refresh from chain
            </button>
          </span>
        </div>
      </header>

      <div role="tablist" aria-label="Agreement sections" className="flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
        {tabs.map((t) => (
          <button
            key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} type="button" onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-space-md py-space-sm font-label-md text-label-md ${tab === t.key ? "border-primary-container text-primary" : "border-transparent text-on-surface-variant hover:text-primary"}`}
          >
            {t.label}{t.badge}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && <OverviewTab a={a} actor={actor} onVerified={setChainOk} chainOk={chainOk} />}
        {tab === "m0" && <MilestoneTab a={a} id={0} actor={actor} />}
        {tab === "m1" && <MilestoneTab a={a} id={1} actor={actor} />}
        {tab === "activity" && <ActivityTab address={a.address} />}
      </div>
    </div>
  );
}

export function AgreementView({ address }: { address: string }) {
  const { sessionWallet } = useSession();
  const valid = isAddress(address);
  const q = useAgreement(valid ? address : "0x0000000000000000000000000000000000000000", sessionWallet);
  const refresh = useRefreshAgreement(address);
  const [checking, setChecking] = useState(false);

  if (!valid) {
    return <div className="mx-auto max-w-[720px] px-margin-mobile pt-space-xl"><Notice tone="error" icon="error">“{address}” is not a valid agreement address.</Notice></div>;
  }
  if (q.isLoading) {
    return <div className="mx-auto max-w-[1100px] space-y-space-md px-margin-mobile pt-space-xl"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-[720px] space-y-space-md px-margin-mobile pt-space-xl">
        <Notice tone={notFound ? "warn" : "error"} icon={notFound ? "search_off" : "cloud_off"}>
          {notFound
            ? "This agreement is not in the registry yet. If you just created it, the indexer needs a few seconds to see the transaction."
            : "The agreement could not be loaded. Is the backend running?"}
        </Notice>
        <div className="flex gap-space-sm">
          <Button variant="secondary" busy={checking} onClick={async () => { setChecking(true); try { await refresh(); await q.refetch(); } finally { setChecking(false); } }}>Check again</Button>
          <Link href="/app"><Button variant="ghost">Back to agreements</Button></Link>
        </div>
      </div>
    );
  }
  return <Loaded a={q.data} />;
}
