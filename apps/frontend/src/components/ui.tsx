"use client";

import { useState } from "react";
import clsx from "clsx";
import { explorerAddress, explorerTx, shortAddress, shortHash } from "@/lib/format";
import type { TxState } from "@/data/tx";
import type { AgreementStatus, MilestoneStatus } from "@/data/types";

export function Icon({ name, className, filled }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span aria-hidden="true" className={clsx("material-symbols-outlined", filled && "filled", className)}>
      {name}
    </span>
  );
}

type Tone = "verified" | "pending" | "info" | "neutral" | "danger";

const TONES: Record<Tone, string> = {
  verified: "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]",
  pending: "bg-[#fffbeb] text-[#92400e] border-[#fde68a]",
  info: "bg-[#f0f9ff] text-[#0369a1] border-[#bae6fd]",
  neutral: "bg-surface-container text-on-surface-variant border-outline-variant",
  danger: "bg-error-container text-on-error-container border-[#f5b5ad]",
};

/** Status chips always pair an icon with a label, so color is never the only signal. */
export function Chip({ tone, icon, children, className }: { tone: Tone; icon?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-code-xs text-code-xs uppercase", TONES[tone], className)}>
      {icon && <Icon name={icon} className="!text-[14px]" />}
      {children}
    </span>
  );
}

const AGREEMENT_CHIP: Record<AgreementStatus, { tone: Tone; icon: string; label: string }> = {
  AWAITING_ACCEPTANCE: { tone: "pending", icon: "hourglass_top", label: "Awaiting acceptance" },
  READY_TO_FUND: { tone: "info", icon: "account_balance_wallet", label: "Ready to fund" },
  EXPIRED_UNFUNDED: { tone: "neutral", icon: "event_busy", label: "Expired unfunded" },
  FUNDED: { tone: "verified", icon: "lock", label: "Funded" },
  FIRST_MILESTONE_PAID: { tone: "verified", icon: "check_circle", label: "Milestone 1 paid" },
  COMPLETED: { tone: "verified", icon: "task_alt", label: "Completed" },
  EXPIRED_REFUNDABLE: { tone: "pending", icon: "undo", label: "Expired · refundable" },
  REFUNDED: { tone: "neutral", icon: "undo", label: "Refunded" },
};

export function AgreementStatusChip({ status }: { status: AgreementStatus }) {
  const c = AGREEMENT_CHIP[status];
  return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>;
}

const MILESTONE_CHIP: Record<MilestoneStatus, { tone: Tone; icon: string; label: string }> = {
  LOCKED: { tone: "neutral", icon: "lock", label: "Locked" },
  COLLECTING_EVIDENCE: { tone: "info", icon: "upload_file", label: "Collecting evidence" },
  AWAITING_SIGNATURES: { tone: "pending", icon: "draw", label: "Awaiting signatures" },
  READY_TO_RELEASE: { tone: "info", icon: "payments", label: "Ready to release" },
  PAID: { tone: "verified", icon: "check_circle", label: "Paid" },
  EXPIRED: { tone: "neutral", icon: "event_busy", label: "Expired" },
};

export function MilestoneStatusChip({ status }: { status: MilestoneStatus }) {
  const c = MILESTONE_CHIP[status];
  return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>;
}

type ButtonVariant = "primary" | "secondary" | "onchain" | "danger" | "ghost";
const BUTTONS: Record<ButtonVariant, string> = {
  primary: "bg-primary-container text-on-primary hover:bg-primary",
  secondary: "bg-surface-container-lowest text-primary border border-[#cbd5e1] hover:bg-[#f0fdf4]",
  // Estuary blue is reserved for actions that trigger a wallet signature or a contract call.
  onchain: "bg-[#0077b6] text-white hover:bg-[#006399]",
  danger: "bg-surface-container-lowest text-error border border-error/40 hover:bg-error-container",
  ghost: "text-primary hover:bg-surface-container",
};

export function Button({
  variant = "primary", busy, disabled, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-space-lg py-2.5 font-label-md text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        BUTTONS[variant], className,
      )}
    >
      {busy && <Icon name="progress_activity" className="!text-[18px] animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-space-lg", className)}>{children}</div>;
}

