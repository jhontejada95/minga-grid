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
