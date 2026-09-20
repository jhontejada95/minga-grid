# Brief — an English / Spanish toggle

A button that switches the interface between English and Spanish, without breaking anything that
works. Roughly 1.5–2 hours. **It is the lowest priority item on the board**: the judges read
English, the submission is in English, and nothing about winning depends on this. Do it only when
the redesign is deployed, the repository is pushed and the Devfolio submission is in.

---

## Decisions already made — do not relitigate these

**English is the default**, for everyone, on every first visit. The submission requires English and
a judge arriving cold must land in it. Spanish is opt-in, remembered per browser.

**One page, no `/es` routes.** Duplicating routes doubles the surface for no benefit here.

**Client-side only.** This must not touch the API, the agent, the wallet, the contract or anything
on chain. If a change to any of those seems necessary, the approach is wrong — stop and rethink.

## What translates, and what does not

| Translates | Stays in English |
|---|---|
| Landing prose, headings, eyebrows, buttons | Numbers, dates, currency |
| Dashboard panel titles, tile labels, notes | Contract addresses and transaction hashes |
| Wallet button copy, error copy | The agent's step log (see below) |
| Provenance badge labels and explanations | Contract revert strings (`Amount mismatch`, …) |
| The footer legend | `release()`, `termsHash` and other identifiers |

**The agent's step log stays in English.** Those sentences are built server-side in
`packages/shared/src/settlement.ts` and contain interpolated figures. Translating them means
translating on the server and doubling that code path, for a panel that reads as machine output
anyway. Leave it, and put a small `agent output` label above the log so the mix is clearly
deliberate rather than an oversight.

## The one real technical trap

Next.js renders on the server, where `localStorage` does not exist. Reading the stored language
during render causes a hydration mismatch, and React will either warn loudly or paint the wrong
text.

**Do it this way:** the provider's initial state is `"en"`, always. A `useEffect` after mount reads
`localStorage` and switches if the visitor previously chose Spanish. That costs one frame of
English on a Spanish visitor's second visit, which is invisible and correct. Do not try to be
cleverer than this under time pressure.

Wrap every `localStorage` access in try/catch: it throws in some privacy modes.

## Shape

```
packages/shared/src/i18n.ts      the dictionary: one key, two strings
apps/frontend/src/lib/lang.tsx   LanguageProvider + useT() hook, localStorage-backed
apps/frontend/src/components/grid/LanguageToggle.tsx
```

The dictionary belongs in `@minga/shared` for the same reason `PROVENANCE` does: so the wording
cannot drift between places that show it. Keys read as what they are, not where they sit —
`hero.title`, not `landing.section1.h1`.

```ts
export const COPY = {
  "hero.title": {
    en: "Get paid for the electricity you don't use when the grid is about to fall.",
    es: "Te pagan por la electricidad que no consumes cuando la red está a punto de caer.",
  },
  // …
} as const;

export type CopyKey = keyof typeof COPY;
export type Lang = "en" | "es";
```

`useT()` returns `t(key)`. A missing key returns the English string and logs once in development —
never an empty space and never the raw key.

**Extend `PROVENANCE`** in `provenance.ts` with an `es` variant of `label` and `explanation`, rather
than inventing a second mechanism. `PROGRAMME TERMS` is not self-evident to a Spanish reader, so
the label translates too — suggested: `ON-CHAIN` → `EN CADENA`, `LIVE · XM` → `EN VIVO · XM`,
`PROGRAMME TERMS` → `TÉRMINOS DEL PROGRAMA`, `SIMULATED` → `SIMULADO`, `CITED` → `CITADO`.

## The toggle itself

Header, beside the wallet button on `/app` and beside "Open the app" on the landing. Two states,
`EN` and `ES`, in the design system's segmented-control style — mono, uppercase, the recessed track
from `design/DESIGN.md`. Not a flag: flags mean countries, not languages, and Spanish is not
Colombia's alone.

`aria-label` on the control, `lang` on `<html>` updated to match so screen readers and browser
translation behave.

## Translation quality

The Spanish is for a Colombian reader, written the way the pitch is spoken — not a literal
translation of the English. Where the English says "Get paid for the electricity you don't use",
the Spanish should sound like something Jhon would say out loud, because he will be saying it out
loud.

Keep the technical register: *demand response* has no good Spanish equivalent in use, so leave it
and explain it once. *Offtaker* likewise. Do not invent vocabulary that no one in the sector uses.

## Verification before calling it done

1. `npx tsc --noEmit -p apps/frontend/tsconfig.json` and `npx next build` clean.
2. **Open a browser.** Toggle both ways on both pages. No layout breaks — Spanish runs roughly 20%
   longer than English and will expose any container that was sized to its content.
3. Check 390px in Spanish specifically. That is where the overflow will appear if anywhere.
4. Reload after switching: the choice must survive.
5. No hydration warnings in the console. If there are any, the provider is reading storage too early.
6. **Run the settlement in Spanish** and confirm the numbers, addresses and the transaction link are
   untouched.

Then `npx vercel --prod`, and say what you did not verify.
