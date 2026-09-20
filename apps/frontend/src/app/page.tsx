"use client";

import Link from "next/link";
import { PROVENANCE_ORDER, getProvenance, type ProvenanceKind, type Provenance } from "@minga/shared";
import { useT } from "@/lib/lang";
import { LanguageToggle } from "@/components/grid/LanguageToggle";

const VOID = "#090D14";
const SURFACE = "rgba(15,23,42,0.8)";
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

const TONE_COLOR: Record<Provenance["tone"], string> = {
  telemetry: CYAN,
  verified: EMERALD,
  neutral: MUTED,
  caution: AMBER,
};

function glow(color: string) {
  return `0 0 20px -4px ${color}40`;
}

function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const { lang } = useT();
  const p = getProvenance(kind, lang);
  const color = TONE_COLOR[p.tone];
  const className = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]";
  const style: React.CSSProperties = { borderColor: `${color}33`, background: `${color}1a`, color, fontFamily: MONO };
  const content = (
    <>
      {kind === "live" && <span className="h-[5px] w-[5px] shrink-0 animate-pulse rounded-full" style={{ background: color }} />}
      {p.label}
      {p.source && <svg viewBox="0 0 24 24" width={9} height={9}>{ICONS.arrow}</svg>}
    </>
  );
  if (p.source) {
    return (
      <a
        href={p.source.url}
        target="_blank"
        rel="noreferrer"
        title={`${p.explanation} Source: ${p.source.name}.`}
        className={`${className} transition-colors hover:brightness-125`}
        style={style}
      >
        {content}
      </a>
    );
  }
  return (
    <span title={p.explanation} className={className} style={style}>
      {content}
    </span>
  );
}

