# MINGA Nature — Frontend mockup brief

Audience: a coding AI building a **UI mockup** of MINGA Nature. The result will be handed to another engineer (the "integrator") who replaces the mock data layer with the real wallet, backend API and smart contracts. Everything below is written so that swap is mechanical.

Language of the product: **English only** (UI labels, errors, sample data, code identifiers, comments). "MINGA" is the product name.

---

## 1. What MINGA Nature is (60 seconds)

An open protocol on **HSK Chain** to create and fund **conservation agreements**. A funder deposits the whole budget into a dedicated smart contract. Money is released **milestone by milestone**, only when **two people sign the same approval**: the **community representative** and an **independent reviewer**. The contract then pays a fixed split (demo: 80% to the community execution account, 20% to a monitoring account) and stores a receipt. Unspent money returns to the funder after the execution deadline.

Two separate places hold information. Keep this visible in the UI wherever it matters:

| On-chain (HSK) — money and rules | Off-chain (backend) — documents and review |
|---|---|
| Participants, amounts, deadlines, deposit, paid milestones, receipts | Evidence files, versioned manifests, review results, login sessions |
| Enforced by contract code, nobody can edit it | Cannot move money, cannot sign for anyone |

The AI assistant and the paid external research are **advisory only**. The contract never reads documents and never requires an AI result. Human signatures are the review boundary.

Demo project (fictional, always labeled DEMO): **Pacific Mangrove — Demo**. 100 mUSD total, two milestones of 50 mUSD, 80/20 split.

---

## 2. Hard constraints

**Stack (do not change, the integrator depends on it)**
- Next.js 14 App Router, React 18, TypeScript `strict`, no `any`.
- `wagmi` 2, `viem` 2, `@tanstack/react-query` are already dependencies. Do not wire real wallet or chain calls in the mockup; see section 8 for the data-layer boundary.
- Styling: plain CSS with CSS variables (tokens) or CSS Modules. Optional: `clsx`, `lucide-react` (already installed). No component library that brings its own theme, no Tailwind plugins, no CSS-in-JS runtime.
- `npm run build` must pass with zero type errors.
- The current `apps/frontend/src` is an earlier throwaway prototype (everything simulated with timers and invented hashes). Replace it; do not build on it. Keep `package.json` scripts (`dev` on port 3000).

**Mandatory, verbatim, visible on every page (landing and app)**
> HSK testnet · No monetary value · Demonstration project and evidence.

**Never show**: trading charts, price tickers, invented impact counters (hectares restored, tonnes of CO₂, species), fabricated testimonials, partner logos, "certified" anything, yield or APY, token prices, USD conversions of mUSD, "invest" language.

**Do not imply**: a partnership with HSK, EAG, ETH Cali, Regen or Terrasos; a security audit; real conservation work; that a receipt is a biodiversity credit, carbon offset, land ownership, equity or a return.

**Numbers**: token amounts are **strings of base units** (mUSD has 6 decimals). Convert with `BigInt` at display time. Never use `Number` or floats for money. Format as `50.00 mUSD`.

**No source of truth in the browser**: `localStorage` may only hold conveniences (last tab, dismissed hints). Refreshing the page must never resubmit a transaction or repeat a paid action.

---

## 3. Sitemap

| Route | Purpose |
|---|---|
| `/` | Landing (public, informational). Primary button **Launch app** goes to `/app`. |
| `/app` | App home. Wallet connect + "Your agreements" grouped by role + public explorer of all agreements. |
| `/app/agreements/new` | Create agreement form (the connected wallet becomes the funder). |
| `/app/agreements/[address]` | Agreement detail. Tabs via `?tab=overview\|milestone-1\|milestone-2\|activity`. The whole page adapts to the **role of the connected wallet in that agreement**. |
| `/dev/states` | Dev-only gallery: every agreement status and milestone state rendered side by side. Not linked from the UI. |

There is **no role picker in the real product**. A role is derived from the connected wallet address compared with the agreement's participant addresses. The same person can be funder in one agreement and reviewer in another, so the role belongs to the agreement, not to the user.

---

## 4. Landing page (`/`)

Goal: someone who has never heard of MINGA understands it in 30 seconds and clicks **Launch app**. Public, no wallet needed, mobile-first.

Sections, in order:

