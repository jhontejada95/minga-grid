import Link from "next/link";

/**
 * The explanatory page. Static on purpose: it must open instantly for someone following a link
 * who never saw the pitch, and it must work even if the chain or the RPC is having a bad day.
 * No client-side data fetching here — every figure below is a fact we can stand behind without
 * a network round trip, which is also why nothing on this page is allowed to claim it is "live".
 */
const VOID = "#090D14";
const SURFACE = "rgba(15,23,42,0.8)";
const SURFACE_SOLID = "#0F172A";
const BORDER = "#1E293B";
const BORDER_STRONG = "#334155";
const INK = "#F8FAFC";
const INK_2 = "#94A3B8";
const MUTED = "#64748B";
const EMERALD = "#10B981";
const BLUE = "#3B82F6";
const AMBER = "#F59E0B";
const CYAN = "#06B6D4";

const SANS = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet-explorer.hskchain.net";
const AGREEMENT = process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS ?? "0x315DE6Ff84680012cf81bFd9C256032996809cEC";
const REPO = "https://github.com/jhontejada95/minga-grid";

function glow(color: string) {
  return `0 0 20px -4px ${color}40`;
}

function Card({ children, accent, className = "", style }: { children: React.ReactNode; accent?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg border p-4 backdrop-blur-md ${className}`}
      style={{ background: SURFACE, borderColor: accent ?? BORDER, boxShadow: accent ? glow(accent) : undefined, ...style }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color, fontFamily: MONO }}>
      {children}
    </p>
  );
}

function Section({ id, eyebrow, eyebrowColor, title, children }: { id?: string; eyebrow?: string; eyebrowColor?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t py-14" style={{ borderColor: BORDER }}>
      {eyebrow && (
        <div className="mb-2">
          <Eyebrow color={eyebrowColor}>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2 className="max-w-[720px] text-[26px] font-bold tracking-tight md:text-[32px]" style={{ color: INK, fontFamily: SANS }}>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Prose({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <p className="max-w-[720px] text-[15px] leading-relaxed" style={{ color: strong ? INK : INK_2 }}>
      {children}
    </p>
  );
}

function Figure({ icon, value, label, foot, accent }: { icon: React.ReactNode; value: string; label: string; foot?: string; accent?: string }) {
  return (
    <Card accent={accent}>
      <svg viewBox="0 0 24 24" width={20} height={20} style={{ color: accent ?? MUTED }}>{icon}</svg>
      <div className="mt-3 text-[28px] font-bold tabular-nums" style={{ color: accent ?? INK, fontFamily: MONO }}>{value}</div>
      <div className="mt-1 text-[13px]" style={{ color: INK_2 }}>{label}</div>
      {foot && (
        <div className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED, fontFamily: MONO }}>{foot}</div>
      )}
    </Card>
  );
}

// Minimal monoline icon set, 24x24, stroke = currentColor. Kept as plain path data so every
// icon is a couple of lines instead of another dependency.
const ICONS = {
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />,
  coin: (
    <>
      <circle cx={12} cy={12} r={8.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 7.5v9M9.5 9.8c0-1 1-1.8 2.5-1.8s2.5.7 2.5 1.7-1 1.4-2.5 1.8-2.5.9-2.5 1.9 1 1.7 2.5 1.7 2.5-.7 2.5-1.7" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  globe: (
    <>
      <circle cx={12} cy={12} r={8.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.3 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.3-3.8-8.5S9.5 5.8 12 3.5Z" fill="none" stroke="currentColor" strokeWidth={1.4} />
    </>
  ),
  pulse: <path d="M2 12h4l2-6 4 12 2-6h4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />,
  pen: (
    <>
      <path d="M4 20l1-4.2L15.8 5a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.2 19 4 20Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M13.5 6.8l3.7 3.7" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3.5 19 6v6c0 4.5-3 7.4-7 8.5-4-1.1-7-4-7-8.5V6l7-2.5Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  release: (
    <>
      <rect x={4} y={4} width={16} height={16} rx={3} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />,
  x: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />,
  arrow: <path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />,
  warning: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M12 10v4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={12} cy={17.3} r={0.9} fill="currentColor" />
    </>
  ),
  tag: (
    <>
      <path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5c0 .4.15.78.44 1.06l9.5 9.5a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-9.5-9.5a1.5 1.5 0 0 0-1.06-.44Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={8} cy={8} r={1.3} fill="currentColor" />
    </>
  ),
  measure: <path d="M2 12h4l2-6 4 12 2-6h4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />,
  key: (
    <>
      <rect x={5} y={11} width={14} height={9} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <circle cx={12} cy={15.5} r={1.4} fill="currentColor" />
    </>
  ),
  radio: (
    <>
      <path d="M4 9.5a12 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M7 13a7.5 7.5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M10 16.5a3 3 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={12} cy={19.5} r={1.2} fill="currentColor" />
    </>
  ),
};

const HARDWARE_STAGES: Array<{ n: string; title: string; body: string; accent?: string; icon: React.ReactNode }> = [
  { n: "01", title: "Measure", body: "CT clamp + metering IC", icon: ICONS.measure },
  { n: "02", title: "Attest", body: "Secure element, secp256k1 signature", accent: EMERALD, icon: ICONS.key },
  { n: "03", title: "Transport", body: "WiFi / LTE-M / LoRaWAN", icon: ICONS.radio },
  { n: "04", title: "Settle", body: "Agent verifies, contract pays — unchanged", accent: BLUE, icon: ICONS.release },
];

const STEPS: Array<{ title: string; body: string; foot: string; icon: React.ReactNode; accent?: string }> = [
  {
    title: "The agent senses",
    body: "It reads XM's published hourly price and reservoir level, compares the evening window against that day's own average, and decides by arithmetic whether the hour is worth an event.",
    foot: "Source: XM REST API",
    icon: ICONS.pulse,
  },
  {
    title: "The meters sign",
    body: "Every fifteen-minute reading is signed by the device's own key. The contract verifies a meter signature exactly as it verifies a human wallet.",
    foot: "Auth: EIP-712, device key",
    icon: ICONS.pen,
  },
  {
    title: "The agent verifies",
    body: "It rebuilds the counterfactual from five ordinary evenings, subtracts what was measured, and compares the result against the reduction the site committed to.",
    foot: "Compute: baseline delta",
    icon: ICONS.shieldCheck,
  },
  {
    title: "The contract pays",
    body: "If and only if the commitment was met, the escrow releases. Ninety per cent to the site, ten per cent to the protocol — atomically, in one transaction.",
    foot: "Execution: release() on HSK",
    icon: ICONS.release,
    accent: EMERALD,
  },
];

const NAV = [
  ["The problem", "#problem"],
  ["How it works", "#how-it-works"],
  ["The business", "#business"],
  ["Hardware", "#next-step"],
  ["Honesty", "#honest"],
];

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{ borderColor: `${color}33`, background: `${color}14`, color, fontFamily: MONO }}
    >
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen" style={{ background: VOID, color: INK, fontFamily: BODY }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full opacity-[0.07] blur-[120px]" style={{ background: EMERALD }} />
        <div className="absolute top-1/3 -right-40 h-[480px] w-[480px] rounded-full opacity-[0.07] blur-[120px]" style={{ background: BLUE }} />
      </div>

      <div className="relative mx-auto w-full max-w-[1120px] px-5 md:px-8">

        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between border-b px-5 py-4 backdrop-blur-md md:-mx-8 md:px-8" style={{ borderColor: BORDER, background: `${VOID}cc` }}>
          <span className="text-[15px] font-bold tracking-tight" style={{ fontFamily: SANS }}>
            MINGA <span style={{ color: EMERALD }}>Grid</span>
          </span>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="text-[13px] transition-colors hover:text-white" style={{ color: INK_2 }}>
                {label}
              </a>
            ))}
          </nav>
          <Link
            href="/app"
            className="rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-shadow hover:shadow-lg"
            style={{ background: EMERALD, color: "#032018", boxShadow: glow(EMERALD) }}
          >
            Open the app
          </Link>
        </header>

        <section className="flex flex-col items-start py-16 md:py-24">
          <div className="mb-6">
            <Pill color={EMERALD}>HSK Chain testnet · live protocol, not live data</Pill>
          </div>
          <h1 className="max-w-[820px] text-[36px] font-extrabold leading-[1.08] tracking-tight md:text-[54px]" style={{ fontFamily: SANS }}>
            Get paid for the electricity you don’t use when{" "}
            <span style={{ background: `linear-gradient(90deg, ${EMERALD}, ${BLUE})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              the grid is about to fall
            </span>
            .
          </h1>
          <p className="mt-6 max-w-[640px] text-[17px] leading-relaxed" style={{ color: INK_2 }}>
            An agent watches Colombia’s real wholesale price, smart meters sign what they measured, and a contract on
            HSK settles the verified reduction in stablecoin — within minutes, to anyone with a meter. No invoice, no
            reconciliation, and no human signature anywhere in the payment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold transition-shadow hover:shadow-lg"
              style={{ background: EMERALD, color: "#032018", boxShadow: glow(EMERALD) }}
            >
              Open the app
              <svg viewBox="0 0 24 24" width={15} height={15}>{ICONS.arrow}</svg>
            </Link>
            {AGREEMENT && (
              <a
                href={`${EXPLORER}/address/${AGREEMENT}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border px-5 py-2.5 text-[14px] transition-colors hover:border-[#10B981]"
                style={{ borderColor: BORDER_STRONG, color: INK_2, fontFamily: MONO }}
              >
                {AGREEMENT.slice(0, 6)}…{AGREEMENT.slice(-4)} · View on HSK
              </a>
            )}
          </div>

          <Card className="mt-10 grid w-full grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4" style={{ boxShadow: "0 12px 32px -8px rgba(0,0,0,0.65)" }}>
            {[
              ["Dispatch target", "XM SIN Central"],
              ["Settlement window", "18:00–21:00 COT"],
              ["Proof type", "Dual-signature baseline"],
              ["Network", "HSK Testnet"],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: MUTED, fontFamily: MONO }}>{label}</div>
                <div className="mt-1 text-[13px] font-semibold" style={{ color: INK }}>{value}</div>
              </div>
            ))}
          </Card>
        </section>

        <Section id="problem" eyebrow="The problem" title="The cheapest megawatt is the one nobody uses. Nobody gets paid for it.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure icon={ICONS.bolt} value="1.5–1.8×" label="evening peak vs the day's own average" foot="Peak risk" accent={AMBER} />
            <Figure icon={ICONS.coin} value="$0.31" label="USD per kWh, 18:00–21:00 window" foot="18:00–21:00" accent={BLUE} />
            <Figure icon={ICONS.globe} value="$8.4B" label="demand-response market that skipped the region" foot="LatAm deficit" />
          </div>
          <Prose>
            Every evening between six and nine, Colombian wholesale electricity costs well over half again what it
            costs the rest of the day — thermal plants set the price when hydro runs short of the peak. The figures
            above are read live from XM, the system operator, and converted at the official exchange rate. In a dry
            year the gap widens sharply, which is the risk the country has been managing all through 2026.
          </Prose>
          <Prose>
            The fastest capacity any grid has is demand that simply steps aside for those three hours. There is no way
            for a household or a small business here to be paid for stepping aside.
          </Prose>
        </Section>

        <Section eyebrow="Why it doesn’t exist here" title="Settlement costs more than the energy saved.">
          <Prose>
            Demand response is an established, roughly eight-billion-dollar market in the places that have it. It has
            not reached Latin America for an unglamorous reason: metering, verifying, contracting and paying ten
            thousand small participants costs more than the electricity they would save. The economics fail on
            paperwork, not on physics.
          </Prose>
          <Prose strong>
            That paperwork is exactly what an agent, a stablecoin and a contract delete. This is the whole thesis, and
            it is the only reason a blockchain belongs anywhere near this problem.
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card accent="#f43f5e66">
              <div className="text-[13px] font-semibold" style={{ color: "#fb7185" }}>Legacy utility bilaterals</div>
              <ul className="mt-3 flex flex-col gap-2 text-[13px]" style={{ color: INK_2 }}>
                {["Wet signatures & notary contracts", "Manual reconciliation, paid on invoice", "Verification costs more than the energy it confirms"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg viewBox="0 0 24 24" width={14} height={14} className="mt-0.5 shrink-0" style={{ color: "#fb7185" }}>{ICONS.x}</svg>
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
            <Card accent={EMERALD}>
              <div className="text-[13px] font-semibold" style={{ color: EMERALD }}>MINGA autonomous settlement</div>
              <ul className="mt-3 flex flex-col gap-2 text-[13px]" style={{ color: INK_2 }}>
                {["Every reading carries the device key's signature", "Counterfactual baseline rebuilt by the agent", "Settlement and protocol fee release in one transaction"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg viewBox="0 0 24 24" width={14} height={14} className="mt-0.5 shrink-0" style={{ color: EMERALD }}>{ICONS.check}</svg>
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        <Section id="how-it-works" eyebrow="How it works" title="Four steps, no human in the loop.">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card accent={step.accent} className="h-full">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ borderColor: BORDER_STRONG, color: step.accent ?? INK_2, fontFamily: MONO }}>
                      Step {i + 1}
                    </span>
                    <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: step.accent ?? MUTED }}>{step.icon}</svg>
                  </div>
                  <div className="mt-3 text-[15px] font-semibold" style={{ color: INK }}>{step.title}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>{step.body}</p>
                  <div className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED, fontFamily: MONO }}>{step.foot}</div>
                </Card>
              </li>
            ))}
          </ol>
          <Prose>
            The contract requires two signatures. One belongs to the meter, one to the agent. Neither can release funds
            alone, neither can change the amount, and a person who broadcasts the transaction is paying gas rather than
            approving a payment — their signature is not in it.
          </Prose>
        </Section>

        <Section id="business" eyebrow="The business" title="Ten per cent of every settlement, enforced inside the contract.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure icon={ICONS.coin} value="10%" label="protocol fee, split on chain" accent={EMERALD} />
            <Figure icon={ICONS.coin} value="90%" label="to the site that reduced" accent={BLUE} />
            <Figure icon={ICONS.coin} value="$0.15" label="paid per avoided kWh" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <Eyebrow color={EMERALD}>Atomic split</Eyebrow>
              <Prose>
                The fee is not an invoice anyone has to chase. It is a split inside <code>release()</code>: the same
                transaction that pays the site pays the protocol, or neither happens. On top of that sit a per-dispatch
                fee the agent charges the offtaker machine to machine, and a subscription for committed capacity.
              </Prose>
            </Card>
            <Card>
              <Eyebrow color={BLUE}>Arbitrage mechanics</Eyebrow>
              <Prose>
                The offtaker pays fifteen cents for a kilowatt-hour it would otherwise buy at thirty-one during the
                evening window. That is roughly half price for the same relief, and it beats a blackout by
                considerably more. The arbitrage is the business; the contract is only what makes it cheap enough to
                run at scale.
              </Prose>
            </Card>
          </div>
        </Section>

        <Section eyebrow="Beyond electricity" title="The contract knows nothing about energy.">
          <Prose>
            It knows that an offtaker funded a budget, a device signed a measurement, and an agent verified that
            measurement against an agreed baseline. Change the sensor and the same machinery pays for cubic metres of
            water not drawn during a drought, or for verified fire-risk mitigation around a páramo. Electricity is the
            first vertical because it is the one on fire this month.
          </Prose>
          <div className="flex flex-wrap gap-2">
            {["Phase 1 · Power grid", "Phase 2 · Drought reservoirs", "Phase 3 · Páramo wildfire risk"].map((t, i) => (
              <Pill key={t} color={i === 0 ? EMERALD : MUTED}>{t}</Pill>
            ))}
          </div>
        </Section>

        <Section id="honest" eyebrow="What this is not" eyebrowColor={AMBER} title="The honest part.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card accent={CYAN}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: CYAN }}>{ICONS.check}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: CYAN }}>The grid price is real</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                The agent reads XM’s published hourly spot price and reservoir level, and converts with the official
                exchange rate. XM publishes a couple of days behind, so the app always shows which day the figure
                belongs to. If those sources cannot be reached it falls back to a fixture that says so on the page, in
                those words.
              </p>
            </Card>
            <Card accent={AMBER}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: AMBER }}>{ICONS.warning}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: AMBER }}>Meter readings are synthetic</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                They are synthetic and signed by a development key, because there is no meter connected — and even
                with one, the baseline needs five days of history before it exists. A signature proves
                non-repudiation, that this device said this, and nothing more. It does not prove the meter was not
                physically tampered with; that needs a secure element, and it is the next step rather than a solved
                problem.
              </p>
            </Card>
            <Card accent={EMERALD}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: EMERALD }}>{ICONS.tag}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: EMERALD }}>The baseline is a convention</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                It is agreed in the programme terms, not a measurement of a world that did not happen. No utility has
                signed anything. What is real is the contract, the verification, and the payment you can watch
                execute.
              </p>
            </Card>
          </div>
        </Section>

        <Section id="next-step" eyebrow="The next step" title="From a simulated meter to a real one.">
          <Prose>
            A real device has to solve three separate problems, and solving one does not solve the others: measure the
            watt-hours, attest that this specific device said so, and transport the statement out of the building.
            Everything downstream — verification, the baseline, the payout — is already built and does not change.
          </Prose>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HARDWARE_STAGES.map((stage) => (
              <li key={stage.n}>
                <Card accent={stage.accent} className="h-full">
                  <svg viewBox="0 0 24 24" width={20} height={20} style={{ color: stage.accent ?? MUTED }}>{stage.icon}</svg>
                  <div className="mt-2 text-[11px]" style={{ color: MUTED, fontFamily: MONO }}>{stage.n}</div>
                  <div className="mt-0.5 text-[15px] font-semibold" style={{ color: stage.accent ?? INK }}>{stage.title}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>{stage.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <Prose>
            The middle card is the hard one. The cheap secure element everyone reaches for first signs a different
            elliptic curve than Ethereum uses — a mismatch that has sunk other projects after the hardware was already
            ordered. <code>docs/hardware-roadmap.md</code> in the repository writes out the trap and the three honest
            ways around it, plus a costed, phased pilot starting at one cooperating site for about USD 150 in
            hardware.
          </Prose>
          <p>
            <a
              href={`${REPO}/blob/main/docs/hardware-roadmap.md`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[14px] font-semibold"
              style={{ color: BLUE }}
            >
              Read the full hardware roadmap
              <svg viewBox="0 0 24 24" width={14} height={14}>{ICONS.arrow}</svg>
            </a>
          </p>
        </Section>

        <footer className="border-t py-10" style={{ borderColor: BORDER }}>
          <p className="max-w-[720px] text-[13px] leading-relaxed" style={{ color: INK_2 }}>
            A <em>minga</em> is what people in the Andes call it when a whole community drops what it is doing and works
            together for one common goal. Ten thousand households turning things off at the same hour so the grid does
            not fall is a minga. We just made it pay.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]" style={{ color: MUTED, fontFamily: MONO }}>
            <span>Built for the EAG hackathon in Cali, Colombia · HSK Chain testnet</span>
            <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">GitHub</a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">Architecture</a>
            <a href={`${EXPLORER}/address/${AGREEMENT}`} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">HSK Explorer</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
