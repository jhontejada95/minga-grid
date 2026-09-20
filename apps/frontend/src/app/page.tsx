import Link from "next/link";

/**
 * The explanatory page. Static on purpose: it must open instantly for someone following a link
 * who never saw the pitch, and it must work even if the chain or the RPC is having a bad day.
 */
const PLANE = "#0d0d0d";
const SURFACE = "#1a1a19";
const HAIRLINE = "#2c2c2a";
const INK = "#ffffff";
const INK_2 = "#c3c2b7";
const MUTED = "#898781";
const BLUE = "#3987e5";
const AQUA = "#199e70";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet-explorer.hskchain.net";
const AGREEMENT = process.env.NEXT_PUBLIC_GRID_AGREEMENT_ADDRESS ?? "0x315DE6Ff84680012cf81bFd9C256032996809cEC";

function Section({ eyebrow, title, children }: { eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t py-14" style={{ borderColor: HAIRLINE }}>
      {eyebrow && <p className="mb-2 text-[12px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>{eyebrow}</p>}
      <h2 className="text-[26px] font-semibold tracking-tight md:text-[32px]" style={{ color: INK }}>{title}</h2>
      <div className="mt-5 flex flex-col gap-4 text-[15px] leading-relaxed" style={{ color: INK_2 }}>{children}</div>
    </section>
  );
}

function Figure({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ background: SURFACE, borderColor: HAIRLINE }}>
      <div className="text-[28px] font-semibold tabular-nums" style={{ color: accent ?? INK }}>{value}</div>
      <div className="mt-1 text-[13px]" style={{ color: MUTED }}>{label}</div>
    </div>
  );
}