1. **Top banner** (mandatory text above) + slim header: logo/wordmark "MINGA Nature", links `How it works`, `Roles`, `Limits`, button **Launch app**.
2. **Hero**: one headline, the pitch line as sub-headline, two buttons.
   - Sub-headline (verbatim): *MINGA Nature connects every conservation payment to an agreement, reviewed evidence, and the people responsible for the territory.*
   - Headline suggestion: *Conservation money that moves only when the people on the ground agree.*
   - Buttons: **Launch app** (primary, to `/app`), **See how it works** (anchor).
   - Visual: an illustration or simple diagram of the flow; no stock photos of people, no fake numbers.
3. **The problem** (2–3 short lines): funders, projects, reviewers and communities lack a shared record of what was promised, what evidence supports a milestone, who accepted it, and where the payment went.
4. **How it works** — a real sequence, so numbering is justified:
   1. Create an agreement (participants, budget, milestones, split, deadlines).
   2. Community and reviewer accept the exact terms.
   3. The funder deposits the full budget into the agreement contract.
   4. The community submits evidence; an assistant checks completeness (advisory).
   5. Community representative and reviewer both sign the same approval.
   6. The contract pays the split and stores a receipt. Unspent funds return after the deadline.
5. **Who does what** — four cards, one per role, each with 2–3 bullets from section 6.4: Funder, Community representative, Independent reviewer, Observer. Each card has a link into the app.
6. **What lives on-chain vs off-chain** — the two-column table from section 1, drawn as a simple diagram. Include the sentence: *The contract verifies signatures and rules. It does not inspect documents or judge ecological truth.*
7. **Demo project**: "Pacific Mangrove — Demo" card with: fictional badge, 100 mUSD, 2 milestones, 80/20 split, link **Open the demo agreement** (to the demo agreement detail, mock).
8. **What MINGA is not** (honesty section, prominent): not a certification of biodiversity or carbon; not a credit, offset, land right, equity or investment; the AI and external research are advisory; wallet ownership does not prove community consent; money contributed does not grant control over land; this is a testnet demonstration with fictional identities and evidence.
9. **Footer**: network facts (HSKChain Testnet, chain ID 133), contract addresses with explorer links (section 8.6), the mandatory banner text, link to source. No newsletter, no social feed.

Landing must work without JavaScript wallet code. No wallet prompt on load.

---

## 5. App shell (all `/app/*` pages)

- Mandatory banner on top, then app header: wordmark, nav (`Agreements`, `Create`), **wallet control** on the right.
- **Wallet control states**: `Connect wallet` → connecting → connected (short address, network badge, menu with `Copy address`, `View on explorer`, `Disconnect`).
- **Wrong network**: a persistent inline alert *"Wrong network. Switch to HSKChain Testnet (chain ID 133) to continue."* with a **Switch network** button. Every transaction button is replaced by this button while the network is wrong. Include a secondary **Add HSK Testnet to my wallet** button (params in section 8.6).
- **Wallet account change**: clear any role-based view immediately and re-derive the role for the new address. No stale role after switching accounts.
- **Two different signatures, label them differently**:
  - *Sign in* — proves you own the address to the backend to read private evidence. Costs no gas, authorizes no payment. Copy: *"Sign in to view private evidence. This does not authorize any payment."*
  - *Approve milestone* — authorizes a payment. Copy: *"This signature authorizes payment of X mUSD if the other required person also signs the same approval."*
- **Supported wallets**: standard browser/mobile wallets (EOA), e.g. MetaMask, Rabby, Coinbase Wallet. Show a small note: *"Smart-contract wallets and passkey wallets are not supported in this demo."*
- Mobile-first: community representatives will often use a phone. Touch targets ≥ 44px, no hover-only actions, tables collapse into stacked rows.
- Sync freshness chip on every agreement view: `Indexed up to block 33,328,900 · 4 s ago` or `Syncing…` (then show the last indexed block and mark balances as "may be out of date").

---

## 6. Screens

### 6.1 App home (`/app`)

- Not connected: show the public explorer (observer mode) plus a prominent **Connect wallet** call to action. No agreements are hidden; private data is simply locked.
- Connected: three groups, each collapsible, each with a count:
  - **As funder** — agreements where the wallet is the payer.
  - **As community representative**.
  - **As independent reviewer**.
  - Then **All agreements** (public explorer).
  - A **Create agreement** button is always visible when connected.
- Each agreement row/card: project name, `DEMO` badge, status chip (section 7.1), budget (`100.00 mUSD`), deposited / disbursed (small), next deadline with countdown, **"Your next action"** line when the connected wallet has one (e.g. *"Accept terms"*, *"Fund 100.00 mUSD"*, *"Sign milestone 1"*), otherwise nothing.
- Empty states: *"No agreements yet"* with the create button; *"No agreements where you take part"* in a role group.
- Filters on the explorer: status, `DEMO`. Search by project name or address. Pagination.

