"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { translateError } from "@/lib/errors";
import { formatUtc } from "@/lib/format";
import { api } from "@/data/api";
import { useApiConfig, useReviews } from "@/data/queries";
import type { Manifest, Review } from "@/data/types";
import { Button, Card, Chip, Icon, Notice } from "@/components/ui";
import type { Actor } from "./shared";

const STATUS: Record<Review["status"], { tone: "verified" | "pending" | "neutral"; icon: string; label: string }> = {
  READY_FOR_HUMAN_REVIEW: { tone: "verified", icon: "fact_check", label: "Ready for human review" },
  INCOMPLETE: { tone: "pending", icon: "warning", label: "Incomplete" },
  UNAVAILABLE: { tone: "neutral", icon: "cloud_off", label: "Unavailable" },
};

function ReviewResult({ r }: { r: Review }) {
  const s = STATUS[r.status];
  const ai = r.ai;
  return (
    <div className="space-y-space-md">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>
        <Chip tone={r.mode === "MODEL_ASSISTED" ? "info" : "neutral"} icon={r.mode === "MODEL_ASSISTED" ? "smart_toy" : "rule"}>
          {r.mode === "MODEL_ASSISTED" ? `Model-assisted${ai.model ? ` · ${ai.model}` : ""}` : "Document checks only"}
        </Chip>
        <span className="font-code-xs text-code-xs text-on-surface-variant">{formatUtc(r.createdAt)}</span>
      </div>

      {r.missingRequirements.length > 0 && (
        <Notice tone="warn" icon="warning">
          Missing from this evidence version: <span className="font-code-sm text-code-sm">{r.missingRequirements.join(", ")}</span>
        </Notice>
      )}

      {ai.summary && (
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <div className="font-code-xs text-code-xs uppercase text-on-surface-variant">Model summary (not a decision)</div>
          <p className="mt-1 font-body-md text-body-md text-on-surface">{ai.summary}</p>
        </div>
      )}
      {ai.status !== "COMPLETED" && ai.reason && <Notice tone="info" icon="info">Model review: {ai.reason}</Notice>}

      <div>
        <div className="font-label-md text-label-md text-on-surface">Observations</div>
        {r.findings.length === 0 ? (
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">No observations were recorded.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {r.findings.map((f, i) => (
              <li key={i} className="rounded-lg border border-[#e2e8f0] p-space-sm font-body-sm text-body-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={f.source === "model" ? "info" : "neutral"}>{f.source === "model" ? "Model observation" : "Document check"}</Chip>
                  {f.source === "model" && f.supported === false && <Chip tone="pending" icon="help">Not confirmed in the text</Chip>}
                </div>
                <p className="mt-1 text-on-surface">{f.message}</p>
                {f.supportingExcerpt && <blockquote className="mt-1 border-l-2 border-outline-variant pl-2 font-code-xs text-code-xs text-on-surface-variant">{f.supportingExcerpt}</blockquote>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm">
        <div className="font-label-md text-label-md text-on-surface">External research</div>
        <p className="text-on-surface-variant">
          {r.externalResearch.status === "COMPLETED"
            ? `${r.externalResearch.runs ?? 1} paid lookup(s) via ${r.externalResearch.provider ?? "the research provider"}; spend ${r.externalResearch.spendUsd ?? "0"} USD.`
            : r.externalResearch.reason ?? "External research unavailable. The review continued without it."}
        </p>
        {r.externalResearch.sourceReferences && r.externalResearch.sourceReferences.length > 0 && (
          <ul className="mt-1 list-disc pl-5 font-code-xs text-code-xs text-on-surface-variant">
            {r.externalResearch.sourceReferences.map((u) => <li key={u} className="break-all">{u}</li>)}
          </ul>
        )}
      </div>

      {r.limitations.length > 0 && (
        <details className="font-body-sm text-body-sm text-on-surface-variant">
          <summary className="cursor-pointer font-label-md text-label-md text-on-surface">What this review does not cover</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export function ReviewPanel({ address, milestoneId, actor, current }: { address: string; milestoneId: 0 | 1; actor: Actor; current: Manifest | undefined }) {
  const qc = useQueryClient();
  const config = useApiConfig();
  const reviews = useReviews(address, milestoneId, true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forCurrent = current ? reviews.data?.reviews.find((r) => r.manifestHash.toLowerCase() === current.evidenceHash.toLowerCase()) : undefined;
  const older = reviews.data?.reviews.filter((r) => r !== forCurrent) ?? [];
  const f = config.data?.features;

  async function run() {
    if (!current) return;
    setError(null);
    setRunning(true);
    try {
      await api(`/api/v1/agreements/${address}/milestones/${milestoneId}/reviews`, { json: { manifestHash: current.evidenceHash } });
      await qc.invalidateQueries({ queryKey: ["reviews"] });
      await qc.invalidateQueries({ queryKey: ["research"] });
    } catch (e) {
      setError(translateError(e).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="space-y-space-md">
      <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-primary"><Icon name="fact_check" /> Evidence review</h3>
      <Notice tone="info" icon="info">
        A review helps a person read the evidence. It never approves a payment: only the community representative's and the reviewer's signatures do.
        {f?.aiReview ? ` Evidence text is sent to ${f.aiProvider ?? "the AI provider"} to produce the model summary.` : " The model summary is off, so only document checks run."}
        {f?.aiDataNotice ? ` ${f.aiDataNotice}` : ""}
      </Notice>

      {!current ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Create an evidence version first; the review reads that exact version.</p>
      ) : (
        <>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Reviewing evidence version {current.version}.</p>
          {error && <Notice tone="error" icon="error">{error}</Notice>}
          {!forCurrent && (
            <Button variant="primary" busy={running} disabled={!actor.signedIn} onClick={run}>
              <Icon name="play_arrow" className="!text-[18px]" /> Run review of version {current.version}
            </Button>
          )}
          {reviews.isLoading && <p className="font-body-sm text-body-sm text-on-surface-variant">Loading reviews…</p>}
          {forCurrent && <ReviewResult r={forCurrent} />}
          {forCurrent && forCurrent.mode === "DETERMINISTIC_ONLY" && f?.aiReview && (
            <Button variant="secondary" busy={running} onClick={run}>Run the review again</Button>
          )}
        </>
      )}

      {older.length > 0 && (
        <details className="font-body-sm text-body-sm">
          <summary className="cursor-pointer font-label-md text-label-md text-on-surface">Reviews of earlier versions ({older.length})</summary>
          <div className="mt-space-sm space-y-space-md">{older.map((r) => <ReviewResult key={r.id} r={r} />)}</div>
        </details>
      )}
    </Card>
  );
}
