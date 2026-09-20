/**
 * Live grid signal, from Colombia's own public data.
 *
 * Two sources, both open and without credentials:
 *
 *   XM (the system operator)   hourly spot price and useful reservoir volume
 *                              POST https://servapibi.xm.com.co/{hourly,daily}
 *   Superfinanciera via        the official representative exchange rate (TRM), so prices can be
 *   datos.gov.co               shown in USD without inventing a rate
 *
 * XM publishes with a lag of a couple of days, so "live" honestly means "the most recent day XM
 * has published". The returned `source` and `observedDate` say which day, and the UI prints them,
 * because a stale real number dressed up as a current one is worse than a labelled fixture.
 *
 * If either source is unreachable the caller gets `fallbackSignal()`, whose `source` says plainly
 * that it is a fixture. Nothing here ever pretends.
 */
import type { GridSignal } from "./settlement.js";

const XM_BASE = "https://servapibi.xm.com.co";
const TRM_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";

/** Hours of the evening event window, 1-indexed as XM numbers them (Hour19 covers 18:00-19:00). */
const WINDOW_HOURS = [19, 20, 21];
const LOOKBACK_DAYS = 8;
const TIMEOUT_MS = 15_000;

interface HourlyItem {
  Date: string;
  HourlyEntities: { Values: Record<string, string> }[];
}
interface DailyItem {
  Date: string;
  DailyEntities: { Value: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${XM_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTrm(): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TRM_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`TRM responded ${res.status}`);
    const rows = (await res.json()) as { valor: string }[];
    const value = Number(rows[0]?.valor);
    if (!Number.isFinite(value) || value <= 0) throw new Error("TRM payload had no usable rate");
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A clearly-labelled stand-in, used only when the public sources cannot be reached. The label is
 * deliberately blunt: a fixture that does not announce itself is worse than no data at all.
 */
export function fallbackSignal(): GridSignal {
  return {
    source: "FIXTURE — XM could not be reached, so this is a representative Colombian evening peak, not live data",
    observedAt: Math.floor(Date.now() / 1000),
    observedDate: iso(new Date()),
    spotPriceMicroUsdPerKwh: 313_000,
    dailyAverageMicroUsdPerKwh: 188_000,
    peakRatio: 1.66,
    reservoirPct: null,
  };
}

let cached: { at: number; signal: GridSignal } | null = null;
const CACHE_MS = 10 * 60 * 1000;

/**
 * The most recent published day, its evening-window price, that day's mean, and the reservoir
 * level — converted to USD with the official rate of the day.
 */
export async function fetchGridSignal(): Promise<GridSignal> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.signal;

  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);

  try {
    const [priceResponse, trm] = await Promise.all([
      postJson<{ Items: HourlyItem[] }>("/hourly", {
        MetricId: "PrecBolsNaci",
        StartDate: iso(start),
        EndDate: iso(end),
        Entity: "Sistema",
      }),
      fetchTrm(),
    ]);

    const items = (priceResponse.Items ?? []).filter((i) => i.HourlyEntities?.[0]?.Values);
    const latest = items[items.length - 1];
    if (!latest) throw new Error("XM returned no published days in the window");

    const values = latest.HourlyEntities[0]!.Values;
    const hourly: number[] = [];
    for (let h = 1; h <= 24; h++) {
      const raw = Number(values[`Hour${String(h).padStart(2, "0")}`]);
      if (Number.isFinite(raw)) hourly.push(raw);
    }
    if (hourly.length === 0) throw new Error("XM day had no hourly values");

    const windowPrices = WINDOW_HOURS.map((h) => Number(values[`Hour${String(h).padStart(2, "0")}`])).filter((v) =>
      Number.isFinite(v),
    );
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const dayAverageCop = mean(hourly);
    const windowCop = windowPrices.length ? mean(windowPrices) : dayAverageCop;
    const observedDate = latest.Date.slice(0, 10);

    // Reservoir level is a nice-to-have: a failure here must not cost us the price signal.
    let reservoirPct: number | null = null;
    try {
      const r = await postJson<{ Items: DailyItem[] }>("/daily", {
        MetricId: "PorcVoluUtilDiar",
        StartDate: iso(start),
        EndDate: iso(end),
        Entity: "Sistema",
      });
      const last = (r.Items ?? []).filter((i) => i.DailyEntities?.[0]?.Value).pop();
      const fraction = last ? Number(last.DailyEntities[0]!.Value) : NaN;
      if (Number.isFinite(fraction)) reservoirPct = fraction * 100;
    } catch {
      reservoirPct = null;
    }

    const toMicroUsd = (cop: number) => Math.round((cop / trm) * 1_000_000);
    const signal: GridSignal = {
      source: `XM (Colombian system operator), hourly spot price published for ${observedDate}; USD at the official TRM of ${trm.toFixed(2)} COP`,
      observedAt: Math.floor(Date.now() / 1000),
      observedDate,
      spotPriceMicroUsdPerKwh: toMicroUsd(windowCop),
      dailyAverageMicroUsdPerKwh: toMicroUsd(dayAverageCop),
      peakRatio: windowCop / dayAverageCop,
      reservoirPct,
    };
    cached = { at: Date.now(), signal };
    return signal;
  } catch {
    return fallbackSignal();
  }
}