### 6.2 Create agreement (`/app/agreements/new`)

Any connected wallet can create; it becomes the funder. Say so at the top: *"You will be the funder of this agreement. Your address cannot be a signer."*

Fields (validation mirrors the contract, show inline errors before any transaction):

| Field | Rules |
|---|---|
| Project name, short description, location, methodology reference name and version | Free text. Saved as metadata document. |
| Community representative address | Valid checksummed address. Signs milestone approvals. |
| Independent reviewer address | Valid, **different** from funder and from community representative. |
| Community execution payee | Valid address. May equal the community representative. |
| Monitoring payee | Valid address, **different** from the community payee, not the agreement itself. |
| Community share | 1–99.99% (stored as basis points 1–9999). Show the live split preview: *"Each milestone: 40.00 mUSD to community, 10.00 mUSD to monitoring."* |
| Milestone 1 and 2: title, amount (> 0), required evidence checklist (list of requirement keys + human description) | Total budget = sum, shown live. Exactly two milestones. |
| Funding deadline, execution deadline | Strictly `now < funding < execution`. Show timezone as UTC. |
| Token | Fixed to mUSD in the mockup (6 decimals). Show the token address and *"Demo token, no monetary value"*. |
| Mode | Locked to `DEMO`. |

Submit flow, shown as a stepper the user can see:
1. **Review** — read-only summary of everything above plus the computed metadata hash.
2. **Save metadata** (backend, no gas) → shows hash.
3. **Create agreement** (wallet transaction) → pending state with transaction hash link.
4. **Confirmed** → redirect to the new agreement page. Do not redirect before confirmation.

### 6.3 Agreement detail (`/app/agreements/[address]`)

Shared header, always visible:
- Project name, `DEMO` badge, status chip, sync chip.
- Money strip (no floats): **Budget**, **Deposited**, **Paid out**, **Refundable** (only after execution deadline), **Pending**.
- Deadlines with countdown: funding deadline, execution deadline (UTC).
- **Your role** chip: `Funder` / `Community representative` / `Independent reviewer` / `Observer`, plus *"You are also a payee"* when the address matches a payee.

Tabs:

**Overview**
- Participants table: role, address (copy + explorer link), *accepted terms* yes/no (community and reviewer only).
- Payees and split: both payee addresses with percentages and per-milestone amounts.
- Agreed terms: `termsHash` (copy), metadata document viewer with a **"Hash verified"** indicator (the document bytes hash to the on-chain `metadataHash`) or a red *"Metadata does not match the contract"* state. Contract parameters and metadata are shown side by side before anyone accepts.
- Milestones summary: two rows with title, amount, status chip, paid receipt link.
- Contract addresses: agreement, token, factory.

**Milestone 1 / Milestone 2** (each has the same layout; details in 6.5)
- Milestone header: title, amount, status chip.
- Checklist of required evidence with satisfied/missing marks.
- Evidence versions and files.
- Review panel (advisory).
- Approval and signatures panel.
- Release panel / payment receipt.

**Activity**
- Chronological confirmed events: agreement created, terms accepted (by whom), funded, approval invalidated, milestone paid, remaining refunded. Each with UTC time, block, transaction hash link, and a `Confirmed` / `Pending` label. Pending items come from the user's own just-submitted transactions.

### 6.4 What each stakeholder sees and can do

**Funder**
- Sees: everything in Overview, evidence and review results (read-only), signatures status, all money numbers.
- Actions: **Fund** (only when both accepted and before the funding deadline). Use the four-state button: `Connect wallet → Switch network → Approve exactly 100.00 mUSD → Fund`. Show only one primary action at a time; never Approve and Fund together.
- Waiting state before funding: *"Waiting for the community representative and the reviewer to accept the terms (1 of 2)."* If the funding deadline passes unfunded: status *Expired unfunded*, no actions.
- Can request document review.
- After the execution deadline with money left: **Refund remaining** (also available to anyone).
- Cannot: sign approvals, upload evidence.

**Community representative**
- Actions: **Accept terms** (before funding deadline). **Upload evidence** and **Create evidence version** (section 6.5). Request review. **Sign milestone approval** (6.5). **Invalidate approval** (with a confirmation dialog explaining that all collected signatures for this milestone become stale).
- Sees: private evidence, review, the approval payload, who has signed.
- Prominent card: *"Your payment: 40.00 mUSD per milestone to 0x…"* so it is obvious where money lands.
- Cannot: fund.

