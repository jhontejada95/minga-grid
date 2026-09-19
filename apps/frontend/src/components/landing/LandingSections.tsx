// Ported from the Stitch mockup (docs: design/stitch). Content edited for accuracy.
import Link from "next/link";
import { Faq } from "./Faq";

export function LandingSections() {
  return (
    <>
{/* HERO SECTION */}
<section className="relative w-full max-w-[1280px] mx-auto px-margin pt-space-xl pb-space-2xl">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center">
{/* Left Column: Editorial Statement */}
<div className="lg:col-span-6 flex flex-col items-start space-y-space-lg">
<div className="inline-flex items-center gap-space-xs px-space-md py-1 rounded-full bg-surface-container-high text-primary font-label-md text-label-md">
<span className="w-1.5 h-1.5 rounded-full bg-primary">
</span>
          Conservation funding. Shared accountability.
        </div>
<h1 className="font-headline-xl text-headline-xl text-primary leading-tight tracking-tight">
          Back nature. Make every commitment clear.
        </h1>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
          MINGA Nature brings funders, communities, and reviewers together around clear conservation agreements—so everyone can understand what is promised, how progress is reviewed, and when funding is released.
        </p>
<div className="flex flex-wrap items-center gap-space-md pt-space-xs w-full sm:w-auto">
<Link className="inline-flex items-center justify-center px-space-xl py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all shadow-sm" href="/app">
            Launch app →
          </Link>
<a className="inline-flex items-center justify-center px-space-lg py-3 rounded-lg bg-surface-container-low text-primary font-label-md text-label-md hover:bg-surface-container transition-all" href="#how-it-works">
            How it works
          </a>
</div>
<div className="pt-space-sm flex items-center gap-space-xs font-code-xs text-code-xs text-outline">
<span className="material-symbols-outlined text-[15px] text-primary">verified</span>
          Built on HSK Chain. Designed around people.
        </div>
</div>
{/* Right Column: Hero Visual Artwork Card */}
<div className="lg:col-span-6 flex flex-col">
<div className="relative rounded-xl overflow-hidden bg-surface-container-lowest shadow-md">
{/* Artwork Image Container */}
<div className="relative w-full aspect-[16/10] overflow-hidden bg-surface-container">
<img className="w-full h-full object-cover object-center transition-transform duration-700 hover:scale-[1.02]" alt="Illustration of a tranquil mangrove estuary at sunset" src="/hero-mangrove.png" />
<div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-md px-space-md py-1 rounded-full text-primary font-label-md text-label-md shadow-sm">
              Illustrative workflow
            </div>
</div>
{/* 3-Step Pill Bar Under Artwork */}
<div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
<div className="flex items-center gap-space-xs w-full justify-between sm:justify-start">
<span className="font-code-xs text-code-xs uppercase tracking-wider text-outline">Lifecycle</span>
<div className="flex items-center gap-1 bg-surface-container-highest px-3 py-1 rounded-full text-primary font-code-sm text-code-sm">
<span>Agree</span>
<span className="text-outline">→</span>
<span>Review</span>
<span className="text-outline">→</span>
<span>Release</span>
</div>
</div>
<div className="flex items-center gap-1 text-on-surface-variant font-code-xs text-code-xs">
<span className="material-symbols-outlined text-[14px] text-secondary">database</span>
<span>Tamper-evident record</span>
</div>
</div>
</div>
</div>
</div>
</section>
{/* SECTION 2: WHY MINGA */}
<section className="w-full bg-surface-container-low py-space-2xl" id="why-minga">
<div className="max-w-[1280px] mx-auto px-margin">
<div className="max-w-2xl mb-space-2xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          01 // Purpose &amp; Rationale
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight mb-space-md">
          Conservation needs commitment people can count on.
        </h2>
<p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          Every conservation project brings people, funding, and responsibilities together. When expectations and records are scattered, it becomes harder to understand what was agreed, what needs review, and what happens next. MINGA brings that relationship into one clear agreement, with shared milestones and an understandable payment history.
        </p>
</div>
{/* 3 Editorial Benefit Columns */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div>
<div className="font-headline-lg text-headline-lg text-primary-fixed-dim/60 mb-space-sm select-none">01</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              Clarity from the start.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Define the work, budget, responsibilities, and payment allocation before funding begins.
            </p>
</div>
<div className="pt-space-md">
<span className="inline-flex items-center text-secondary font-label-md text-label-md gap-1">
              Mutual covenant terms
            </span>
</div>
</div>
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div>
<div className="font-headline-lg text-headline-lg text-primary-fixed-dim/60 mb-space-sm select-none">02</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              A place for the community.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Community representatives participate in accepting terms and approving milestone payments.
            </p>
</div>
<div className="pt-space-md">
<span className="inline-flex items-center text-secondary font-label-md text-label-md gap-1">
              Local self-determination
            </span>
</div>
</div>
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div>
<div className="font-headline-lg text-headline-lg text-primary-fixed-dim/60 mb-space-sm select-none">03</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              A record everyone can follow.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Keep accepted milestones and their payments connected to the same agreement.
            </p>
</div>
<div className="pt-space-md">
<span className="inline-flex items-center text-secondary font-label-md text-label-md gap-1">
              Deterministic escrow ledger
            </span>
</div>
</div>
</div>
</div>
</section>
{/* SECTION 3: HOW IT WORKS */}
<section className="w-full bg-surface py-space-2xl" id="how-it-works">
<div className="max-w-[1280px] mx-auto px-margin">
<div className="max-w-2xl mb-space-2xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          02 // Protocol Lifecycle
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight mb-space-xs">
          From shared commitment to accountable action.
        </h2>
<p className="font-body-lg text-body-lg text-on-surface-variant">
          Clear conditions before funding. Shared approval before payment.
        </p>
</div>
{/* 4-Step Horizontal Sequence Cards */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
{/* Step 1 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between relative group hover:bg-surface-container transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-code-sm text-code-sm font-semibold text-primary px-2.5 py-1 rounded bg-surface-container-highest">01</span>
<span className="material-symbols-outlined text-primary text-[20px]">assignment</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              Agree on the work.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Set the conservation goals, milestones, budget, responsibilities, and allocation. The community representative and reviewer accept the terms.
            </p>
</div>
<div className="mt-space-lg pt-space-xs font-code-xs text-code-xs text-outline">
            Phase: Covenant Definition
          </div>
</div>
{/* Step 2 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between relative group hover:bg-surface-container transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-code-sm text-code-sm font-semibold text-primary px-2.5 py-1 rounded bg-surface-container-highest">02</span>
<span className="material-symbols-outlined text-primary text-[20px]">lock</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              Set funding aside.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              The funder commits the agreed budget, ready for milestone payments under those terms.
            </p>
</div>
<div className="mt-space-lg pt-space-xs font-code-xs text-code-xs text-outline">
            Phase: Smart Escrow Locking
          </div>
</div>
{/* Step 3 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between relative group hover:bg-surface-container transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-code-sm text-code-sm font-semibold text-primary px-2.5 py-1 rounded bg-surface-container-highest">03</span>
<span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              Review progress together.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              The project provides supporting evidence. The community representative and independent reviewer approve the same milestone payment.
            </p>
</div>
<div className="mt-space-lg pt-space-xs font-code-xs text-code-xs text-outline">
            Phase: Multi-party Approval
          </div>
</div>
{/* Step 4 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between relative group hover:bg-surface-container transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-code-sm text-code-sm font-semibold text-primary px-2.5 py-1 rounded bg-surface-container-highest">04</span>
<span className="material-symbols-outlined text-primary text-[20px]">payments</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary mb-space-xs">
              Release the agreed payment.
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Once the required approvals are in place, payment follows the agreed allocation and becomes part of the agreement's history.
            </p>
</div>
<div className="mt-space-lg pt-space-xs font-code-xs text-code-xs text-outline">
            Phase: On-chain Settlement
          </div>
</div>
</div>
</div>
</section>
{/* SECTION 4: WHO IT'S FOR */}
<section className="w-full bg-surface-container-low py-space-2xl" id="who-its-for">
<div className="max-w-[1280px] mx-auto px-margin">
<div className="max-w-2xl mb-space-2xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          03 // Ecosystem Participants
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight">
          Different responsibilities. One shared agreement.
        </h2>
</div>
{/* 3 Audience Panels */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg mb-space-xl">
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div className="space-y-space-sm">
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
<span className="material-symbols-outlined">account_balance</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary">
              For funders
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Understand the commitment before you fund it, follow the agreed milestones, and see how payments are allocated.
            </p>
</div>
<div className="font-code-xs text-code-xs text-secondary font-medium">
            Fiduciary oversight &amp; verifiable allocation
          </div>
</div>
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div className="space-y-space-sm">
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
<span className="material-symbols-outlined">groups</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary">
              For communities and project teams
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Make responsibilities and funding conditions clear, share the evidence behind the work, and participate in milestone approval.
            </p>
</div>
<div className="font-code-xs text-code-xs text-secondary font-medium">
            Direct consent &amp; transparent disbursement
          </div>
</div>
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div className="space-y-space-sm">
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
<span className="material-symbols-outlined">rule</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary">
              For independent reviewers
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Review the agreed requirements and supporting evidence, and record your decision alongside the community's acceptance.
            </p>
</div>
<div className="font-code-xs text-code-xs text-secondary font-medium">
            Objective audit &amp; dual-signoff authorization
          </div>
</div>
</div>
{/* Concluding Strip */}
<div className="p-space-lg rounded-xl bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-md">
<div className="flex items-center gap-space-sm text-on-surface">
<span className="material-symbols-outlined text-secondary text-[22px]">visibility</span>
<p className="font-body-md text-body-md font-medium">
            Public payment records also give observers a clearer view of the agreement's progress.
          </p>
</div>
<Link className="inline-flex items-center justify-center px-space-lg py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all whitespace-nowrap shadow-sm" href="/app">
          Launch app →
        </Link>
</div>
</div>
</section>
{/* SECTION 5: A CONSERVATION SCENARIO */}
<section className="w-full bg-surface py-space-2xl">
<div className="max-w-[1280px] mx-auto px-margin">
<div className="max-w-2xl mb-space-2xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          04 // Concrete Case Study
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight">
          Start with a place. Build a shared commitment.
        </h2>
</div>
{/* Main Feature Spotlight Card */}
<div className="bg-surface-container-low rounded-xl p-space-xl grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center shadow-sm">
{/* Left: Narrative & Description */}
<div className="lg:col-span-6 space-y-space-md">
<div className="flex flex-wrap items-center gap-space-sm">
<span className="font-headline-lg text-headline-lg text-primary font-semibold">
              Pacific Mangrove — Demo
            </span>
<span className="px-space-sm py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-code-xs text-code-xs">
              Fictional project · Illustrative example
            </span>
</div>
<p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            Imagine a community-led mangrove restoration project. A funder commits a budget for an initial survey and work plan, followed by a monitoring report. Each milestone has clear requirements and needs approval from both the community representative and the reviewer before payment.
          </p>
<p className="font-body-sm text-body-sm text-outline">
            The same agreement approach can support other conservation settings, with locally defined methods and responsibilities.
          </p>
<div className="pt-space-xs">
<Link className="inline-flex items-center gap-space-xs px-space-lg py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all shadow-sm" href="/app">
<span>Explore in app</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</Link>
</div>
</div>
{/* Right: Sample Milestone Parameters Card */}
<div className="lg:col-span-6 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm space-y-space-md">
<div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high">
<span className="font-code-xs text-code-xs uppercase tracking-wider text-outline">Total Committed Allocation</span>
<span className="font-headline-sm text-headline-sm text-primary font-mono">100.00 mUSD</span>
</div>
{/* Milestones Breakdown */}
<div className="space-y-space-sm">
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col space-y-1">
<div className="flex items-center justify-between">
<span className="font-label-md text-label-md text-primary font-semibold">Milestone 1: Baseline Survey &amp; Plan</span>
<span className="font-code-sm text-code-sm text-primary font-medium">50.00 mUSD</span>
</div>
<div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
<span>First release once the baseline evidence is reviewed and both people approve</span>
<span className="text-secondary font-code-xs text-code-xs">Dual-approval</span>
</div>
</div>
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col space-y-1">
<div className="flex items-center justify-between">
<span className="font-label-md text-label-md text-primary font-semibold">Milestone 2: Year 1 Monitoring Report</span>
<span className="font-code-sm text-code-sm text-primary font-medium">50.00 mUSD</span>
</div>
<div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
<span>Final release once the monitoring evidence is reviewed and both people approve</span>
<span className="text-secondary font-code-xs text-code-xs">Dual-approval</span>
</div>
</div>
</div>
{/* Allocation Split Visual Bar */}
<div className="pt-space-xs space-y-space-xs">
<div className="flex items-center justify-between font-code-xs text-code-xs text-on-surface-variant">
<span>Community Restoration (80%)</span>
<span>Independent Monitoring (20%)</span>
</div>
<div className="w-full h-3 rounded-full bg-surface-container flex overflow-hidden">
<div className="h-full bg-primary" style={{ width: "80%" }}>
</div>
<div className="h-full bg-secondary-container" style={{ width: "20%" }}>
</div>
</div>
<div className="flex items-center justify-between font-code-xs text-code-xs text-outline pt-0.5">
<span>80.00 mUSD designated</span>
<span>20.00 mUSD designated</span>
</div>
</div>
</div>
</div>
</div>
</section>
{/* SECTION 6: TRUST EXPLAINED SIMPLY */}
<section className="w-full bg-surface-container-low py-space-2xl">
<div className="max-w-[1280px] mx-auto px-margin">
<div className="max-w-3xl space-y-space-md mb-space-xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          05 // Institutional Integrity
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight">
          Human judgment. Clear rules. A shared record.
        </h2>
<p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          Conservation decisions depend on people and evidence. MINGA is designed to make the agreement and payment process easier to follow, while keeping milestone approval with the designated community representative and reviewer.
        </p>
</div>
{/* Trust Pillars & Note Banners */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
{/* HSK Statement Card */}
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div className="space-y-space-sm">
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
<span className="material-symbols-outlined">account_tree</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary">
              Shared Record &amp; Payment Rules
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              HSK Chain provides the shared record and payment rules behind MINGA's agreements.
            </p>
</div>
<div className="pt-space-md font-code-xs text-code-xs text-outline">
            Immutable settlement · Non-custodial escrow logic
          </div>
</div>
{/* AI Note Card */}
<div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col justify-between space-y-space-md">
<div className="space-y-space-sm">
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
<span className="material-symbols-outlined">troubleshoot</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-primary">
              Assisting People, Not Replacing Them
            </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              The product is designed to support reviewers with tools that organize evidence and highlight missing information. These tools assist people; they do not certify environmental outcomes.
            </p>
</div>
<div className="pt-space-md font-code-xs text-code-xs text-outline">
            Reviewer-centric decision authority
          </div>
</div>
</div>
</div>
</section>
{/* SECTION 7: FAQ */}
<section className="w-full bg-surface py-space-2xl" id="faq">
<div className="max-w-[960px] mx-auto px-margin">
<div className="text-center mb-space-2xl">
<span className="font-code-xs text-code-xs text-secondary font-medium tracking-widest uppercase mb-space-xs block">
          06 // Documentation &amp; Clarity
        </span>
<h2 className="font-headline-xl text-headline-xl text-primary tracking-tight">
          Frequently Asked Questions
        </h2>
</div>
{/* FAQ Accordions */}
<Faq />
</div>
</section>
{/* SECTION 8: CLOSING CTA */}
<section className="w-full bg-primary py-space-2xl text-on-primary">
<div className="max-w-[1280px] mx-auto px-margin text-center flex flex-col items-center space-y-space-lg">
<div className="max-w-2xl space-y-space-sm">
<h2 className="font-headline-xl text-headline-xl text-on-primary tracking-tight">
          See conservation commitments take shape.
        </h2>
<p className="font-body-lg text-body-lg text-on-primary-container">
          Explore how clear agreements can bring funding, people, and accountability together.
        </p>
</div>
<div className="pt-space-xs">
<Link className="inline-flex items-center justify-center px-space-2xl py-3.5 rounded-lg bg-surface text-primary font-label-md text-label-md hover:bg-surface-container transition-all shadow-md" href="/app">
          Launch app →
        </Link>
</div>
</div>
</section>

    </>
  );
}
