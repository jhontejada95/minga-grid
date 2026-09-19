"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatAmount, shortAddress } from "@/lib/format";
import { roleOf, ROLE_LABEL, type Role } from "@/lib/role";
import { useAgreements, useHealth } from "@/data/queries";
import type { AgreementStatus, AgreementSummary } from "@/data/types";
import { AgreementCard } from "@/components/AgreementCard";
import { Button, Icon, MetricTile, Notice, Skeleton } from "@/components/ui";

const FILTERS: { key: string; label: string; test: (a: AgreementSummary) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "demo", label: "Demo", test: (a) => a.demo },
  { key: "funded", label: "Funded", test: (a) => ["FUNDED", "FIRST_MILESTONE_PAID"].includes(a.status) },
  { key: "awaiting", label: "Awaiting acceptance", test: (a) => a.status === "AWAITING_ACCEPTANCE" || a.status === "READY_TO_FUND" },
  { key: "done", label: "Completed or closed", test: (a) => (["COMPLETED", "REFUNDED", "EXPIRED_UNFUNDED", "EXPIRED_REFUNDABLE"] as AgreementStatus[]).includes(a.status) },
];

const GROUPS: { role: Exclude<Role, "OBSERVER">; icon: string; blurb?: string }[] = [
  { role: "FUNDER", icon: "account_balance" },
  { role: "COMMUNITY", icon: "groups" },
  { role: "REVIEWER", icon: "rule" },
];

function RoleGroup({ role, icon, items, wallet }: { role: Exclude<Role, "OBSERVER">; icon: string; items: AgreementSummary[]; wallet: string }) {
  const [open, setOpen] = useState(items.length > 0);
  const title = role === "FUNDER" ? "As funder" : role === "COMMUNITY" ? "As community representative" : "As independent reviewer";
  return (
    <section className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-space-md p-space-md text-left">
        <span className="flex items-center gap-space-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-on-primary"><Icon name={icon} className="!text-[20px]" /></span>
          <span className="font-headline-sm text-headline-sm text-on-surface">{title}</span>
          <span className="font-code-xs text-code-xs text-on-surface-variant">({items.length} {items.length === 1 ? "agreement" : "agreements"})</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {open && (
        <div className="space-y-space-md border-t border-[#e2e8f0] p-space-md">
          {items.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">No agreements where you take part as {ROLE_LABEL[role].toLowerCase()}.</p>
          ) : (
            items.map((a) => <AgreementCard key={a.address} agreement={a} wallet={wallet} />)
          )}
        </div>
      )}
    </section>
  );
}