**Independent reviewer**
- Actions: **Accept terms**. Read evidence versions (read-only file viewer). Request review. **Sign milestone approval**. **Invalidate approval**.
- Sees: same private data as the community, but **no upload controls**.
- Cannot: upload evidence, fund.

**Observer** (no wallet, or a wallet that is not a participant)
- Sees only public information: project, status, budget, participants' addresses, payees and split, deadlines, activity, payment receipts with explorer links.
- Private evidence, manifests, review results, research runs and signatures are **locked**. Show a lock card: *"Evidence is visible to agreement participants only."* with a **Connect wallet** button when not connected.
- Actions: may trigger **Refund remaining** after the deadline (the contract allows anyone). Nothing else.

### 6.5 Milestone panel details

**Evidence**
- Upload area: drag and drop plus file picker. **Text or JSON files only**, max 1 MB each, up to 10 files. Reject other types with a clear message. Uploads show progress and a SHA-256 hash once done.
- Each file is mapped to a checklist requirement key via a dropdown.
- **Create evidence version**: freezes the current file set into a **manifest**. Show manifest version number, creation time, the exact manifest content (read-only monospace) and its **evidenceHash**. Copy: *"Any change creates a new version with a new hash. Signed versions stay intact."*
- Version list with a badge on the version that is currently being signed.
- Incomplete manifests are allowed but show *"Missing requirement: community-assembly-resolution"* clearly.

**Review panel** (advisory)
- Button **Run document check** (participants only). Disabled with a reason when a check for this exact manifest already exists ("Already reviewed") — never re-run a paid action silently.
- Result: status chip `INCOMPLETE` / `READY_FOR_HUMAN_REVIEW` / `UNAVAILABLE`, missing requirements, findings (message, file reference, supporting excerpt when present), evidence references, limitations, and `mode`.
  - When `mode = DETERMINISTIC_ONLY`, show verbatim: *Document checks only — AI provider not connected.*
  - Findings without evidence are labeled *uncertain*. Never render a "certified", "verified impact" or ecological score.
- **External research panel** (only if the feature is enabled): provider, endpoint type (`search` / `extract`), status, authorized vs actual spend in USD, payment method, list of **public sources** (kept visually separate from uploaded evidence), receipt/reference, and the statement in bold:
  **External research is advisory. Human approval is still required.**
  - Unavailable state, verbatim: *External research unavailable — MPP payment service not configured or funded.*
  - Budget-rejected and skipped states each show the real reason.
  - Add a one-line note: *"Paid from a separate operational account. Never from the agreement funds."*

**Approval and signatures** (the most important screen; design it carefully)
- Header: *"Both required people must sign the identical approval."* Two slots: Community representative and Independent reviewer, each `Signed ✓` (with time) or `Waiting`, plus a progress `1 of 2`.
- **Approval summary** shown *before* the sign button, all in human terms **and** raw values (copyable):
  - Milestone, amount, split (`40.00 mUSD → community, 10.00 mUSD → monitoring`), `termsHash`, `evidenceHash`, nonce, signed-at, valid-until (UTC).
  - A "Matches the contract" checklist: terms hash ✓, amount ✓, nonce is current ✓, evidence hash matches the selected manifest ✓. If any check fails, the sign button is disabled and the failing check is highlighted. Do not sign opaque data.
- Button **Sign approval** (for the two signers only). States: idle → waiting for wallet → signed → error/rejected.
- **Stale signatures**: when the on-chain nonce changed (someone invalidated), old signatures appear greyed with the badge *Stale — invalidated*, and a new approval must be created. Stale signatures are never offered for release.
- **Invalidate approval** button (either signer) with confirm dialog.
- Explanatory footnote: *"A saved signature is not a payment. Nothing moves until the release transaction is confirmed."*

**Release and receipt**
- **Release payment** appears only when both current signatures exist and are valid. Flow: `Simulate` (no gas) → show simulation result → `Send transaction`. If simulation fails, show the translated error and *"Simulation failed. No transaction was sent."* (no transaction hash exists for a rejected simulation).
- Copy under the button: *"Anyone in this agreement can submit this. The contract, not the sender, decides who gets paid."*
- After confirmation, the panel becomes a **receipt**: title *Milestone accepted and paid* (never "Certified impact"), amount, the two payments (`40.00 mUSD → 0x…`, `10.00 mUSD → 0x…`), `evidenceHash`, `termsHash`, paid-at, block, **View transaction** link.
- Milestone 2 stays **Locked** (*"Available after milestone 1 is paid"*) until milestone 1 is paid.

