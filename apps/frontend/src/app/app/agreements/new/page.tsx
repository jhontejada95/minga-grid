"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseEventLogs } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { agreementFactoryRegistryAbi } from "@minga/shared";
import { chain, FACTORY_ADDRESS, MOCK_USD_ADDRESS } from "@/lib/config";
import { formatAmount, parseAmount } from "@/lib/format";
import { translateError } from "@/lib/errors";
import { api } from "@/data/api";
import { useSession, useSignIn } from "@/data/session";
import { useOnchainAction } from "@/data/tx";
import type { DraftResult } from "@/data/types";
import { Button, Card, Icon, Notice, TxStatus } from "@/components/ui";

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

interface Form {
  name: string; description: string; region: string; country: string; methodName: string; methodVersion: string;
  community: string; reviewer: string; payeeCommunity: string; payeeMonitoring: string; share: string;
  m1Title: string; m1Amount: string; m1Req: string; m2Title: string; m2Amount: string; m2Req: string;
  funding: string; execution: string;
}

/** `datetime-local` value (in the browser's timezone) for `ms` from now. */
const localInput = (ms: number) => {
  const d = new Date(Date.now() + ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const toSeconds = (v: string) => Math.floor(Date.parse(v) / 1000);
const utcLabel = (v: string) => (Number.isNaN(Date.parse(v)) ? "" : new Date(v).toISOString().slice(0, 16).replace("T", " ") + " UTC");

const EMPTY: Form = {
  name: "", description: "", region: "", country: "", methodName: "", methodVersion: "",
  community: "", reviewer: "", payeeCommunity: "", payeeMonitoring: "", share: "80",
  m1Title: "", m1Amount: "50", m1Req: "", m2Title: "", m2Amount: "50", m2Req: "",
  // Filled in after mount: "now" differs between the server render and the browser.
  funding: "", execution: "",
};

const DEMO_FILL: Partial<Form> = {
  name: "Pacific Mangrove — Demo",
  description: "Restoration and sustainable protection of degraded mangrove ecosystems along the Colombian Pacific coast (fictional demonstration project).",
  region: "Chocó Biogeographic / Pacific Coast", country: "Colombia",
  methodName: "Demonstration Community Coastal Mangrove Standard", methodVersion: "1.0",
  m1Title: "Baseline Survey and Community Work Plan", m1Amount: "50",
  m1Req: "baseline-survey-v1: Baseline survey report\ncommunity-assembly-resolution: Community assembly resolution",
  m2Title: "Year 1 Restoration and Canopy Density Report", m2Amount: "50",
  m2Req: "restoration-monitoring-report-y1: Year 1 restoration monitoring report\ndrone-canopy-orthomosaic: Canopy orthomosaic (drone survey)",
};

function parseRequirements(text: string): { key: string; description: string }[] | null {
  const out: { key: string; description: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(":");
    const key = (i < 0 ? line : line.slice(0, i)).trim();
    const description = (i < 0 ? key : line.slice(i + 1).trim()) || key;
    if (!KEY_RE.test(key)) return null;
    out.push({ key, description: description.slice(0, 400) });
  }
  return out.length >= 1 && out.length <= 20 ? out : null;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-label-md text-label-md text-on-surface">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block font-code-xs text-code-xs text-on-surface-variant">{hint}</span>}
      {error && <span className="mt-1 block font-code-xs text-code-xs text-error" role="alert">{error}</span>}
    </label>
  );
}

const inputCls = "mt-1 w-full rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 py-2 font-body-md text-body-md focus:border-primary-container";

