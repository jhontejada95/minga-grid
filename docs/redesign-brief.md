# Redesign brief — apply the "Decentralized Energy Infrastructure" visual system

The reference design lives in `design/`: `DESIGN.md` (tokens and component rules), `reference.html`
(a full static landing page built from it) and `reference.png` (a screenshot). It was produced from
this project's own copy, so the words are already correct — the work is visual, plus one audit.

**Do not treat `reference.html` as code to copy in.** It is a static mock. Take the visual system
from it; keep our component structure, our data wiring and our honesty.

---

## 0. Before you start

- **Confirm nobody else is editing `apps/frontend/`.** This brief was written by a parallel session
  that has stopped touching those files.
- `design/` is reference material and is git-ignored. Do not ship it.
- Run the app first and look at it (`npm run dev --workspace=@minga/frontend`). Know what you are
  changing before you change it.

## 1. THE AUDIT — do this first, it is not optional

The reference design **invented telemetry that does not exist**. This project's entire credibility
rests on not doing that. Every number on screen must come from a real source or be removed. There
is no third option, and "it looks better with it" is not an argument.

Remove or replace each of these:

| In the reference | Reality | What to do |
|---|---|---|
| `GRID FREQ: 59.982 Hz NORMAL (±0.02)` | we never read grid frequency | **remove** |
| `SYSTEM RESERVE: 47.8% (EL NIÑO DRY RUN)` | we read useful reservoir volume, ~78% | replace with the real value from `/api/grid/signal` (`reservoirPct`) |
| `Hydro reserve < 48%` | contradicts the real reading | **remove** |
| `HSK L2 Block #9,481,202` | invented; real blocks are ~33.3M | **remove**, or read a real block number |
| `ECDSA telemetry signed directly at meter edge` | **false** — no meter exists | rewrite: "every reading carries the device key's signature" |
| `Auth: ECDSA Hardware Key` (step 2) | false, it is a software development key | rewrite: "EIP-712, device key" |
| `Prohibitive $40+ overhead per end-meter` | no source | **remove** |
| `60-90 day reconciliation billing cycles` | no source | **remove** |
| `HSK atomic release on stablecoin rails (< 2 min)` | never measured | replace with "one transaction", which is true |
| `Input: XM Spot RSS / REST` | it is a REST POST API | "XM REST API" |
| `0% Retail Access` | invented statistic | **remove** |
| `LIVE TELEMETRY` in the ticker | XM publishes 2–3 days late | "XM · published <date>", using `observedDate` |

Figures that **are** real and must stay accurate: `1.5–1.8×` peak ratio, `$0.31` evening window,
`$0.19` day average, `$8.4B` market size, `10% / 90% / $0.15`, the contract address, the settled
transaction. If a section wants a number nobody measured, cut the section.

The landing's honesty section (`WHAT THIS IS NOT` / "The honest part") **must survive the redesign**
and stay easy to find. Style it; do not shrink it, bury it or soften it.

## 2. The visual system

Take from `design/DESIGN.md`:

- **Surfaces.** Void base `#090D14`, cards `#0F172A` at ~80% with `backdrop-filter: blur(16px)`,
  overlays `#1E293B`. Borders `#1E293B`, `#334155` when active.
- **Text.** Primary `#F8FAFC`, secondary `#94A3B8`, muted `#64748B`.
- **Accents.** Emerald `#10B981` for settled and verified states. Cyan `#06B6D4` for telemetry
  chrome. Protocol blue `#3B82F6` for actions, contracts and transaction hashes.
- **Type.** Plus Jakarta Sans for headlines, Inter for body, JetBrains Mono for every metric,
  address and hash. Eyebrows in uppercase mono with wide tracking. Add Plus Jakarta Sans to the
  Google Fonts link in `src/app/layout.tsx`; the other two are already loaded.
- **Shape.** 4–6px on controls, 8px on cards, 12px on overlays. Pills only for status.
- **Depth.** Glass card surfaces, 1px borders, and a restrained outer glow on live or settled
  states: `box-shadow: 0 0 20px -4px rgba(16,185,129,0.25)`.

### One hard constraint on the chart

**Do not use emerald and cyan as the two series in `EventChart`.** Validated: normal-vision
ΔE 12.5, which fails — people with ordinary colour vision cannot separate them reliably.

Use **emerald `#10B981` and protocol blue `#3B82F6`** (normal ΔE 26.5, worst CVD ΔE 25.2 — passes).
Keep the baseline as a dashed neutral line; it is a reference, not a rival series. Keep the "show
the readings as a table" toggle. Re-run the validator if you change any series colour:

```
node <dataviz skill>/scripts/validate_palette.js "#10B981,#3B82F6" --mode dark
```

## 3. Scope, in this order

**Stage 1 — the landing (`src/app/page.tsx`).** Static, self-contained, zero risk to the chain or
the wallet. Highest visual payoff. Do this first and make it good.

**Stage 2 — the app (`src/components/grid/GridDashboard.tsx`, `EventChart.tsx`, `WalletButton.tsx`).**
Apply the same tokens. **Change presentation only.** Do not touch:

