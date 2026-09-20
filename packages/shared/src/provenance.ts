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
export type ProvenanceKind = "live" | "onchain" | "terms" | "simulated" | "cited";

export interface Provenance {
  kind: ProvenanceKind;
  /** The badge, short enough to sit beside a number. */
  label: string;
  /** One sentence, for a tooltip or a legend. Written for a reader who knows nothing about us. */
  explanation: string;
  /** Which accent the badge uses, by role — the theme maps these to its own colours. */
  tone: "telemetry" | "verified" | "neutral" | "caution";
  /** Where a cited figure came from, so the reader can judge the source instead of trusting us. */
  source?: { name: string; url: string };
  /** Spanish variant for label and explanation */
  es?: {
    label: string;
    explanation: string;
  };
}

export const PROVENANCE: Record<ProvenanceKind, Provenance> = {
  live: {
    kind: "live",
    label: "LIVE · XM",
    explanation:
      "Fetched from XM, Colombia's system operator, when this page loaded. XM publishes a couple of days behind, so the date of the reading is shown beside it.",
    tone: "telemetry",
    es: {
      label: "EN VIVO · XM",
      explanation:
        "Obtenido de XM, el operador del sistema en Colombia, al cargar esta página. XM publica con un par de días de rezago, por lo que la fecha de la lectura se muestra al lado.",
    },
  },
  onchain: {
    kind: "onchain",
    label: "ON-CHAIN",
    explanation:
      "Read from the contract on HSK Chain. Nothing here is stored in this application — it is whatever the chain answers, and you can verify it on the explorer.",
    tone: "verified",
    es: {
      label: "EN CADENA",
      explanation:
        "Leído directamente del contrato en HSK Chain. Nada aquí se almacena en esta aplicación — es lo que la cadena responde, verificable en el explorador.",
    },
  },
  terms: {
    kind: "terms",
    label: "PROGRAMME TERMS",
    explanation:
      "Part of the agreement rather than a measurement: the committed reduction, the tariff, the event window and the split. They are fixed, committed in the contract's terms hash, and the contract rejects any settlement that departs from them.",
    tone: "neutral",
    es: {
      label: "TÉRMINOS DEL PROGRAMA",
      explanation:
        "Parte del acuerdo y no una medición: la reducción comprometida, la tarifa, la ventana de evento y la división. Son fijos, comprometidos en el termsHash, y el contrato rechaza cualquier liquidación que se aparte de ellos.",
    },
  },
  cited: {
    kind: "cited",
    label: "CITED",
    explanation:
      "Taken from published external research rather than measured here. The source is named and linked so you can judge it yourself.",
    tone: "neutral",
    source: {
      name: "Codibly — demand-response flexibility market",
      url: "https://codibly.com/blog/articles/how-demand-response-aggregators-make-money-business-models-for-the-8-44b-flexibility-market",
    },
    es: {
      label: "CITADO",
      explanation:
        "Tomado de investigaciones externas publicadas en lugar de medido aquí. La fuente se menciona y enlaza para que puedas juzgarla directamente.",
    },
  },
  simulated: {
    kind: "simulated",
    label: "SIMULATED",
    explanation:
      "Generated, not measured. No physical meter is connected, and a baseline needs five days of history before it exists. The readings carry real signatures and are verified like real ones — only the consumption behind them is invented.",
    tone: "caution",
    es: {
      label: "SIMULADO",
      explanation:
        "Generado, no medido. No hay un medidor físico conectado, y una línea base requiere cinco días de historial antes de existir. Las lecturas llevan firmas reales y se verifican como reales — solo el consumo detrás es inventado.",
    },
  },
};

export function getProvenance(kind: ProvenanceKind, lang: "en" | "es" = "en"): Provenance {
  const p = PROVENANCE[kind];
  if (lang === "es" && p.es) {
    return {
      ...p,
      label: p.es.label,
      explanation: p.es.explanation,
    };
  }
  return p;
}

/**
 * In the order a legend should list them: most directly verifiable first.
 *
 * `cited` exists because deleting a real, sourced figure is not more honest than showing it —
 * it just loses the argument. What is dishonest is an unsourced number. Name the source, link it,
 * and let the reader decide what it is worth.
 */
export const PROVENANCE_ORDER: ProvenanceKind[] = ["onchain", "live", "terms", "cited", "simulated"];