export default function AgreementsHome() {
  const { address, isConnected } = useAccount();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const list = useAgreements({ pageSize: 50 });
  const health = useHealth();

  const all = list.data?.items ?? [];
  const mine = useMemo(() => {
    const groups: Record<string, AgreementSummary[]> = { FUNDER: [], COMMUNITY: [], REVIEWER: [] };
    if (address) for (const a of all) { const r = roleOf(a, address); if (r !== "OBSERVER") groups[r]!.push(a); }
    return groups;
  }, [all, address]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]!;
    const q = query.trim().toLowerCase();
    return all.filter((a) => f.test(a) && (!q || a.projectName.toLowerCase().includes(q) || a.address.includes(q)));
  }, [all, filter, query]);

  const committed = all.reduce((s, a) => s + BigInt(a.totalBudget), 0n);
  const paid = all.reduce((s, a) => s + BigInt(a.totalPaid), 0n);
  const active = all.filter((a) => ["FUNDED", "FIRST_MILESTONE_PAID"].includes(a.status)).length;

  return (
    <div className="mx-auto max-w-[1280px] space-y-space-xl px-margin-mobile pb-space-2xl pt-space-lg md:px-margin">
      <div className="flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <span className="font-code-xs text-code-xs font-medium uppercase tracking-widest text-secondary">Agreements registry</span>
          <h1 className="mt-1 font-headline-xl text-headline-xl text-primary">Agreements</h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">
            Conservation agreements registered on HSK Chain. Every payment needs the same approval from the community representative and the independent reviewer.
          </p>
        </div>
        <Link href="/app/agreements/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-space-lg py-3 font-label-md text-label-md text-on-primary hover:bg-primary-container">
          <Icon name="add_circle" className="!text-[18px]" /> Create agreement
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-space-md lg:grid-cols-4">
        <MetricTile label="Total committed" value={<>{formatAmount(committed)} <span className="font-code-xs text-code-xs text-on-surface-variant">mUSD</span></>} sub={`Across ${all.length} ${all.length === 1 ? "agreement" : "agreements"}`} />
        <MetricTile label="Active escrows" value={active} sub="Funded and in progress" />
        <MetricTile label="Paid out" value={<>{formatAmount(paid)} <span className="font-code-xs text-code-xs text-on-surface-variant">mUSD</span></>} sub="Confirmed milestone payments" accent="green" />
        <MetricTile label="Network" value={`HSK ${health.data?.chainId ?? 133}`} sub={health.data ? `Block #${health.data.indexer.headBlock.toLocaleString("en-US")}` : health.isError ? "Backend unreachable" : "Connecting…"} accent="blue" />
      </div>

      {list.isError && <Notice tone="error" icon="cloud_off">Agreements could not be loaded. Is the backend running on the configured API address?</Notice>}

      <section aria-labelledby="positions">
        <div className="mb-space-md flex items-center justify-between">
          <h2 id="positions" className="flex items-center gap-2 font-headline-lg text-headline-lg text-on-surface"><Icon name="badge" className="text-primary" /> Your participant positions</h2>
          {address && <span className="rounded bg-surface-container px-2 py-1 font-code-xs text-code-xs text-on-surface-variant">Wallet: {shortAddress(address)}</span>}
        </div>
        {!isConnected || !address ? (
          <Notice tone="info" icon="account_balance_wallet">Connect a wallet to see the agreements where you are the funder, the community representative or the reviewer. Everyone can browse the registry below.</Notice>
        ) : list.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-space-sm">
            {GROUPS.map((g) => <RoleGroup key={g.role} role={g.role} icon={g.icon} items={mine[g.role]!} wallet={address} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="registry">
        <div className="mb-space-md flex flex-wrap items-center justify-between gap-space-md">
          <h2 id="registry" className="flex items-center gap-2 font-headline-lg text-headline-lg text-on-surface"><Icon name="public" className="text-primary" /> All agreements
            <span className="rounded-full bg-surface-container px-2 py-0.5 font-code-xs text-code-xs">{filtered.length} records</span>
          </h2>
          <div className="flex flex-wrap items-center gap-space-sm">
            <label className="relative">
              <span className="sr-only">Search agreements</span>
              <Icon name="search" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 !text-[18px] text-outline" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or address"
                className="w-56 rounded border border-[#cbd5e1] bg-surface-container-lowest py-2 pl-8 pr-2 font-body-sm text-body-sm focus:border-primary-container"
              />
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter agreements">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded px-3 py-1.5 font-label-md text-label-md ${filter === f.key ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {list.isLoading ? (
          <div className="space-y-space-md"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-space-xl text-center">
            <p className="font-headline-sm text-headline-sm text-on-surface">{all.length === 0 ? "No agreements yet" : "No agreements match this filter"}</p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {all.length === 0 ? "Create the first agreement to see it here after the indexer picks it up (a few seconds)." : "Try another filter or search."}
            </p>
            {all.length === 0 && (
              <Link href="/app/agreements/new" className="mt-space-md inline-block"><Button variant="primary">Create agreement</Button></Link>
            )}
          </div>
        ) : (
          <div className="space-y-space-md">
            {filtered.map((a) => <AgreementCard key={a.address} agreement={a} wallet={address} />)}
          </div>
        )}
      </section>
    </div>
  );
}