---

## 7. State models

### 7.1 Agreement status (derive it in one pure function; render a chip for each)

| Status | Meaning |
|---|---|
| `AWAITING_ACCEPTANCE` | Not funded, not both accepted, funding deadline not passed |
| `READY_TO_FUND` | Both accepted, not funded, funding deadline not passed |
| `EXPIRED_UNFUNDED` | Not funded and funding deadline passed |
| `FUNDED` | Funded, no milestone paid, execution deadline not passed |
| `FIRST_MILESTONE_PAID` | Milestone 1 paid, not refunded |
| `COMPLETED` | Both milestones paid |
| `EXPIRED_REFUNDABLE` | Funded, execution deadline passed, not refunded, part of the budget unpaid |
| `REFUNDED` | Remaining funds returned to the funder |

### 7.2 Milestone status

`LOCKED` (previous milestone unpaid) → `COLLECTING_EVIDENCE` (no manifest, or checklist incomplete) → `AWAITING_SIGNATURES` (0 or 1 of 2 valid signatures on the current payload) → `READY_TO_RELEASE` (2 of 2) → `PAID`. Also `EXPIRED` (deadline passed unpaid). Review results do **not** change the state; they are advisory. A `stale` flag on signatures returns the milestone to `AWAITING_SIGNATURES`.

### 7.3 Transaction lifecycle (one component, reused by every on-chain button)

`idle → simulating → awaiting-wallet → submitted (hash link, "Pending") → confirmed` or `rejected` (user cancelled) or `failed` (reverted) or `simulation-failed` (no hash).
- The button disables on click and stays disabled until confirmation or failure. It shows a spinner and a verb (*Funding…*, *Signing…*).
- Approvals need two guards: submitting (click → confirmation) and a short cooldown after confirmation while the cache refreshes. The button must be re-enabled in a `finally` even on rejection.
- Each action has its own state. Never share one `isLoading` between buttons.
- Errors appear inline, next to the button that caused them, and stay until dismissed.

---

## 8. Data layer contract (this is what the integrator will swap)

**Rule: components never call `fetch`, `wagmi`, `viem` or read `localStorage` directly.** They call hooks from `src/data/`. In the mockup those hooks return fixtures with fake latency. The integrator keeps the same signatures and replaces the bodies. Components stay presentational and receive typed props.

Suggested layout:

```
src/
  app/(marketing)/page.tsx          # landing
  app/app/...                       # app routes
  app/dev/states/page.tsx
  components/{layout,agreement,evidence,signing,tx,common}/
  data/{types.ts,hooks.ts,mock/}    # <- the swap boundary
  lib/{format.ts,errors.ts,roles.ts,status.ts,config.ts}
```

### 8.1 Types

Reuse `Role`, `EvidenceManifest`, `ManifestFileEntry`, `AIReviewResult`, `MilestoneApprovalPayload` from `@minga/shared` (`packages/shared/src/types.ts`). Define the rest in `src/data/types.ts`:

```ts
export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type BaseUnits = string; // integer as decimal string, mUSD has 6 decimals

export type AgreementStatus =
  | "AWAITING_ACCEPTANCE" | "READY_TO_FUND" | "EXPIRED_UNFUNDED" | "FUNDED"
  | "FIRST_MILESTONE_PAID" | "COMPLETED" | "EXPIRED_REFUNDABLE" | "REFUNDED";

export type MilestoneStatus =
  | "LOCKED" | "COLLECTING_EVIDENCE" | "AWAITING_SIGNATURES" | "READY_TO_RELEASE" | "PAID" | "EXPIRED";

export interface Freshness { lastIndexedBlock: number; syncing: boolean; updatedAt: string /* UTC ISO */ }

export interface AgreementSummary {
  address: Address;
  projectName: string;
  demo: boolean;
  status: AgreementStatus;
  totalBudget: BaseUnits;
  totalPaid: BaseUnits;
  fundingDeadline: string;   // UTC ISO
  executionDeadline: string;
  funder: Address;
  communitySigner: Address;
  verifierSigner: Address;
  freshness: Freshness;
}

export interface MilestoneReceipt {
  txHash: Hex; blockNumber: number; paidAt: string;
  communityAmount: BaseUnits; monitoringAmount: BaseUnits;
  payeeCommunity: Address; payeeMonitoring: Address;
  evidenceHash: Hex; termsHash: Hex;
}

export interface Milestone {
  id: 0 | 1;
  title: string;
  amount: BaseUnits;
  status: MilestoneStatus;
  nonce: number;
  requiredEvidence: { key: string; description: string; satisfied: boolean }[];
  receipt?: MilestoneReceipt;
}

export interface AgreementDetail extends AgreementSummary {
  description: string;
  location?: string;
  token: { address: Address; symbol: string; decimals: number };
  factory: Address;
  termsHash: Hex;
  metadataHash: Hex;
  metadata: { text: string; hashVerified: boolean };
  communityAccepted: boolean;
  verifierAccepted: boolean;
  funded: boolean;
  refunded: boolean;
  payeeCommunity: Address;
  payeeMonitoring: Address;
  communityBps: number;
  milestones: [Milestone, Milestone];
}

export interface EvidenceFile { id: string; fileName: string; mimeType: string; size: number; sha256: Hex; requirementKey?: string; uploadedAt: string }
export interface ManifestVersion { id: string; version: number; evidenceHash: Hex; createdAt: string; manifestText: string; files: EvidenceFile[]; current: boolean }

export interface ResearchRun {
  id: string; provider: string; endpoint: "search" | "extract";
  status: "COMPLETED" | "SKIPPED" | "UNAVAILABLE" | "BUDGET_EXCEEDED" | "FAILED";
  authorizedSpendUsd: string; actualSpendUsd: string; paymentMethod: string;
  receiptReference?: string; sourceReferences: string[]; reason?: string; createdAt: string;
}

export interface ApprovalSignature { role: "COMMUNITY" | "REVIEWER"; signer: Address; signedAt: string; stale: boolean }
export interface ApprovalState {
  payload?: MilestoneApprovalPayload; payloadHash?: Hex;
  signatures: ApprovalSignature[];
  matchesContract: { termsHash: boolean; amount: boolean; nonce: boolean; evidenceHash: boolean };
  executable: boolean; // 2 of 2 valid and current
}

export interface ActivityEvent {
  id: string; type: "AgreementCreated" | "TermsAccepted" | "AgreementFunded" | "ApprovalInvalidated" | "MilestonePaid" | "RemainingRefunded";
  actor?: Address; txHash: Hex; blockNumber: number; at: string; confirmed: boolean; details?: Record<string, string>;
}

export type TxPhase = "idle" | "simulating" | "awaiting-wallet" | "submitted" | "confirmed" | "rejected" | "failed" | "simulation-failed";
export interface TxState { phase: TxPhase; hash?: Hex; error?: { code: string; message: string } }
export type ActionKind =
  | "signIn" | "saveMetadata" | "createAgreement" | "acceptTerms" | "approveToken" | "fund"
  | "uploadEvidence" | "createManifest" | "requestReview" | "signApproval" | "release" | "invalidate" | "refund";
```

### 8.2 Hooks (signatures the integrator will implement for real)

```ts
type Async<T> = { data?: T; isLoading: boolean; error?: { code: string; message: string }; refetch(): void };

useWallet(): {
  status: "disconnected" | "connecting" | "connected";
  address?: Address; chainId?: number; isCorrectChain: boolean;
  session: "none" | "signing-in" | "signed-in";
  connect(): Promise<void>; disconnect(): void; switchToHsk(): Promise<void>; addHskToWallet(): Promise<void>;
};
useAgreements(filter?: { status?: AgreementStatus; demo?: boolean; q?: string; page?: number }): Async<{ items: AgreementSummary[]; total: number }>;
useAgreement(address: Address): Async<AgreementDetail>;
useEvidence(address: Address, milestoneId: 0 | 1): Async<{ files: EvidenceFile[]; manifests: ManifestVersion[] }>;   // participants only
useReview(address: Address, milestoneId: 0 | 1, evidenceHash?: Hex): Async<{ review?: AIReviewResult; runs: ResearchRun[] }>;
useApproval(address: Address, milestoneId: 0 | 1): Async<ApprovalState>;
useActivity(address: Address): Async<ActivityEvent[]>;
useAction(kind: ActionKind): { state: TxState; run(args: Record<string, unknown>): Promise<void>; reset(): void };
```