- `src/lib/grid.ts`, `src/lib/grid-server.ts`, `src/app/api/grid/**` — the data layer and the agent
- the relay flow, the wagmi config, or anything that builds `release()` arguments
- any number that comes from the API; render what it returns

Stage 2 is cuttable. A beautiful landing plus today's working app beats a half-restyled app.

## 4. Verification before you call it done

1. `npx tsc --noEmit -p apps/frontend/tsconfig.json` clean.
2. `npx next build` clean.
3. **Open it in a browser and look at it** at 1280px and at 390px. Layout, overflow, label
   collisions. The validator checks colour, not geometry.
4. Run both settlement scenarios end to end. The refusal path must still be obvious and red.
5. Re-read the page for numbers. **If a figure on screen has no source, delete it.**
6. Report what you did NOT verify. Do not say something works if you did not run it.

## 5. Deploying

The app is live at https://minga-grid.vercel.app and deploys from local files, not from git:

```
npx vercel --prod
```

Do not connect the Vercel project to a git repository.

---

# Addendum — label where every number came from

Added after the brief was first written. **Do this as part of the redesign, not afterwards.** It is
the difference between a demo that looks confident and one that can be trusted, and it is also what
stops anyone — including the person presenting — from having to guess what is real.

## The rule

Every figure the interface shows belongs to exactly one of four kinds, and the interface says which.

The vocabulary is already in code: `PROVENANCE` and `PROVENANCE_ORDER` in
`packages/shared/src/provenance.ts`. **Import it; do not retype the strings.** It exists so the API
and the UI cannot drift apart and describe the same number two different ways.

| Kind | Badge | Applies to | Tone |
|---|---|---|---|
| `onchain` | `ON-CHAIN` | budget, paid out, escrow, the split, each window's receipt, the site's and treasury's balances | verified → emerald |
| `live` | `LIVE · XM` | window price, day average, peak ratio, reservoir level, the exchange rate | telemetry → cyan |
| `terms` | `PROGRAMME TERMS` | committed 500 kWh, the USD 0.15 tariff, the 18:00–21:00 window, the 90/10 split, the baseline method | neutral → muted |
| `simulated` | `SIMULATED` | the meter readings, the consumption chart, avoided kWh | caution → amber |

## Where the badges go

- **Grid status panel** → one `LIVE · XM` badge in the panel header, with the reading's date next to
  it. Do not put a badge on every tile in the panel; one per panel is enough when the whole panel
  shares a source.
- **The site panel** → `SIMULATED` on the chart. This is the one that must not be subtle. Amber, in
  the panel header, where the eye lands before it reaches the chart.
- **The programme strip** → `ON-CHAIN`.
- **Any tile showing a term** (committed kWh, "programme pays $0.15", the split) → `PROGRAMME TERMS`.
- **A legend**, once per page, in the footer: the four badges with their one-line explanation from
  `PROVENANCE[kind].explanation`. Use `PROVENANCE_ORDER` for the order.

Badge styling: the design system's chip — mono `label-caps`, a 10% tint of the tone colour, a 20%
border of the same. The live one may carry the pulsing dot; the others must not, because they are
not streaming.

Each badge carries its `explanation` as a `title` attribute so hovering answers the question without
leaving the page.

## On the landing

Same four badges beside the figures in the problem section and the economics section. The honesty
section then stops being an apology at the bottom of the page and becomes the legend for something
the reader has already been seeing all the way down.

## Why this matters more than it looks

The reference design invented telemetry (see section 1). Once every real number carries a visible
source, an invented one has nowhere to hide — there is no badge you could honestly put on it. The
labelling system and the audit are the same piece of work approached from two directions.

If you find yourself wanting to show a number you cannot badge, that is the system telling you to
delete it.

---

# Addendum 2 — a fifth kind: `cited`

The first addendum said "if you cannot badge a number, delete it". That rule was written to catch
**invented** numbers, and it was applied correctly to the $8.4B market figure — but the rule was
incomplete, not the judgement.

Deleting a real, sourced figure is not more honest than showing it. It just loses the argument.
What is dishonest is an **unsourced** number. So: name the source, link it, and let the reader
decide what it is worth.

`packages/shared/src/provenance.ts` now has a fifth kind:

| Kind | Badge | Applies to | Tone |
|---|---|---|---|
| `cited` | `CITED` | figures from published external research | neutral |

`PROVENANCE.cited.source` carries `{ name, url }`. Render the badge as a link to that URL, or put
the source name in the tooltip — a citation the reader cannot follow is not a citation.

**Restore the $8.4B figure in "The problem" with the `CITED` badge.** `PROVENANCE_ORDER` already
includes it, so the footer legend picks it up with no further change.

The test for any number on screen is unchanged in spirit and now complete: **every figure must be
able to say where it came from.** Measured here, read from the chain, agreed in the terms,
generated, or cited from a named source. If it can say none of those, it does not belong on the
page.
