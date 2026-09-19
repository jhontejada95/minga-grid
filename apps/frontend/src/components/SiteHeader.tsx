"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BANNER_TEXT, chain } from "@/lib/config";
import { useHealth } from "@/data/queries";
import { Icon } from "./ui";
import { NetworkGate, WalletControl } from "./WalletControl";

function Banner({ className }: { className?: string }) {
  return (
    <div className={clsx("w-full px-margin-mobile py-space-xs text-center font-code-xs text-code-xs tracking-wide md:px-margin", className)}>
      <span>{BANNER_TEXT}</span>
    </div>
  );
}

function FreshnessChip() {
  const health = useHealth();
  const idx = health.data?.indexer;
  let text: string;
  let dot = "bg-primary";
  if (health.isError) {
    text = "Backend unreachable";
    dot = "bg-error";
  } else if (!idx) {
    text = "Connecting…";
    dot = "bg-outline";
  } else if (idx.syncing) {
    text = `Syncing… last indexed block ${idx.lastIndexedBlock.toLocaleString("en-US")}`;
    dot = "bg-tertiary-fixed-dim";
  } else {
    text = `Indexed up to block ${idx.lastIndexedBlock.toLocaleString("en-US")}`;
  }
  return (
    <div className="hidden items-center gap-space-sm whitespace-nowrap rounded-full bg-surface-container-low px-space-md py-space-xs font-code-xs text-code-xs text-on-surface-variant 2xl:flex">
      <span className="flex items-center gap-space-xs">
        <span className={clsx("h-2 w-2 rounded-full", dot, !health.isError && "animate-pulse")} />
        <span className="font-medium text-primary">{chain.name} (Chain ID {chain.id})</span>
      </span>
      <span className="text-outline-variant">·</span>
      <span>{text}</span>
    </div>
  );
}

const LANDING_LINKS = [
  ["Why MINGA", "#why-minga"],
  ["How it works", "#how-it-works"],
  ["Who it's for", "#who-its-for"],
  ["FAQ", "#faq"],
] as const;

export function SiteHeader({ variant }: { variant: "landing" | "app" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (variant === "landing") {
    return (
      <header className="fixed top-0 z-50 w-full bg-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <Banner className="bg-surface-container-high text-on-surface-variant" />
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-space-lg px-margin-mobile md:px-margin">
          <Link href="/" className="flex items-center gap-space-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/minga-logo.png" alt="" className="h-8 w-auto object-contain" />
            <span className="font-headline-sm text-headline-sm tracking-tight text-primary">MINGA Nature</span>
          </Link>
          <nav className="hidden items-center gap-space-xl lg:flex" aria-label="Sections">
            {LANDING_LINKS.map(([label, href]) => (
              <a key={href} href={href} className="font-body-md text-body-md text-on-surface-variant transition-colors hover:text-on-surface">{label}</a>
            ))}
          </nav>
          <Link href="/app" className="inline-flex items-center justify-center rounded-lg bg-primary-container px-space-lg py-space-sm font-label-md text-label-md text-on-primary shadow-[0_2px_6px_-1px_rgba(20,61,43,0.04)] transition-colors hover:bg-primary">
            Launch app →
          </Link>
        </div>
      </header>
    );
  }

  const links = [
    { href: "/app", label: "Agreements", active: pathname === "/app" || pathname.startsWith("/app/agreements/0x") },
    { href: "/app/agreements/new", label: "Create Agreement", active: pathname === "/app/agreements/new" },
  ];
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col">
      <Banner className="bg-primary-container font-medium text-on-primary-container" />
      <header className="w-full bg-surface-container-lowest/95 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-space-md px-margin-mobile md:px-margin">
          <div className="flex items-center gap-space-lg">
            <Link href="/" className="flex items-center gap-space-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/minga-logo.png" alt="" className="h-8 w-auto object-contain" />
              <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">MINGA Nature</span>
            </Link>
            <nav className="hidden items-center gap-space-xs lg:flex" aria-label="Main">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={l.active ? "page" : undefined}
                  className={clsx("whitespace-nowrap rounded-lg px-space-md py-space-sm font-label-md text-label-md transition-colors", l.active ? "bg-surface-container text-primary" : "text-on-surface-variant hover:text-on-surface")}
                >
                  {l.label}
                </Link>
              ))}
              <Link href="/#how-it-works" className="whitespace-nowrap rounded-lg px-space-md py-space-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface">
                How it works
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-space-sm md:gap-space-md">
            <FreshnessChip />
            <WalletControl />
            <button type="button" className="lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-[#e2e8f0] px-margin-mobile py-space-sm lg:hidden" aria-label="Main (mobile)">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-space-sm font-label-md text-label-md text-primary">{l.label}</Link>
            ))}
          </nav>
        )}
      </header>
      <NetworkGate />
    </div>
  );
}