Pure helpers in `lib/` (unit-testable, no I/O): `roleOf(agreement, address): Role`, `deriveAgreementStatus(...)`, `deriveMilestoneStatus(...)`, `formatAmount(base: BaseUnits, decimals = 6): string`, `formatAddress(a)`, `formatUtc(iso)`, `countdown(iso)`, `translateError(raw): { code, message }`, `explorerAddressUrl(a)`, `explorerTxUrl(h)`.

### 8.3 Config (`lib/config.ts`, read from env with these defaults)

| Key | Value |
|---|---|
| Chain | HSKChain Testnet, ID `133` (`0x85`), RPC `https://testnet.hsk.xyz`, native symbol `HSK` (18 decimals) |
| Explorer | `https://testnet-explorer.hskchain.net` (`/address/<a>`, `/tx/<h>`) |
| Factory | `0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1` (`NEXT_PUBLIC_FACTORY_ADDRESS`) |
| Token mUSD | `0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1` (`NEXT_PUBLIC_MOCK_USD_ADDRESS`), 6 decimals |
| Backend | `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`) |

"Add HSK Testnet to wallet" uses `wallet_addEthereumChain` with `chainId: "0x85"`, name `HSKChain Testnet`, the RPC and explorer above, native currency `HSK` / 18.

---

## 9. Error translation (implement in `lib/errors.ts`)

Contract reverts arrive as short strings. Never show a raw string, hex selector or "execution reverted". Map every one to plain English, keep the original in a collapsed "Technical details".

| Contract message | Show |
|---|---|
| `Funding deadline passed` | The funding window has closed. |
| `Terms hash mismatch` | These terms do not match the agreement. Reload the page and check the terms again. |
| `Caller not authorized to accept terms` | This wallet is not the community representative or the reviewer of this agreement. |
| `Only payer can fund` | Only the funder's wallet can deposit the budget. |
| `Already funded` | This agreement is already funded. |
| `Both parties must accept terms before funding` | The community representative and the reviewer must both accept the terms first. |
| `Fee-on-transfer unsupported` | This token charges a fee on transfer and cannot be used. |
| `ERC20InsufficientAllowance` | The token allowance is too low. Approve the exact budget first. |
| `ERC20InsufficientBalance` | Your wallet does not hold enough mUSD. |
| `Agreement not funded` | The agreement has not been funded yet. |
| `Agreement refunded` | The remaining funds were already returned to the funder. |
| `Milestone out of sequence` | Milestone 2 cannot be paid before milestone 1, and a paid milestone cannot be paid again. |
| `Milestone already paid` | This milestone was already paid. |
| `Amount mismatch` / `Demo mode mismatch` | The approval does not match the agreement. Create a new approval. |
| `Nonce mismatch` | This approval was invalidated. Create a new approval and collect both signatures again. |
| `Evidence hash empty` | The approval has no evidence attached. |
| `Signed before funding` / `Future signedAt timestamp` | The approval timestamp is not valid. Create a new approval. |
| `Approval expired` | This approval has expired. Create a new one. |
| `Approval validity exceeds deadline` | The approval would be valid past the execution deadline. |
| `Execution deadline reached` | The execution deadline has passed. Payments are closed; the remaining funds can be refunded. |
| `Invalid community signature` / `Invalid verifier signature` | The community representative's / reviewer's signature is missing or does not match this approval. |
| `Only authorized signers can invalidate` | Only the community representative or the reviewer can invalidate an approval. |
| `Agreement not active` | The agreement is not active. |
| `Milestone invalid or paid` | This milestone cannot be invalidated. |
| `Execution deadline passed` | The execution deadline has passed. |
| `Execution deadline not reached` | Funds can be refunded only after the execution deadline. |
| `Already refunded` | The remaining funds were already refunded. |
| `No remaining balance` | Nothing is left to refund. |
| Constructor errors on create (`Invalid community signer`, `Signers and payer must be distinct`, `Payees must be distinct`, `Milestone amounts must be positive`, `Community bps must be between 1 and 9999`, `Invalid deadlines`, …) | Prevent these client-side with the form rules in 6.2. If one still appears, show the matching field error. |
| User rejected the request | Cancelled in your wallet. Nothing was sent. |
| Anything else | Something went wrong. Nothing was changed. (Technical details collapsed.) |

---

## 10. UX rules

