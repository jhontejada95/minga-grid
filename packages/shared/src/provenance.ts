/**
 * Where a number on screen came from.
 *
 * Every figure the interface shows belongs to exactly one of these four kinds, and the interface
 * says which. This is not decoration: the project's credibility rests on nobody — including us —
 * having to guess whether a value was measured, agreed, read from the chain, or generated. A
 * reader should be able to tell at a glance, without asking.
 *
 * The wording lives here so the API and the UI cannot drift apart and describe the same number two
 * different ways.
 */
export type ProvenanceKind = "live" | "onchain" | "terms" | "simulated";

export interface Provenance {
  kind: ProvenanceKind;
  /** The badge, short enough to sit beside a number. */
  label: string;
  /** One sentence, for a tooltip or a legend. Written for a reader who knows nothing about us. */
  explanation: string;
  /** Which accent the badge uses, by role — the theme maps these to its own colours. */
  tone: "telemetry" | "verified" | "neutral" | "caution";
}

export const PROVENANCE: Record<ProvenanceKind, Provenance> = {
  live: {
    kind: "live",
    label: "LIVE · XM",
    explanation:
      "Fetched from XM, Colombia's system operator, when this page loaded. XM publishes a couple of days behind, so the date of the reading is shown beside it.",
    tone: "telemetry",
  },
  onchain: {
    kind: "onchain",
    label: "ON-CHAIN",
    explanation:
      "Read from the contract on HSK Chain. Nothing here is stored in this application — it is whatever the chain answers, and you can verify it on the explorer.",
    tone: "verified",
  },
  terms: {
    kind: "terms",
    label: "PROGRAMME TERMS",
    explanation:
      "Part of the agreement rather than a measurement: the committed reduction, the tariff, the event window and the split. They are fixed, committed in the contract's terms hash, and the contract rejects any settlement that departs from them.",
    tone: "neutral",
  },
  simulated: {
    kind: "simulated",
    label: "SIMULATED",
    explanation:
      "Generated, not measured. No physical meter is connected, and a baseline needs five days of history before it exists. The readings carry real signatures and are verified like real ones — only the consumption behind them is invented.",
    tone: "caution",
  },
};

/** The four, in the order a legend should list them: most trustworthy first. */
export const PROVENANCE_ORDER: ProvenanceKind[] = ["onchain", "live", "terms", "simulated"];