export default function CreateAgreementPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: chain.id });
  const { signedIn } = useSession();
  const signIn = useSignIn();
  const tx = useOnchainAction();

  const [f, setF] = useState<Form>(EMPTY);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    setF((p) => (p.funding ? p : { ...p, funding: localInput(24 * 3600_000), execution: localInput(30 * 24 * 3600_000) }));
  }, []);
  const [step, setStep] = useState<"form" | "review">("form");
  const [progress, setProgress] = useState<string[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const parsed = useMemo(() => {
    const errors: Partial<Record<keyof Form | "roles" | "token", string>> = {};
    const lower = (s: string) => s.trim().toLowerCase();
    if (!f.name.trim()) errors.name = "Give the project a name.";
    else if (f.name.length > 120) errors.name = "Keep it under 120 characters.";
    if (f.description.length > 2000) errors.description = "Keep it under 2,000 characters.";
    for (const k of ["community", "reviewer", "payeeCommunity", "payeeMonitoring"] as const) {
      if (!isAddress(f[k].trim())) errors[k] = "Enter a valid wallet address (0x…).";
    }
    if (!errors.community && !errors.reviewer) {
      if (address && (lower(f.community) === lower(address) || lower(f.reviewer) === lower(address))) errors.roles = "Your wallet is the funder: it cannot also be the community representative or the reviewer.";
      else if (lower(f.community) === lower(f.reviewer)) errors.roles = "The community representative and the reviewer must be different wallets.";
    }
    if (!errors.payeeCommunity && !errors.payeeMonitoring && lower(f.payeeCommunity) === lower(f.payeeMonitoring)) errors.payeeMonitoring = "The two payment recipients must be different.";
    const bps = parseAmount(f.share, 2);
    if (bps === null || bps < 1n || bps > 9999n) errors.share = "Enter a share between 0.01 and 99.99.";
    const a1 = parseAmount(f.m1Amount);
    const a2 = parseAmount(f.m2Amount);
    if (a1 === null || a1 <= 0n) errors.m1Amount = "Enter an amount greater than zero (up to 6 decimals).";
    if (a2 === null || a2 <= 0n) errors.m2Amount = "Enter an amount greater than zero (up to 6 decimals).";
    if (!f.m1Title.trim()) errors.m1Title = "Give milestone 1 a title.";
    if (!f.m2Title.trim()) errors.m2Title = "Give milestone 2 a title.";
    const r1 = parseRequirements(f.m1Req);
    const r2 = parseRequirements(f.m2Req);
    if (!r1) errors.m1Req = "One requirement per line as key: description. Keys use a-z, 0-9, dots, dashes (1–20 lines).";
    if (!r2) errors.m2Req = "One requirement per line as key: description. Keys use a-z, 0-9, dots, dashes (1–20 lines).";
    const fund = toSeconds(f.funding);
    const exec = toSeconds(f.execution);
    if (Number.isNaN(fund) || fund * 1000 <= Date.now()) errors.funding = "The funding deadline must be in the future.";
    if (Number.isNaN(exec) || exec <= fund) errors.execution = "The execution deadline must be after the funding deadline.";
    if (!MOCK_USD_ADDRESS) errors.token = "The demo token address is not configured (NEXT_PUBLIC_MOCK_USD_ADDRESS).";
    return { errors, bps, a1, a2, r1, r2, fund, exec };
  }, [f, address]);

  const valid = Object.keys(parsed.errors).length === 0;
  // Field errors only appear once the person has tried to continue, so an empty form is not covered in red.
  const shown: typeof parsed.errors = attempted ? parsed.errors : {};
  const total = parsed.a1 !== null && parsed.a2 !== null ? parsed.a1 + parsed.a2 : null;
  const communityAmt = parsed.a1 !== null && parsed.bps !== null ? (parsed.a1 * parsed.bps) / 10000n : null;
  const monitoringAmt = parsed.a1 !== null && communityAmt !== null ? parsed.a1 - communityAmt : null;
  const wrongChain = isConnected && chainId !== chain.id;
  const blocked = !FACTORY_ADDRESS ? "The factory address is not configured (NEXT_PUBLIC_FACTORY_ADDRESS)." : !isConnected ? "Connect your wallet to create an agreement." : wrongChain ? "Switch to the right network first (see the alert above)." : null;

  async function submit() {
    if (!valid || !FACTORY_ADDRESS || !MOCK_USD_ADDRESS || !publicClient || running) return;
    setRunning(true);
    setFatal(null);
    setProgress([]);
    const log = (s: string) => setProgress((p) => [...p, s]);
    try {
      // The contract compares against chain time, so validate the funding window against the latest block too.
      const block = await publicClient.getBlock({ blockTag: "latest" });
      if (BigInt(parsed.fund) <= block.timestamp) throw new Error("The funding deadline is already in the past on-chain. Pick a later time.");

      if (!signedIn) {
        log("Signing in (free, no payment)…");
        await signIn.mutateAsync();
      }
      log("Saving the public metadata…");
      const draft = await api<DraftResult>("/api/v1/agreement-drafts", {
        json: {
          metadata: {
            projectId: f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "project",
            name: f.name.trim(),
            description: f.description.trim(),
            ...(f.region.trim() || f.country.trim() ? { location: { ...(f.region.trim() && { region: f.region.trim() }), ...(f.country.trim() && { country: f.country.trim() }) } } : {}),
            ...(f.methodName.trim() ? { methodology: { name: f.methodName.trim(), version: f.methodVersion.trim() || "1.0" } } : {}),
            currency: "mUSD",
            totalBudget: total!.toString(),
            communitySplitBps: Number(parsed.bps),
            milestones: [
              { id: 0, title: f.m1Title.trim(), amount: parsed.a1!.toString(), requiredEvidence: parsed.r1 },
              { id: 1, title: f.m2Title.trim(), amount: parsed.a2!.toString(), requiredEvidence: parsed.r2 },
            ],
          },
        },
      });

      log("Waiting for your wallet to create the agreement on HSK…");
      const receipt = await tx.run({
        address: FACTORY_ADDRESS,
        abi: agreementFactoryRegistryAbi as never,
        functionName: "createAgreement",
        args: [{
          communitySigner: f.community.trim(), verifierSigner: f.reviewer.trim(), token: MOCK_USD_ADDRESS,
          projectRefHash: draft.projectRefHash, metadataHash: draft.metadataHash, methodologyHash: draft.methodologyHash,
          payeeCommunity: f.payeeCommunity.trim(), payeeMonitoring: f.payeeMonitoring.trim(), communityBps: parsed.bps!,
          milestoneAmounts: [parsed.a1!, parsed.a2!], fundingDeadline: BigInt(parsed.fund), executionDeadline: BigInt(parsed.exec), demoMode: true,
        }],
      });
      if (!receipt) return;
      const created = parseEventLogs({ abi: agreementFactoryRegistryAbi, logs: receipt.logs, eventName: "AgreementCreated" })[0];
      const created_address = created?.args.agreementAddress;
      if (!created_address) throw new Error("The agreement was created but its address could not be read from the receipt.");
      log("Confirmed. Opening the agreement…");
      router.push(`/app/agreements/${created_address}`);
    } catch (err) {
      setFatal(translateError(err).message === "Something went wrong. Nothing was changed." && err instanceof Error ? err.message : translateError(err).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-space-lg px-margin-mobile pb-space-2xl pt-space-lg md:px-margin">
      <div>
        <span className="font-code-xs text-code-xs font-medium uppercase tracking-widest text-secondary">New agreement</span>
        <h1 className="mt-1 font-headline-xl text-headline-xl text-primary">Create an agreement</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          You will be the funder of this agreement. Your wallet cannot also be a signer. The terms below become immutable once the agreement is created.
        </p>
      </div>

      {blocked && <Notice tone="warn" icon="info">{blocked}</Notice>}

      {step === "form" ? (
        <form className="space-y-space-lg" onSubmit={(e) => { e.preventDefault(); setAttempted(true); if (valid) setStep("review"); }} noValidate>
          <Card className="space-y-space-md">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-primary">Project</h2>
              <button type="button" className="font-label-md text-label-md text-secondary hover:underline" onClick={() => setF((p) => ({ ...p, ...DEMO_FILL }))}>Fill with the demo example</button>
            </div>
            <Field label="Project name" error={shown.name}><input className={inputCls} value={f.name} onChange={set("name")} maxLength={120} /></Field>
            <Field label="Short description" error={shown.description}><textarea className={inputCls} rows={3} value={f.description} onChange={set("description")} /></Field>
            <div className="grid gap-space-md md:grid-cols-2">
              <Field label="Region"><input className={inputCls} value={f.region} onChange={set("region")} /></Field>
              <Field label="Country"><input className={inputCls} value={f.country} onChange={set("country")} /></Field>
              <Field label="Methodology reference"><input className={inputCls} value={f.methodName} onChange={set("methodName")} placeholder="Name of the document used" /></Field>
              <Field label="Methodology version"><input className={inputCls} value={f.methodVersion} onChange={set("methodVersion")} placeholder="1.0" /></Field>
            </div>
            <p className="font-code-xs text-code-xs text-outline">This information is public. Do not include anything private.</p>
          </Card>

          <Card className="space-y-space-md">
            <h2 className="font-headline-sm text-headline-sm text-primary">People and payments</h2>
            {parsed.errors.roles && <Notice tone="error" icon="error">{parsed.errors.roles}</Notice>}
            <div className="grid gap-space-md md:grid-cols-2">
              <Field label="Community representative (signs milestones)" error={shown.community}><input className={`${inputCls} font-code-sm`} value={f.community} onChange={set("community")} placeholder="0x…" spellCheck={false} /></Field>
              <Field label="Independent reviewer (signs milestones)" error={shown.reviewer}><input className={`${inputCls} font-code-sm`} value={f.reviewer} onChange={set("reviewer")} placeholder="0x…" spellCheck={false} /></Field>
              <Field label="Community payment recipient" hint="May be the same wallet as the community representative." error={shown.payeeCommunity}><input className={`${inputCls} font-code-sm`} value={f.payeeCommunity} onChange={set("payeeCommunity")} placeholder="0x…" spellCheck={false} /></Field>
              <Field label="Monitoring payment recipient" error={shown.payeeMonitoring}><input className={`${inputCls} font-code-sm`} value={f.payeeMonitoring} onChange={set("payeeMonitoring")} placeholder="0x…" spellCheck={false} /></Field>
              <Field label="Community share (%)" hint={communityAmt !== null && monitoringAmt !== null ? `Each milestone 1 payment: ${formatAmount(communityAmt)} mUSD to the community, ${formatAmount(monitoringAmt)} mUSD to monitoring.` : undefined} error={shown.share}>
                <input className={inputCls} inputMode="decimal" value={f.share} onChange={set("share")} />
              </Field>
            </div>
            <p className="font-code-xs text-code-xs text-outline">Token: mUSD — a demo token with no monetary value. Mode: demonstration.</p>
            {parsed.errors.token && <Notice tone="error">{parsed.errors.token}</Notice>}
          </Card>

          {([1, 2] as const).map((n) => {
            const t = n === 1 ? "m1Title" : "m2Title";
            const a = n === 1 ? "m1Amount" : "m2Amount";
            const r = n === 1 ? "m1Req" : "m2Req";
            return (
              <Card key={n} className="space-y-space-md">
                <h2 className="font-headline-sm text-headline-sm text-primary">Milestone {n}</h2>
                <div className="grid gap-space-md md:grid-cols-[2fr_1fr]">
                  <Field label="Title" error={shown[t]}><input className={inputCls} value={f[t]} onChange={set(t)} /></Field>
                  <Field label="Amount (mUSD)" error={shown[a]}><input className={inputCls} inputMode="decimal" value={f[a]} onChange={set(a)} /></Field>
                </div>
                <Field label="Required evidence (one per line: key: description)" error={shown[r]}>
                  <textarea className={`${inputCls} font-code-sm`} rows={3} value={f[r]} onChange={set(r)} spellCheck={false} placeholder="baseline-survey-v1: Baseline survey report" />
                </Field>
              </Card>
            );
          })}

          <Card className="space-y-space-md">
            <h2 className="font-headline-sm text-headline-sm text-primary">Deadlines</h2>
            <div className="grid gap-space-md md:grid-cols-2">
              <Field label="Funding deadline" hint={utcLabel(f.funding)} error={shown.funding}><input type="datetime-local" className={inputCls} value={f.funding} onChange={set("funding")} /></Field>
              <Field label="Execution deadline" hint={utcLabel(f.execution)} error={shown.execution}><input type="datetime-local" className={inputCls} value={f.execution} onChange={set("execution")} /></Field>
            </div>
            <p className="font-code-xs text-code-xs text-outline">Shown in your local time and converted to UTC. After the execution deadline, unspent funds can be refunded to the funder.</p>
          </Card>

          <div className="flex items-center justify-between">
            <div className="font-headline-sm text-headline-sm text-primary">Total budget: {total !== null ? `${formatAmount(total)} mUSD` : "—"}</div>
            <div className="flex items-center gap-space-md">
              {attempted && !valid && <span role="alert" className="font-body-sm text-body-sm text-error">Fix the highlighted fields to continue.</span>}
              <Button type="submit" variant="primary">Review agreement</Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-space-lg">
          <Card className="space-y-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">Review before creating</h2>
            <dl className="grid gap-x-space-lg gap-y-space-sm font-body-md text-body-md md:grid-cols-2">
              <Row k="Project" v={f.name} />
              <Row k="Total budget" v={`${total !== null ? formatAmount(total) : "—"} mUSD`} />
              <Row k="Funder (you)" v={address ?? "—"} mono />
              <Row k="Community representative" v={f.community.trim()} mono />
              <Row k="Independent reviewer" v={f.reviewer.trim()} mono />
              <Row k="Community recipient" v={f.payeeCommunity.trim()} mono />
              <Row k="Monitoring recipient" v={f.payeeMonitoring.trim()} mono />
              <Row k="Split" v={`${f.share}% community / ${(100 - Number(f.share)).toFixed(2)}% monitoring`} />
              <Row k="Milestone 1" v={`${f.m1Title} — ${f.m1Amount} mUSD`} />
              <Row k="Milestone 2" v={`${f.m2Title} — ${f.m2Amount} mUSD`} />
              <Row k="Funding deadline" v={utcLabel(f.funding)} />
              <Row k="Execution deadline" v={utcLabel(f.execution)} />
            </dl>
            <Notice tone="info" icon="info">Creating the agreement is a wallet transaction that costs a little HSK for gas. The terms cannot be edited afterwards.</Notice>
          </Card>

          {progress.length > 0 && (
            <Card>
              <ol className="space-y-1 font-body-md text-body-md">
                {progress.map((p, i) => (
                  <li key={p} className="flex items-center gap-2 text-on-surface-variant">
                    <Icon name={i === progress.length - 1 && running ? "progress_activity" : "check_circle"} className={`!text-[18px] ${i === progress.length - 1 && running ? "animate-spin" : "text-[#166534]"}`} /> {p}
                  </li>
                ))}
              </ol>
              <TxStatus state={tx.state} />
            </Card>
          )}
          {fatal && <Notice tone="error" icon="error">{fatal}</Notice>}
          {signIn.error && <Notice tone="error" icon="error">{translateError(signIn.error).message}</Notice>}

          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={running} onClick={() => { setStep("form"); setProgress([]); setFatal(null); tx.reset(); }}>Back to edit</Button>
            <Button variant="onchain" busy={running} disabled={Boolean(blocked) || !valid} onClick={submit}>
              <Icon name="draw" className="!text-[18px]" /> Create agreement on HSK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-code-xs text-code-xs uppercase text-on-surface-variant">{k}</dt>
      <dd className={mono ? "break-all font-code-sm text-code-sm" : ""}>{v}</dd>
    </div>
  );
}
