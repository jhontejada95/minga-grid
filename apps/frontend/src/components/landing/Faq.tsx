"use client";

import { useState } from "react";
import { Icon } from "../ui";

const ITEMS: [string, string][] = [
  ["What is MINGA Nature?", "A platform for coordinating conservation funding through clear agreements, reviewed milestones, and shared approval of payments."],
  ["Who approves a milestone payment?", "The community representative and independent reviewer named in the agreement must approve the same payment before it can be released."],
  ["Does MINGA issue biodiversity or carbon credits?", "No. This demo records conservation agreements and payments. Its receipts are not certified biodiversity credits, carbon offsets, or ownership rights over land."],
  ["Do I need a wallet to explore this page?", "No. This page is open to everyone. Enter the application when you want to explore agreements or use its participation features."],
  ["Is this a live financial product?", "No. The current experience is a demonstration on HSK testnet. Its sample project and evidence are fictional, and its demo funds have no monetary value."],
  ["What happens to unused funding?", "After the agreement's execution deadline, unspent funds can be returned to the original funder under the agreed rules. Funds already paid are not included in that refund."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-space-sm">
      {ITEMS.map(([q, a], i) => (
        <div key={q} className="overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
          <button
            type="button"
            aria-expanded={open === i}
            aria-controls={`faq-${i}`}
            className="flex w-full items-center justify-between gap-space-md p-space-lg text-left"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="font-headline-sm text-headline-sm text-primary">{q}</span>
            <Icon name="expand_more" className={`text-primary transition-transform duration-200 ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && (
            <div id={`faq-${i}`} className="px-space-lg pb-space-lg font-body-md text-body-md text-on-surface-variant">{a}</div>
          )}
        </div>
      ))}
    </div>
  );
}
