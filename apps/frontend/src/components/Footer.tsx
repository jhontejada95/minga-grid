import Link from "next/link";
import { EXPLORER_URL, FACTORY_ADDRESS } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-space-2xl w-full bg-surface-container-low pb-space-xl pt-space-2xl">
      <div className="mx-auto max-w-[1280px] px-margin-mobile md:px-margin">
        <div className="flex flex-col items-start justify-between gap-space-xl pb-space-xl md:flex-row">
          <div className="max-w-sm space-y-space-xs">
            <span className="font-headline-sm text-headline-sm text-primary">MINGA Nature</span>
            <p className="font-body-md text-body-md text-on-surface-variant">Clear agreements for conservation funding.</p>
            <p className="font-code-xs text-code-xs text-outline">Built on HSK Chain · Testnet demonstration</p>
          </div>
          <div className="flex flex-wrap gap-space-2xl">
            <div className="flex flex-col space-y-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface">Explore</span>
              <Link href="/#how-it-works" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">How it works</Link>
              <Link href="/#who-its-for" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">Who it&apos;s for</Link>
              <Link href="/#faq" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">FAQ</Link>
            </div>
            <div className="flex flex-col space-y-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface">Protocol verification</span>
              <a
                href={FACTORY_ADDRESS ? `${EXPLORER_URL}/address/${FACTORY_ADDRESS}` : EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-code-sm text-code-sm text-secondary hover:text-on-secondary-container"
              >
                HSK Factory Contract ↗
              </a>
              <Link href="/app" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">Agreements registry</Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-space-md pt-space-lg font-body-sm text-body-sm text-outline sm:flex-row">
          <p>HSK testnet · No monetary value · Demonstration project and evidence. Receipts are not certified credits, offsets or land rights.</p>
        </div>
      </div>
    </footer>
  );
}
