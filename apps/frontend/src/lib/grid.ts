/** Typed client for the MINGA Grid endpoints, plus the formatters the dashboard uses. */
/**
 * The dashboard talks to this app's own route handlers, not to the Fastify backend. That keeps the
 * whole demo deployable as one Vercel project: the grid flow needs no database, no indexer and no
 * funded key, only the chain.
 */

export interface GridSignalResponse {
  signal: {
    source: string;
    observedAt: number;
    observedDate: string;
    spotUsdPerKwh: number;
    dayAverageUsdPerKwh: number;
    peakRatio: number;
    reservoirPct: number | null;
  };
  decision: { stress: "normal" | "elevated" | "critical"; dispatch: boolean; reason: string };
  thresholds: { criticalPeakRatio: number; elevatedPeakRatio: number; criticalReservoirPct: number };
}

export interface GridWindow {
  id: number;
  paid: boolean;
  amount: number;
  receipt: { evidenceHash: string; siteAmount: number; treasuryAmount: number; paidAt: number } | null;
}

export interface GridProgramResponse {
  connected: boolean;
  reason?: string;
  terms: {
    siteName: string;
    committedWh: number;
    tariffMicroUsdPerKwh: number;
    eventWindowLocal: string;
    baselineMethod: string;
    explorer: string;
    participants: { device: string; agent: string; sitePayee: string; treasury: string };
  };
  address?: string;
  explorerUrl?: string;
  funded?: boolean;
  siteBps?: number;
  treasuryBps?: number;
  totalBudget?: number;
  totalPaid?: number;
  escrowRemaining?: number;
  nextWindow?: number;
  windows?: GridWindow[];
}

export interface CurvePoint { t: number; wh: number }

export interface GridSiteResponse {
  siteName: string;
  siteId: string;
  device: string;
  window: { start: number; end: number };
  committedWh: number;
  baselineCurve: CurvePoint[];
  scenarios: Record<"delivered" | "shortfall", { label: string; curve: CurvePoint[] }>;
  earnings: { site: number; treasury: number } | null;
}

export interface AgentStep { step: string; detail: string; ok: boolean; data?: Record<string, unknown> }

/** Exactly what `release(approval, deviceSignature, agentSignature)` needs, as JSON-safe strings. */
export interface ReleaseArgs {
  agreement: string;
  approval: {
    milestoneId: string; termsHash: string; evidenceHash: string; amount: string;
    nonce: string; signedAt: string; validUntil: string; demoMode: boolean;
  };
  deviceSignature: string;
  agentSignature: string;
}

export interface SettleResponse {
  scenario: "delivered" | "shortfall";
  settled: boolean;
  reason: string;
  steps: AgentStep[];
  milestoneId: number;
  settlement: { baselineWh: number; actualWh: number; avoidedWh: number; committedWh: number } | null;
  evidenceHash: string | null;
  release: ReleaseArgs | null;
  error?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()) as T;
}

export const fetchSignal = () => getJson<GridSignalResponse>("/api/grid/signal");
export const fetchProgram = () => getJson<GridProgramResponse>("/api/grid/program");
export const fetchSite = () => getJson<GridSiteResponse>("/api/grid/site");

export async function runSettlement(scenario: "delivered" | "shortfall"): Promise<SettleResponse> {
  const res = await fetch("/api/grid/settle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  const json = (await res.json()) as SettleResponse;
  if (!res.ok && !json.steps) throw new Error(json.error ?? `settle responded ${res.status}`);
  return json;
}

/** Colombia has no daylight saving, so a fixed offset is exact. */
const COT_OFFSET_SECONDS = -5 * 3600;

export function cotTime(unixSeconds: number): string {
  const d = new Date((unixSeconds + COT_OFFSET_SECONDS) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export const kwh = (wh: number, digits = 1) => (wh / 1000).toFixed(digits);
export const usd = (v: number) => `$${v.toFixed(2)}`;
export const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
