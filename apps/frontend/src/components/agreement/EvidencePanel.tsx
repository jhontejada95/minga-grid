"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/config";
import { translateError } from "@/lib/errors";
import { formatUtc, shortHash } from "@/lib/format";
import { api } from "@/data/api";
import { useApiConfig, useEvidence } from "@/data/queries";
import type { AgreementDetail, EvidenceFile, EvidenceOverview, Manifest } from "@/data/types";
import { Button, Card, Chip, Icon, Mono, Notice, Skeleton } from "@/components/ui";
import type { Actor } from "./shared";

const ACCEPT = ".json,.txt,.md,.csv";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The API returns hashes with a 0x prefix; the browser digest has none. Compare and show them in one form. */
const with0x = (h: string) => (h.startsWith("0x") ? h : `0x${h}`);
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function FileLink({ f }: { f: EvidenceFile }) {
  return (
    <a href={`${API_BASE}/api/v1/evidence/files/${f.id}`} className="inline-flex items-center gap-1 font-body-sm text-body-sm text-secondary hover:underline" download={f.fileName}>
      <Icon name="description" className="!text-[16px]" /> {f.fileName}
    </a>
  );
}

function ManifestCard({ m }: { m: Manifest }) {
  return (
    <div className={`rounded-lg border p-space-md ${m.current ? "border-primary-container bg-[#f0fdf4]" : "border-[#e2e8f0] bg-surface-container-lowest"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
          Evidence version {m.version}
          {m.current && <Chip tone="verified" icon="check_circle">Current</Chip>}
        </div>
        <div className="font-code-xs text-code-xs text-on-surface-variant">{formatUtc(m.createdAt)}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-code-xs text-code-xs text-on-surface-variant">Evidence hash <Mono value={m.evidenceHash} /></div>
      <ul className="mt-space-sm space-y-1">
        {m.files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <FileLink f={f} />
            <span className="font-code-xs text-code-xs text-on-surface-variant" title={f.sha256}>SHA-256 {shortHash(with0x(f.sha256), 6)}</span>
          </li>
        ))}
      </ul>
      {m.requirementKeys.length > 0 && (
        <p className="mt-space-sm font-code-xs text-code-xs text-on-surface-variant">Covers: {m.requirementKeys.join(", ")}</p>
      )}
    </div>
  );
}

export function EvidencePanel({ a, milestoneId, actor, canEdit }: { a: AgreementDetail; milestoneId: 0 | 1; actor: Actor; canEdit: boolean }) {
  const qc = useQueryClient();
  const config = useApiConfig();
  const evidence = useEvidence(a.address, milestoneId, true);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({}); // fileId -> requirement key ("" = none)
  const [description, setDescription] = useState("");

  const isCommunity = actor.role === "COMMUNITY";
  const requirements = a.milestones[milestoneId].requiredEvidence;
  const data: EvidenceOverview | undefined = evidence.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["evidence"] });
  const maxBytes = config.data?.limits.evidenceMaxBytes;

  async function upload(file: File) {
    setError(null);
    setOk(null);
    if (maxBytes && file.size > maxBytes) return setError(`This file is larger than the ${kb(maxBytes)} limit.`);
    setUploading(true);
    try {
      const localHash = await sha256Hex(file);
      const form = new FormData();
      form.append("file", file);
      const saved = await api<EvidenceFile>(`/api/v1/agreements/${a.address}/evidence/files`, { form });
      if (with0x(saved.sha256).toLowerCase() !== with0x(localHash)) throw new Error("The stored file does not match the file you selected. Upload it again.");
      setOk(`${saved.fileName} uploaded. Its SHA-256 matches the file on your device.`);
      setPicked((p) => ({ ...p, [saved.id]: "" }));
      await refresh();
    } catch (e) {
      setError(translateError(e).message === "Something went wrong. Nothing was changed." && e instanceof Error ? e.message : translateError(e).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function createVersion() {
    const chosen = Object.keys(picked);
    if (chosen.length === 0) return setError("Select at least one file for this evidence version.");
    setError(null);
    setOk(null);
    setCreating(true);
    try {
      const res = await api<{ manifest: Manifest; created: boolean }>(`/api/v1/agreements/${a.address}/milestones/${milestoneId}/manifests`, {
        json: {
          files: chosen.map((fileId) => ({ fileId, ...(picked[fileId] ? { requirementKey: picked[fileId] } : {}) })),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      setOk(res.created ? `Evidence version ${res.manifest.version} created.` : `This exact set of files already exists as version ${res.manifest.version}.`);
      setPicked({});
      setDescription("");
      await refresh();
    } catch (e) {
      setError(translateError(e).message);
    } finally {
      setCreating(false);
    }
  }

  const current = data?.manifests.find((m) => m.current);
  const satisfiedKeys = new Set(data?.checklist.filter((c) => c.satisfied).map((c) => c.key));

  return (
    <Card className="space-y-space-md">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-headline-sm text-headline-sm text-primary"><Icon name="folder_open" /> Evidence</h3>
        {current && <span className="font-code-xs text-code-xs text-on-surface-variant">Current: version {current.version}</span>}
      </div>

      <div>
        <div className="font-label-md text-label-md text-on-surface">Required for this milestone</div>
        <ul className="mt-1 space-y-1">
          {requirements.map((r) => {
            const done = satisfiedKeys.has(r.key);
            return (
              <li key={r.key} className="flex items-start gap-2 font-body-sm text-body-sm">
                <Icon name={done ? "check_circle" : "radio_button_unchecked"} className={`!text-[18px] ${done ? "text-[#166534]" : "text-outline"}`} />
                <span><span className="font-code-sm text-code-sm">{r.key}</span> — {r.description}{done ? "" : " (not provided in the current version)"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {evidence.isLoading && <Skeleton className="h-20 w-full" />}
      {evidence.isError && <Notice tone="error" icon="error">The evidence could not be loaded. {translateError(evidence.error).message}</Notice>}

      {isCommunity && canEdit && (
        <div className="space-y-space-sm rounded-lg bg-surface-container-low p-space-md">
          <div className="font-label-md text-label-md text-on-surface">Add a file</div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Text, JSON, Markdown or CSV files only{maxBytes ? `, up to ${kb(maxBytes)} each` : ""}. Files are private to the three participants. Their SHA-256 is computed on your device and compared with the stored copy.</p>
          <input ref={input} id={`upload-${milestoneId}`} type="file" accept={ACCEPT} disabled={uploading} aria-label="Evidence file" className="block w-full font-body-sm text-body-sm file:mr-3 file:rounded file:border-0 file:bg-primary-container file:px-3 file:py-2 file:font-label-md file:text-on-primary"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          {uploading && <p className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant"><Icon name="progress_activity" className="animate-spin !text-[18px]" /> Uploading…</p>}
        </div>
      )}
      {isCommunity && !canEdit && <Notice tone="info" icon="info">Evidence can no longer be changed for this milestone.</Notice>}
      {!isCommunity && <Notice tone="info" icon="info">Only the community representative adds evidence. You can read it, run a review and sign.</Notice>}

      {error && <Notice tone="error" icon="error">{error}</Notice>}
      {ok && <Notice tone="ok" icon="check_circle">{ok}</Notice>}

      {data && data.files.length > 0 && (
        <div className="space-y-space-sm">
          <div className="font-label-md text-label-md text-on-surface">Files of this agreement</div>
          <ul className="divide-y divide-[#e2e8f0] rounded-lg border border-[#e2e8f0]">
            {data.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-space-sm px-space-md py-space-sm">
                {isCommunity && canEdit && (
                  <input
                    type="checkbox" id={`pick-${milestoneId}-${f.id}`} aria-label={`Include ${f.fileName}`} className="h-4 w-4"
                    checked={f.id in picked}
                    onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[f.id] = ""; else delete n[f.id]; return n; })}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <FileLink f={f} />
                  <div className="font-code-xs text-code-xs text-on-surface-variant">{kb(f.size)} · {formatUtc(f.uploadedAt)} · SHA-256 {shortHash(with0x(f.sha256), 6)}</div>
                </div>
                {isCommunity && canEdit && f.id in picked && (
                  <select
                    id={`req-${milestoneId}-${f.id}`} aria-label={`Requirement covered by ${f.fileName}`}
                    className="rounded border border-[#cbd5e1] bg-surface-container-lowest px-2 py-1 font-code-sm text-code-sm"
                    value={picked[f.id]} onChange={(e) => setPicked((p) => ({ ...p, [f.id]: e.target.value }))}
                  >
                    <option value="">No requirement</option>
                    {requirements.map((r) => <option key={r.key} value={r.key}>{r.key}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          {isCommunity && canEdit && (
            <div className="space-y-space-sm">
              <label className="block">
                <span className="font-label-md text-label-md text-on-surface">Note for this version (optional, public inside the evidence hash)</span>
                <input id={`desc-${milestoneId}`} className="mt-1 w-full rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 py-2 font-body-md text-body-md" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <Button variant="primary" busy={creating} disabled={Object.keys(picked).length === 0} onClick={createVersion}>
                <Icon name="inventory_2" className="!text-[18px]" /> Create evidence version from {Object.keys(picked).length} selected {Object.keys(picked).length === 1 ? "file" : "files"}
              </Button>
              <p className="font-code-xs text-code-xs text-on-surface-variant">A version freezes the list of files and their hashes. Reviews and signatures refer to that exact version; adding files later creates a new version.</p>
            </div>
          )}
        </div>
      )}

      {data && data.manifests.length > 0 && (
        <div className="space-y-space-sm">
          <div className="font-label-md text-label-md text-on-surface">Evidence versions</div>
          {data.manifests.map((m) => <ManifestCard key={m.id} m={m} />)}
        </div>
      )}
      {data && data.manifests.length === 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">No evidence version yet. Upload files and create the first version to continue.</p>}
    </Card>
  );
}
