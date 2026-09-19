import { EXPLORER_URL, TOKEN_DECIMALS } from "./config";

/** Formats integer base units without floating point: `50000000` -> `50.00`, `33333333` -> `33.333333`. */
export function formatAmount(base: string | bigint, decimals = TOKEN_DECIMALS, minFraction = 2): string {
  const value = typeof base === "bigint" ? base : BigInt(base);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;
  let frac = (abs % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  frac = frac.padEnd(Math.min(minFraction, decimals), "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}

export const formatToken = (base: string | bigint, symbol = "mUSD") => `${formatAmount(base)} ${symbol}`;

/** Parses a user-entered decimal (`"50"`, `"12.5"`) into base units. Returns null when invalid or too precise. */
export function parseAmount(input: string, decimals = TOKEN_DECIMALS): bigint | null {
  const m = /^(\d{1,15})(?:\.(\d{1,18}))?$/.exec(input.trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  return BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export const shortAddress = (a: string | undefined | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h: string | undefined | null, n = 8) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "—");

export const explorerAddress = (a: string) => `${EXPLORER_URL}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER_URL}/tx/${h}`;

/** UTC timestamp like `2026-09-19 14:22 UTC`. */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Relative time to a deadline: `in 3 h 12 min`, `2 d ago`. */
export function relativeTime(iso: string, nowMs = Date.now()): string {
  const diff = new Date(iso).getTime() - nowMs;
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60_000);
  let text: string;
  if (min < 1) text = "moments";
  else if (min < 60) text = `${min} min`;
  else if (min < 60 * 48) text = `${Math.floor(min / 60)} h ${min % 60} min`;
  else text = `${Math.floor(min / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** Percentage of `part` in `total` (both integers as strings) with one decimal, without floats for the division of big numbers. */
export function percent(part: string | bigint, total: string | bigint): number {
  const t = BigInt(total);
  if (t === 0n) return 0;
  return Number((BigInt(part) * 1000n) / t) / 10;
}