const HARDWARE_STAGES: Array<{ n: string; title: string; body: string; accent?: string; icon: React.ReactNode }> = [
  {
    n: "01",
    title: "Measure",
    body: "CT clamp + metering IC",
    icon: (
      <path d="M2 12h4l2-6 4 12 2-6h4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    n: "02",
    title: "Attest",
    body: "Secure element, secp256k1 signature",
    accent: AQUA,
    icon: (
      <>
        <rect x={5} y={11} width={14} height={9} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth={1.6} />
        <circle cx={12} cy={15.5} r={1.4} fill="currentColor" />
      </>
    ),
  },
  {
    n: "03",
    title: "Transport",
    body: "WiFi / LTE-M / LoRaWAN",
    icon: (
      <>
        <path d="M4 9.5a12 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M7 13a7.5 7.5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M10 16.5a3 3 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <circle cx={12} cy={19.5} r={1.2} fill="currentColor" />
      </>
    ),
  },
  {
    n: "04",
    title: "Settle",
    body: "Agent verifies, contract pays — unchanged",
    accent: BLUE,
    icon: (
      <>
        <rect x={4} y={4} width={16} height={16} rx={3} fill="none" stroke="currentColor" strokeWidth={1.6} />
        <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

const STEPS = [
  ["The agent senses", "It reads XM's published hourly price and reservoir level, compares the evening window against that day's own average, and decides by arithmetic whether the hour is worth an event."],
  ["The meters sign", "Every fifteen-minute reading is signed by the device's own key. The contract verifies a meter signature exactly as it verifies a human wallet."],
  ["The agent verifies", "It rebuilds the counterfactual from five ordinary evenings, subtracts what was measured, and compares the result against the reduction the site committed to."],
  ["The contract pays", "If and only if the commitment was met, the escrow releases. Ninety per cent to the site, ten per cent to the protocol — atomically, in one transaction."],
];

export default function Landing() {
  return (
    <main className="min-h-screen" style={{ background: PLANE, color: INK }}>
      <div className="mx-auto w-full max-w-[860px] px-5 md:px-8">

        <header className="flex items-center justify-between py-6">
          <span className="text-[15px] font-bold tracking-tight">MINGA Grid</span>
          <Link href="/app" className="rounded-md px-3.5 py-1.5 text-[13px] font-semibold" style={{ background: BLUE, color: "#04121f" }}>
            Open the app
          </Link>
        </header>

        <section className="py-14 md:py-20">
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight md:text-[52px]">
            Get paid for the electricity you don’t use when the grid is about to fall.
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed" style={{ color: INK_2 }}>
            An agent watches Colombia’s real wholesale price, smart meters sign what they measured, and a contract on
            HSK settles the verified reduction in stablecoin — within minutes, to anyone with a meter. No invoice, no
            reconciliation, and no human signature anywhere in the payment.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/app" className="rounded-md px-5 py-2.5 text-[14px] font-semibold" style={{ background: BLUE, color: "#04121f" }}>
              Open the app
            </Link>
            {AGREEMENT && (
              <a
                href={`${EXPLORER}/address/${AGREEMENT}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border px-5 py-2.5 text-[14px]"
                style={{ borderColor: HAIRLINE, color: INK_2 }}
              >
                View the contract on HSK
              </a>
            )}
          </div>
        </section>

        <Section eyebrow="The problem" title="The cheapest megawatt is the one nobody uses. Nobody gets paid for it.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure value="1.5–1.8×" label="evening peak vs the day's own average" />
            <Figure value="$0.31" label="USD per kWh, 18:00–21:00 window" accent={BLUE} />
            <Figure value="$8.4B" label="demand-response market that skipped the region" />
          </div>
          <p>
            Every evening between six and nine, Colombian wholesale electricity costs well over half again what it
            costs the rest of the day — thermal plants set the price when hydro runs short of the peak. The figures
            above are read live from XM, the system operator, and converted at the official exchange rate. In a dry
            year the gap widens sharply, which is the risk the country has been managing all through 2026.
          </p>
          <p>
            The fastest capacity any grid has is demand that simply steps aside for those three hours. There is no way
            for a household or a small business here to be paid for stepping aside.
          </p>
        </Section>

        <Section eyebrow="Why it doesn’t exist here" title="Settlement costs more than the energy saved.">
          <p>
            Demand response is an established, roughly eight-billion-dollar market in the places that have it. It has
            not reached Latin America for an unglamorous reason: metering, verifying, contracting and paying ten
            thousand small participants costs more than the electricity they would save. The economics fail on
            paperwork, not on physics.
          </p>
          <p style={{ color: INK }}>
            That paperwork is exactly what an agent, a stablecoin and a contract delete. This is the whole thesis, and
            it is the only reason a blockchain belongs anywhere near this problem.
          </p>
        </Section>

        <Section eyebrow="How it works" title="Four steps, no human in the loop.">
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-lg border p-4" style={{ background: SURFACE, borderColor: HAIRLINE }}>
                <div className="text-[12px]" style={{ color: MUTED }}>Step {i + 1}</div>
                <div className="mt-1 text-[15px] font-semibold" style={{ color: INK }}>{title}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: INK_2 }}>{body}</p>
              </li>
            ))}
          </ol>
          <p>
            The contract requires two signatures. One belongs to the meter, one to the agent. Neither can release funds
            alone, neither can change the amount, and a person who broadcasts the transaction is paying gas rather than
            approving a payment — their signature is not in it.
          </p>
        </Section>

        <Section eyebrow="The business" title="Ten per cent of every settlement, enforced inside the contract.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure value="10%" label="protocol fee, split on chain" accent={AQUA} />
            <Figure value="90%" label="to the site that reduced" />
            <Figure value="$0.15" label="paid per avoided kWh" accent={BLUE} />
          </div>
          <p>
            The fee is not an invoice anyone has to chase. It is a split inside <code>release()</code>: the same
            transaction that pays the site pays the protocol, or neither happens. On top of that sit a per-dispatch fee
            the agent charges the offtaker machine to machine, and a subscription for committed capacity.
          </p>
          <p>
            The offtaker pays fifteen cents for a kilowatt-hour it would otherwise buy at thirty-one during the evening
            window. That is roughly half price for the same relief, and it beats a blackout by considerably more. The
            arbitrage is the business; the contract is only what makes it cheap enough to run at scale.
          </p>
        </Section>

        <Section eyebrow="Beyond electricity" title="The contract knows nothing about energy.">
          <p>
            It knows that an offtaker funded a budget, a device signed a measurement, and an agent verified that
            measurement against an agreed baseline. Change the sensor and the same machinery pays for cubic metres of
            water not drawn during a drought, or for verified fire-risk mitigation around a páramo. Electricity is the
            first vertical because it is the one on fire this month.
          </p>
        </Section>

        <Section eyebrow="What this is not" title="The honest part.">
          <p>
            The grid price is real: the agent reads XM’s published hourly spot price and reservoir level, and converts
            with the official exchange rate. XM publishes a couple of days behind, so the app always shows which day
            the figure belongs to. If those sources cannot be reached it falls back to a fixture that says so on the
            page, in those words.
          </p>
          <p>
            The meter readings are not real. They are synthetic and signed by a development key, because there is no
            meter connected — and even with one, the baseline needs five days of history before it exists. A signature
            proves non-repudiation of a statement, that this device said this, and nothing more. It does not prove the
            meter was not physically tampered with; that needs a secure element, and it is the next step rather than a
            solved problem.
          </p>
          <p>
            The baseline is a convention agreed in the programme terms, not a measurement of a world that did not
            happen. No utility has signed anything. What is real is the contract, the verification, and the payment you
            can watch execute.
          </p>
        </Section>

        <Section eyebrow="The next step" title="From a simulated meter to a real one.">
          <p>
            A real device has to solve three separate problems, and solving one does not solve the others:
            measure the watt-hours, attest that this specific device said so, and transport the statement out
            of the building. Everything downstream — verification, the baseline, the payout — is already built
            and does not change.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HARDWARE_STAGES.map((stage) => (
              <li key={stage.n} className="rounded-lg border p-4" style={{ background: SURFACE, borderColor: stage.accent ?? HAIRLINE }}>
                <svg viewBox="0 0 24 24" width={22} height={22} style={{ color: stage.accent ?? MUTED }}>{stage.icon}</svg>
                <div className="mt-2 text-[12px]" style={{ color: MUTED }}>{stage.n}</div>
                <div className="mt-0.5 text-[15px] font-semibold" style={{ color: stage.accent ?? INK }}>{stage.title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>{stage.body}</p>
              </li>
            ))}
          </ol>
          <p>
            The middle box is the hard one. The cheap secure element everyone reaches for first signs a
            different elliptic curve than Ethereum uses — a mismatch that has sunk other projects after the
            hardware was already ordered. <code>docs/hardware-roadmap.md</code> in the repository writes out the
            trap and the three honest ways around it, plus a costed, phased pilot starting at one cooperating
            site for about USD 150 in hardware.
          </p>
          <p>
            <a
              href="https://github.com/jhontejada95/minga-grid/blob/main/docs/hardware-roadmap.md"
              target="_blank"
              rel="noreferrer"
              className="font-semibold"
              style={{ color: BLUE }}
            >
              Read the full hardware roadmap →
            </a>
          </p>
        </Section>

        <footer className="border-t py-10 text-[13px] leading-relaxed" style={{ borderColor: HAIRLINE, color: MUTED }}>
          <p>
            A <em>minga</em> is what people in the Andes call it when a whole community drops what it is doing and works
            together for one common goal. Ten thousand households turning things off at the same hour so the grid does
            not fall is a minga. We just made it pay.
          </p>
          <p className="mt-4">Built for the EAG hackathon in Cali, Colombia · HSK Chain testnet</p>
        </footer>
      </div>
    </main>
  );
}