- **Addresses**: show `0x1a89…c402`, with copy and explorer link, never a free-text field for critical input without validation and paste normalization. Show checksummed form.
- **Amounts**: always `50.00 mUSD` from base units; live previews in the create form; never raw base units in the UI.
- **Time**: UTC everywhere, with relative countdown (`in 3 h 12 min`) and the absolute value on hover/tap.
- **One primary action per screen state.** Secondary actions are visually quieter.
- **Locked, not hidden**: things a role cannot do are shown disabled with the reason (*"Only the community representative can upload evidence"*), except data that must stay private for observers.
- **Loading**: skeletons, not spinners over blank pages. **Empty states** with a next step. **Errors** inline and recoverable.
- **No automatic side effects** on page load or refresh: no auto-sending, no auto-reviewing, no auto-purchasing.
- Accessibility: keyboard reachable, visible focus, `aria-live="polite"` for transaction status, color is never the only signal (use icon + text on status chips), contrast WCAG AA.

---

## 11. Mock data and dev tools

- **Agreement A** — *Pacific Mangrove — Demo* (fictional): funded, milestone 1 with an incomplete manifest v1 and a complete manifest v2, reviewer signed, community not yet. Milestone titles and checklists:
  - Milestone 1 *Baseline Survey and Community Work Plan*, 50.00 mUSD, requires `baseline-survey-v1`, `community-assembly-resolution`.
  - Milestone 2 *Year 1 Restoration and Canopy Density Report*, 50.00 mUSD, requires `restoration-monitoring-report-y1`, `drone-canopy-orthomosaic`.
  - Description: *Restoration and sustainable protection of 1,200 hectares of degraded mangrove ecosystems along the Colombian Pacific coastline.* (Fictional; label it.)
- **Agreement B** — *Amazonian Canopy — Demo B*: awaiting acceptance.
- Add enough extra mock agreements (or the `/dev/states` gallery) so **every** `AgreementStatus` and `MilestoneStatus` can be seen, including a stale approval, an unavailable external research panel, a `DETERMINISTIC_ONLY` review, wrong network, syncing, and an observer view with locked evidence.
- Participants use obviously fake addresses (e.g. `0x1111…`, `0x2222…`). Never real keys.
- **`DevRoleSwitcher`**: a small floating panel, bottom-left, labeled *"Mockup only — replaced by the real wallet"*. It only sets which mock address is "connected" so each role's view can be previewed. Put it in one file (`components/dev/DevRoleSwitcher.tsx`) mounted from one line in the layout so it is trivial to delete. The role is still **derived** from the address via `roleOf`, never stored as a role.
- Mock hooks add 300–800 ms latency, and a switch to force each failure (`?fail=release`, `?wrongNetwork=1`, `?syncing=1`) to exercise every state.

---

## 12. Design direction and accessibility

- Feel: restrained, trustworthy, human. Forest green, ivory, amber. Current tokens in `apps/frontend/src/app/globals.css` (`--color-primary #1b4332`, `--color-secondary #d97706`, etc.) can be kept or improved, but centralize every color, radius, shadow and font in CSS variables so the integrator can retheme.
- People, purpose, budget and the next action come first. Avoid crypto-dashboard tropes (neon, gradients, dense tables, "degen" wording).
- Status chips need icon + label + color. Money is the largest number on any screen that shows it.
- Light theme is required; dark is optional.
- Photos: none required. If you use illustration, keep it abstract (no faces, no real locations).

---

## 13. Priorities and hand-back

**P0** (needed for the demo): landing, app shell with wallet control + wrong-network state, app home, agreement detail Overview for all four roles, create agreement, milestone panel with evidence + approval + release/receipt, transaction button component, error translation.
**P1**: review panel with external research states, Activity tab, sync/freshness states, stale-signature states.
**P2**: `/dev/states` gallery, filters/search/pagination polish, empty-state polish.

**Definition of done**
- Every route in section 3 renders on desktop and at 390 px width.
- Each role sees exactly what section 6.4 lists; observers never see private data.
- Every on-chain button uses the shared transaction component and all states in 7.3 are reachable.
- No component imports `wagmi`, `viem`, `fetch` or `localStorage` directly; all data goes through `src/data/`.
- `npm run build` passes with zero type errors; no `any`.
- Mandatory banner and mandatory verbatim strings from this document are present.

**Hand back**: the `apps/frontend` folder, a list of routes and components, one screenshot per role × main state, and a short list of any place where you deviated from this document and why.

## 14. Out of scope (do not build)

Real wallet/chain/API calls, authentication, AI or MPP logic, backend code, charts, maps, follows/social feed/chat, multi-funder pools, token swaps, governance voting, admin panel, multiple methodologies, i18n.
