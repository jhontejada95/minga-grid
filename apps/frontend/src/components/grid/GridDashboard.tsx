"use client";

/**
 * The MINGA Grid demo, on one page.
 *
 * Three panels, no navigation: a three-minute demo cannot afford clicks. Grid status explains
 * why an event exists, the site panel shows what was measured, and the settlement panel shows
 * the agent deciding and the chain paying.
 *
 * Dark surface on purpose: this is a control room, and the chart reads better on it. Colours
 * come from the validated categorical palette (slot 1 blue, slot 3 aqua) and the fixed status
 * palette; every status carries an icon and a word, never colour alone.
 */
import { useCallback, useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { conservationAgreementAbi } from "@minga/shared";
import type { Address, Hex } from "viem";
import { CHAIN_ID, EXPLORER_URL } from "@/lib/config";
import { EventChart } from "./EventChart";
import { WalletButton } from "./WalletButton";
import {
  fetchProgram, fetchSignal, fetchSite, kwh, runSettlement, short, usd,
  type AgentStep, type GridProgramResponse, type GridSignalResponse, type GridSiteResponse, type SettleResponse,
} from "@/lib/grid";

const SURFACE = "#1a1a19";
const PLANE = "#0d0d0d";
const INK = "#ffffff";
const INK_2 = "#c3c2b7";
const MUTED = "#898781";
const HAIRLINE = "#2c2c2a";
const BLUE = "#3987e5";
const AQUA = "#199e70";
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;

type Scenario = "delivered" | "shortfall";

/** What the agent is about to do, shown greyed out before the first run. */
const PIPELINE: [string, string][] = [
  ["sense", "read the grid signal and decide whether an event is warranted"],
  ["verify", "recover the signer of every meter reading in the window"],
  ["baseline", "rebuild the counterfactual from five ordinary evenings"],
  ["measure", "baseline minus measured equals avoided energy"],
  ["decide", "compare against the reduction the site committed to"],
  ["sign", "produce one of the two signatures release() requires"],
];

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-5" style={{ background: SURFACE, borderColor: HAIRLINE }}>
      <h2 className="text-[15px] font-semibold" style={{ color: INK }}>{title}</h2>
      {subtitle && <p className="mb-4 mt-1 text-[12px]" style={{ color: MUTED }}>{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Stat({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: string }) {
  return (
    <div className="rounded-md border px-3 py-2.5" style={{ borderColor: HAIRLINE }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{label}</div>
      <div className="mt-1 whitespace-nowrap text-[22px] font-semibold tabular-nums" style={{ color: accent ?? INK }}>{value}</div>
      {note && <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>{note}</div>}
    </div>
  );
}

export function GridDashboard() {
  const [signal, setSignal] = useState<GridSignalResponse | null>(null);
  const [program, setProgram] = useState<GridProgramResponse | null>(null);
  const [site, setSite] = useState<GridSiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<Scenario>("delivered");
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<SettleResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([fetchSignal(), fetchProgram(), fetchSite()]);
      setSignal(a); setProgram(b); setSite(c); setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { isConnected, chainId } = useAccount();
  const { writeContractAsync, isPending: sending } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  useEffect(() => { if (confirmed) void load(); }, [confirmed, load]);

  /** Reveal the agent's steps one at a time: the sequence is the story, and it is over too fast to read at once. */
  async function run() {
    setRunning(true); setShown([]); setResult(null); setTxHash(null);
    try {
      const res = await runSettlement(scenario);
      for (const step of res.steps) {
        setShown((prev) => [...prev, step]);
        await new Promise((r) => setTimeout(r, 420));
      }
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  /**
   * Broadcast the settlement from the visitor's own wallet.
   *
   * The wallet pays gas and nothing else: the two signatures inside the call belong to the meter
   * and to the agent, and the contract checks those. Whoever sends this transaction is a relayer,
   * not an authoriser — their signature is nowhere in it.
   */
  async function relay() {
    if (!result?.release) return;
    const r = result.release;
    try {
      const hash = await writeContractAsync({
        address: r.agreement as Address,
        abi: conservationAgreementAbi,
        functionName: "release",
        args: [
          {
            milestoneId: BigInt(r.approval.milestoneId),
            termsHash: r.approval.termsHash as Hex,
            evidenceHash: r.approval.evidenceHash as Hex,
            amount: BigInt(r.approval.amount),
            nonce: BigInt(r.approval.nonce),
            signedAt: BigInt(r.approval.signedAt),
            validUntil: BigInt(r.approval.validUntil),
            demoMode: r.approval.demoMode,
          },
          r.deviceSignature as Hex,
          r.agentSignature as Hex,
        ],
      });
      setTxHash(hash);
    } catch (e) {
      setError((e as Error).message.split("\n")[0] ?? "the wallet rejected the transaction");
    }
  }

  const stress = signal?.decision.stress ?? "normal";
  const stressColor = stress === "critical" ? STATUS.critical : stress === "elevated" ? STATUS.warning : STATUS.good;
  const stressIcon = stress === "critical" ? "bolt" : stress === "elevated" ? "warning" : "check_circle";
  const curve = site?.scenarios[scenario];

  return (
    <div className="min-h-screen px-5 py-8 md:px-10" style={{ background: PLANE, color: INK }}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">

        <header>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[26px] font-bold tracking-tight">MINGA Grid</h1>
            <p className="text-[14px]" style={{ color: INK_2 }}>
              Get paid for the electricity you don’t use when the grid is about to fall.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px]" style={{ color: MUTED }}>
              HSK testnet · no monetary value · live grid price from XM · meter readings are synthetic and signed by a device key
            </p>
            <WalletButton />
          </div>
        </header>

        {error && (
          <div className="rounded-md border px-4 py-3 text-[13px]" style={{ borderColor: STATUS.critical, color: INK_2 }}>
            <strong style={{ color: STATUS.critical }}>Backend unreachable.</strong> {error} — start it with{" "}
            <code>npm run backend:dev</code>.
          </div>
        )}

        {/* 1 — Grid status */}
        <Panel
          title="Grid status"
          subtitle={signal ? `${signal.signal.source}${signal.signal.reservoirPct !== null ? ` · reservoirs at ${signal.signal.reservoirPct.toFixed(1)}%` : ""}` : undefined}
        >
          <div className="grid gap-4 md:grid-cols-[auto,1fr]">
            <div className="flex items-center gap-3 rounded-md border px-4 py-3" style={{ borderColor: stressColor }}>
              <span className="material-symbols-outlined" style={{ color: stressColor, fontSize: 28 }} aria-hidden="true">
                {stressIcon}
              </span>
              <div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>Stress</div>
                <div className="text-[20px] font-semibold uppercase" style={{ color: stressColor }}>{stress}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Window price" value={signal ? `$${signal.signal.spotUsdPerKwh.toFixed(3)}` : "—"} note="per kWh, 18–21h" />
              <Stat label="Day average" value={signal ? `$${signal.signal.dayAverageUsdPerKwh.toFixed(3)}` : "—"} note="per kWh, 24h mean" />
              <Stat
                label="Peak ratio"
                value={signal ? `${signal.signal.peakRatio.toFixed(2)}×` : "—"}
                note={`dispatch at ${signal?.thresholds.elevatedPeakRatio ?? 1.4}×`}
                accent={BLUE}
              />
              <Stat label="Programme pays" value="$0.15" note="per avoided kWh" accent={AQUA} />
            </div>
          </div>
          {signal && (
            <p className="mt-4 text-[13px]" style={{ color: INK_2 }}>
              <span style={{ color: MUTED }}>Agent verdict: </span>{signal.decision.reason}
            </p>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-[1.15fr,1fr]">

          {/* 2 — The site */}
          <Panel
            title="The site"
            subtitle={site ? `${site.siteName} · meter ${short(site.device)} · event window ${program?.terms.eventWindowLocal ?? ""}` : undefined}
          >
            {site && curve ? (
              <>
                <EventChart baseline={site.baselineCurve} actual={curve.curve} actualLabel={`Measured — ${curve.label.toLowerCase()}`} />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Committed" value={kwh(site.committedWh)} note="kWh agreed reduction" />
                  <Stat
                    label="Avoided"
                    value={result?.settlement ? kwh(result.settlement.avoidedWh) : "—"}
                    note={result?.settlement ? "kWh verified by the agent" : "run the agent to verify"}
                    accent={AQUA}
                  />
                  <Stat label="Site earned" value={site.earnings ? usd(site.earnings.site) : "—"} note="90% share, all programmes" />
                  <Stat label="Treasury" value={site.earnings ? usd(site.earnings.treasury) : "—"} note="10% fee, all programmes" accent={BLUE} />
                </div>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: MUTED }}>Loading meter data…</p>
            )}
          </Panel>

          {/* 3 — Live settlement */}
          <Panel title="Live settlement" subtitle="The agent senses, verifies, decides and signs. No human signature is involved.">
            <div className="flex flex-wrap items-center gap-2">
              {(["delivered", "shortfall"] as Scenario[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setScenario(s); setShown([]); setResult(null); }}
                  className="rounded-md border px-3 py-1.5 text-[12px]"
                  style={{
                    borderColor: scenario === s ? BLUE : HAIRLINE,
                    color: scenario === s ? INK : INK_2,
                    background: scenario === s ? "#12233a" : "transparent",
                  }}
                >
                  {s === "delivered" ? "Site shed load" : "Site missed its commitment"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              className="mt-3 w-full rounded-md px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
              style={{ background: BLUE, color: "#04121f" }}
            >
              {running ? "Agent running…" : "Run the settlement agent"}
            </button>

            {shown.length === 0 && !running && (
              <ol className="mt-4 flex flex-col gap-2 text-[13px]">
                {PIPELINE.map(([name, what]) => (
                  <li key={name} className="flex gap-2.5">
                    <span className="material-symbols-outlined" style={{ color: HAIRLINE, fontSize: 18, lineHeight: "20px" }} aria-hidden="true">
                      radio_button_unchecked
                    </span>
                    <span>
                      <span className="font-medium capitalize" style={{ color: INK_2 }}>{name}</span>
                      <span style={{ color: MUTED }}> — {what}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <ol className="mt-4 flex flex-col gap-2">
              {shown.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13px]">
                  <span
                    className="material-symbols-outlined"
                    style={{ color: s.ok ? AQUA : STATUS.critical, fontSize: 18, lineHeight: "20px" }}
                    aria-hidden="true"
                  >
                    {s.ok ? "check_circle" : "cancel"}
                  </span>
                  <span>
                    <span className="font-medium capitalize" style={{ color: INK }}>{s.step}</span>
                    <span style={{ color: MUTED }}> — {s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>

            {result && !running && (
              <div
                className="mt-4 rounded-md border p-3.5 text-[13px]"
                style={{ borderColor: result.settled ? AQUA : STATUS.critical }}
              >
                <div className="font-semibold" style={{ color: result.settled ? AQUA : STATUS.critical }}>
                  {result.settled ? "Settled" : "Refused to settle"}
                </div>
                <p className="mt-1" style={{ color: INK_2 }}>{result.reason}</p>

                {result.settled && !txHash && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: HAIRLINE }}>
                    <p className="text-[12px]" style={{ color: MUTED }}>
                      Both machine signatures are ready. Someone has to pay the gas to put them on chain — that is all a
                      relayer does. Your signature is not in this transaction.
                    </p>
                    {!isConnected ? (
                      <div className="mt-2.5"><WalletButton /></div>
                    ) : chainId !== CHAIN_ID ? (
                      <div className="mt-2.5"><WalletButton /></div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void relay()}
                        disabled={sending}
                        className="mt-2.5 w-full rounded-md px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
                        style={{ background: AQUA, color: "#03130d" }}
                      >
                        {sending ? "Confirm in your wallet…" : "Relay the settlement to HSK"}
                      </button>
                    )}
                  </div>
                )}

                {txHash && (
                  <div className="mt-3 flex flex-col gap-1 border-t pt-3" style={{ borderColor: HAIRLINE, color: INK_2 }}>
                    <span style={{ color: confirmed ? AQUA : STATUS.warning }}>
                      {confirming ? "Waiting for the block…" : confirmed ? "Confirmed on HSK" : "Sent"}
                    </span>
                    {confirmed && (
                      <span>
                        Paid on chain: <strong>{usd((program?.windows?.[0]?.amount ?? 25) * 0.9)}</strong> to the site,{" "}
                        <strong style={{ color: BLUE }}>{usd((program?.windows?.[0]?.amount ?? 25) * 0.1)}</strong> to the protocol treasury.
                      </span>
                    )}
                    <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: BLUE }}>
                      View the transaction on Blockscout
                    </a>
                  </div>
                )}
                {result.evidenceHash && (
                  <p className="mt-2 break-all text-[11px]" style={{ color: MUTED }}>
                    Evidence hash committed on chain: {result.evidenceHash}
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* Programme strip */}
        <Panel title="The programme on HSK" subtitle={program?.connected ? undefined : program?.reason}>
          {program?.connected ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Budget" value={usd(program.totalBudget ?? 0)} note="funded by the offtaker" />
                <Stat label="Paid out" value={usd(program.totalPaid ?? 0)} note={`${program.windows?.filter((w) => w.paid).length ?? 0} of 2 windows`} />
                <Stat label="In escrow" value={usd(program.escrowRemaining ?? 0)} note="locked in the contract" />
                <Stat label="Split" value={`${(program.siteBps ?? 0) / 100}/${(program.treasuryBps ?? 0) / 100}`} note="site / protocol, enforced on chain" accent={AQUA} />
              </div>
              <dl className="mt-4 grid gap-x-8 gap-y-1.5 text-[12px] sm:grid-cols-2" style={{ color: MUTED }}>
                {[
                  ["Contract", program.address ?? ""],
                  ["Meter key (signer 1)", program.terms.participants.device],
                  ["Agent key (signer 2)", program.terms.participants.agent],
                  ["Treasury", program.terms.participants.treasury],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b py-1" style={{ borderColor: HAIRLINE }}>
                    <dt>{label}</dt>
                    <dd className="font-mono" style={{ color: INK_2 }}>{short(value)}</dd>
                  </div>
                ))}
              </dl>
              {program.explorerUrl && (
                <a href={program.explorerUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] underline underline-offset-2" style={{ color: BLUE }}>
                  Open the programme on Blockscout
                </a>
              )}
            </>
          ) : (
            <p className="text-[13px]" style={{ color: MUTED }}>
              No programme on chain yet. Run <code>node apps/backend/scripts/grid-hsk.mjs</code> from the repository root.
            </p>
          )}
        </Panel>

        <footer className="pb-6 text-[11px]" style={{ color: MUTED }}>
          A <em>minga</em> is when a whole community drops what it is doing and works together for one common goal.
          Baseline method: {program?.terms.baselineMethod ?? "—"}. The agent produces one of the two signatures the
          contract requires and cannot change the amount.
        </footer>
      </div>
    </div>
  );
}