function Card({ children, accent, className = "", style }: { children: React.ReactNode; accent?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg border p-4 backdrop-blur-lg ${className}`}
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

function Figure({ icon, value, label, provenance, accent }: { icon: React.ReactNode; value: string; label: string; provenance: ProvenanceKind; accent?: string }) {
  return (
    <Card accent={accent}>
      <div className="flex items-start justify-between gap-2">
        <svg viewBox="0 0 24 24" width={20} height={20} style={{ color: accent ?? MUTED }}>{icon}</svg>
        <ProvenanceBadge kind={provenance} />
      </div>
      <div className="mt-3 text-[28px] font-bold tabular-nums" style={{ color: accent ?? INK, fontFamily: MONO }}>{value}</div>
      <div className="mt-1 text-[13px]" style={{ color: INK_2 }}>{label}</div>
    </Card>
  );
}

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
  const { t, lang } = useT();

  const NAV = [
    [t("nav.problem"), "#problem"],
    [t("nav.howItWorks"), "#how-it-works"],
    [t("nav.business"), "#business"],
    [t("nav.hardware"), "#next-step"],
    [t("nav.honesty"), "#honest"],
  ];

  const HARDWARE_STAGES = [
    { n: "01", title: t("hard.stage1"), body: t("hard.stage1Body"), icon: ICONS.measure },
    { n: "02", title: t("hard.stage2"), body: t("hard.stage2Body"), accent: EMERALD, icon: ICONS.key },
    { n: "03", title: t("hard.stage3"), body: t("hard.stage3Body"), icon: ICONS.radio },
    { n: "04", title: t("hard.stage4"), body: t("hard.stage4Body"), accent: BLUE, icon: ICONS.release },
  ];

  const STEPS = [
    {
      title: t("how.step1Title"),
      body: t("how.step1Body"),
      foot: t("how.step1Foot"),
      icon: ICONS.pulse,
    },
    {
      title: t("how.step2Title"),
      body: t("how.step2Body"),
      foot: t("how.step2Foot"),
      icon: ICONS.pen,
    },
    {
      title: t("how.step3Title"),
      body: t("how.step3Body"),
      foot: t("how.step3Foot"),
      icon: ICONS.shieldCheck,
    },
    {
      title: t("how.step4Title"),
      body: t("how.step4Body"),
      foot: t("how.step4Foot"),
      icon: ICONS.release,
      accent: EMERALD,
    },
  ];

  return (
    <main className="min-h-screen" style={{ background: VOID, color: INK, fontFamily: BODY }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full opacity-[0.07] blur-[120px]" style={{ background: EMERALD }} />
        <div className="absolute top-1/3 -right-40 h-[480px] w-[480px] rounded-full opacity-[0.07] blur-[120px]" style={{ background: BLUE }} />
      </div>

      <div className="relative mx-auto w-full max-w-[1120px] px-5 md:px-8">

        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between border-b px-5 py-4 backdrop-blur-lg md:-mx-8 md:px-8" style={{ borderColor: BORDER, background: `${VOID}cc` }}>
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
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link
              href="/app"
              className="rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-shadow hover:shadow-lg"
              style={{ background: EMERALD, color: "#032018", boxShadow: glow(EMERALD) }}
            >
              {t("nav.openApp")}
            </Link>
          </div>
        </header>

        <section className="flex flex-col items-start py-16 md:py-24">
          <div className="mb-6">
            <Pill color={EMERALD}>{t("hero.pill")}</Pill>
          </div>
          <h1 className="max-w-[820px] text-[36px] font-extrabold leading-[1.08] tracking-tight md:text-[54px]" style={{ fontFamily: SANS }}>
            {t("hero.title1")}
            <span style={{ background: `linear-gradient(90deg, ${EMERALD}, ${BLUE})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {t("hero.titleHighlight")}
            </span>
            .
          </h1>
          <p className="mt-6 max-w-[640px] text-[17px] leading-relaxed" style={{ color: INK_2 }}>
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold transition-shadow hover:shadow-lg"
              style={{ background: EMERALD, color: "#032018", boxShadow: glow(EMERALD) }}
            >
              {t("hero.openApp")}
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
                {AGREEMENT.slice(0, 6)}…{AGREEMENT.slice(-4)} · {t("hero.viewOnHsk")}
              </a>
            )}
          </div>

          <Card className="mt-10 grid w-full grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4" style={{ boxShadow: "0 12px 32px -8px rgba(0,0,0,0.65)" }}>
            {[
              [t("hero.dispatchTarget"), "XM SIN Central"],
              [t("hero.settlementWindow"), "18:00–21:00 COT"],
              [t("hero.proofType"), t("hero.proofValue")],
              [t("hero.network"), "HSK Testnet"],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: MUTED, fontFamily: MONO }}>{label}</div>
                <div className="mt-1 text-[13px] font-semibold" style={{ color: INK }}>{value}</div>
              </div>
            ))}
          </Card>
        </section>

        <Section id="problem" eyebrow={t("problem.eyebrow")} title={t("problem.title")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure icon={ICONS.bolt} value="1.5–1.8×" label={t("problem.stat1")} provenance="live" accent={AMBER} />
            <Figure icon={ICONS.coin} value="$0.31" label={t("problem.stat2")} provenance="live" accent={BLUE} />
            <Figure icon={ICONS.globe} value="$8.4B" label={t("problem.stat3")} provenance="cited" />
          </div>
          <Prose>
            {t("problem.prose1")}
          </Prose>
          <Prose>
            {t("problem.prose2")}
          </Prose>
        </Section>

        <Section eyebrow={t("latam.eyebrow")} title={t("latam.title")}>
          <Prose>
            {t("latam.prose1")}
          </Prose>
          <Prose strong>
            {t("latam.proseStrong")}
          </Prose>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card accent="#f43f5e66">
              <div className="text-[13px] font-semibold" style={{ color: "#fb7185" }}>{t("latam.cardLegacyTitle")}</div>
              <ul className="mt-3 flex flex-col gap-2 text-[13px]" style={{ color: INK_2 }}>
                {[t("latam.legacy1"), t("latam.legacy2"), t("latam.legacy3")].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg viewBox="0 0 24 24" width={14} height={14} className="mt-0.5 shrink-0" style={{ color: "#fb7185" }}>{ICONS.x}</svg>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
            <Card accent={EMERALD}>
              <div className="text-[13px] font-semibold" style={{ color: EMERALD }}>{t("latam.cardMingaTitle")}</div>
              <ul className="mt-3 flex flex-col gap-2 text-[13px]" style={{ color: INK_2 }}>
                {[t("latam.minga1"), t("latam.minga2"), t("latam.minga3")].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg viewBox="0 0 24 24" width={14} height={14} className="mt-0.5 shrink-0" style={{ color: EMERALD }}>{ICONS.check}</svg>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        <Section id="how-it-works" eyebrow={t("how.eyebrow")} title={t("how.title")}>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card accent={step.accent} className="h-full">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ borderColor: BORDER_STRONG, color: step.accent ?? INK_2, fontFamily: MONO }}>
                      {t("how.step")} {i + 1}
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
            {t("how.prose")}
          </Prose>
        </Section>

        <Section id="business" eyebrow={t("biz.eyebrow")} title={t("biz.title")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure icon={ICONS.coin} value="10%" label={t("biz.stat1")} provenance="terms" accent={EMERALD} />
            <Figure icon={ICONS.coin} value="90%" label={t("biz.stat2")} provenance="terms" accent={BLUE} />
            <Figure icon={ICONS.coin} value="$0.15" label={t("biz.stat3")} provenance="terms" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <Eyebrow color={EMERALD}>{t("biz.cardSplitTitle")}</Eyebrow>
              <Prose>
                {t("biz.cardSplitProse")}
              </Prose>
            </Card>
            <Card>
              <Eyebrow color={BLUE}>{t("biz.cardArbTitle")}</Eyebrow>
              <Prose>
                {t("biz.cardArbProse")}
              </Prose>
            </Card>
          </div>
        </Section>

        <Section eyebrow={t("beyond.eyebrow")} title={t("beyond.title")}>
          <Prose>
            {t("beyond.prose")}
          </Prose>
          <div className="flex flex-wrap gap-2">
            {[t("beyond.pill1"), t("beyond.pill2"), t("beyond.pill3")].map((pillText, i) => (
              <Pill key={pillText} color={i === 0 ? EMERALD : MUTED}>{pillText}</Pill>
            ))}
          </div>
        </Section>

        <Section id="honest" eyebrow={t("honest.eyebrow")} eyebrowColor={AMBER} title={t("honest.title")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card accent={CYAN}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: CYAN }}>{ICONS.check}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: CYAN }}>{t("honest.card1Title")}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                {t("honest.card1Prose")}
              </p>
            </Card>
            <Card accent={AMBER}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: AMBER }}>{ICONS.warning}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: AMBER }}>{t("honest.card2Title")}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                {t("honest.card2Prose")}
              </p>
            </Card>
            <Card accent={EMERALD}>
              <svg viewBox="0 0 24 24" width={18} height={18} style={{ color: EMERALD }}>{ICONS.tag}</svg>
              <div className="mt-2 text-[14px] font-semibold" style={{ color: EMERALD }}>{t("honest.card3Title")}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: INK_2 }}>
                {t("honest.card3Prose")}
              </p>
            </Card>
          </div>
        </Section>

        <Section id="next-step" eyebrow={t("hard.eyebrow")} title={t("hard.title")}>
          <Prose>
            {t("hard.prose1")}
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
            {t("hard.prose2")}
          </Prose>
          <p>
            <a
              href={`${REPO}/blob/main/docs/hardware-roadmap.md`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[14px] font-semibold"
              style={{ color: BLUE }}
            >
              {t("hard.link")}
              <svg viewBox="0 0 24 24" width={14} height={14}>{ICONS.arrow}</svg>
            </a>
          </p>
        </Section>

        <footer className="border-t py-10" style={{ borderColor: BORDER }}>
          <p className="max-w-[720px] text-[13px] leading-relaxed" style={{ color: INK_2 }}>
            {t("footer.mingaMeaning")}
          </p>

          <div className="mt-6">
            <Eyebrow>{t("footer.legendTitle")}</Eyebrow>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {PROVENANCE_ORDER.map((kind) => {
                const p = getProvenance(kind, lang);
                return (
                  <div key={kind} className="flex items-start gap-3">
                    <dt><ProvenanceBadge kind={kind} /></dt>
                    <dd className="text-[12px] leading-relaxed" style={{ color: INK_2 }}>{p.explanation}</dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]" style={{ color: MUTED, fontFamily: MONO }}>
            <span>{t("footer.colombia")}</span>
            <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">GitHub</a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">Architecture</a>
            <a href={`${EXPLORER}/address/${AGREEMENT}`} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">HSK Explorer</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