export function Notice({ tone = "info", icon, children, className }: { tone?: "info" | "warn" | "error" | "ok"; icon?: string; children: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
    warn: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    error: "border-[#f5b5ad] bg-error-container text-on-error-container",
    ok: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex items-start gap-space-sm rounded-lg border p-space-md font-body-sm text-body-sm", styles, className)}>
      {icon && <Icon name={icon} className="!text-[18px] mt-0.5" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Address or hash in monospace with copy and (optionally) explorer link. Never a free-text field. */
export function Mono({ value, kind, short = true, className }: { value: string; kind?: "address" | "tx"; short?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const label = kind === "address" ? shortAddress(value) : short ? shortHash(value) : value;
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-1 font-code-sm text-code-sm", className)}>
      <span className="truncate" title={value}>{label}</span>
      <button
        type="button"
        aria-label="Copy"
        className="shrink-0 text-outline hover:text-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch { /* clipboard unavailable */ }
        }}
      >
        <Icon name={copied ? "check" : "content_copy"} className="!text-[14px]" />
      </button>
      {kind && (
        <a
          href={kind === "address" ? explorerAddress(value) : explorerTx(value)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on explorer"
          className="shrink-0 text-secondary hover:text-on-secondary-container"
        >
          <Icon name="open_in_new" className="!text-[14px]" />
        </a>
      )}
    </span>
  );
}

export function MetricTile({ label, value, sub, accent, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: "green" | "blue" | "amber"; className?: string }) {
  const top = accent === "green" ? "border-t-2 border-t-primary-container" : accent === "blue" ? "border-t-2 border-t-[#0077b6]" : accent === "amber" ? "border-t-2 border-t-tertiary-fixed-dim" : "";
  return (
    <div className={clsx("rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-space-md", top, className)}>
      <div className="font-label-md text-label-md uppercase text-on-surface-variant">{label}</div>
      <div className="mt-1 font-headline-lg text-headline-lg text-on-surface">{value}</div>
      {sub && <div className="mt-1 font-code-xs text-code-xs text-on-surface-variant">{sub}</div>}
    </div>
  );
}

/** Live status of one on-chain action: pending with hash, confirmed, rejected, simulation failed (no hash), failed. */
export function TxStatus({ state }: { state: TxState }) {
  if (state.phase === "idle") return null;
  const lines: Record<Exclude<TxState["phase"], "idle">, { icon: string; tone: "info" | "warn" | "error" | "ok"; text: string }> = {
    simulating: { icon: "progress_activity", tone: "info", text: "Checking that the transaction will succeed (no gas)…" },
    "awaiting-wallet": { icon: "account_balance_wallet", tone: "info", text: "Waiting for your wallet…" },
    submitted: { icon: "progress_activity", tone: "info", text: "Pending — waiting for confirmation on HSK." },
    confirmed: { icon: "check_circle", tone: "ok", text: "Confirmed on-chain." },
    rejected: { icon: "cancel", tone: "warn", text: state.error?.message ?? "Cancelled in your wallet. Nothing was sent." },
    "simulation-failed": { icon: "error", tone: "error", text: `${state.error?.message ?? "The transaction would fail."} Simulation failed. No transaction was sent.` },
    failed: { icon: "error", tone: "error", text: state.error?.message ?? "The transaction failed. Nothing was changed." },
  };
  const l = lines[state.phase];
  return (
    <div aria-live="polite" className="mt-space-sm">
      <Notice tone={l.tone} icon={l.icon}>
        <span>{l.text}</span>
        {state.hash && (
          <span className="ml-2 inline-flex">
            <Mono value={state.hash} kind="tx" />
          </span>
        )}
        {state.error?.technical && state.phase !== "confirmed" && (
          <details className="mt-1">
            <summary className="cursor-pointer text-code-xs">Technical details</summary>
            <p className="mt-1 break-words font-code-xs text-code-xs">{state.error.technical}</p>
          </details>
        )}
      </Notice>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-surface-container", className)} />;
}
