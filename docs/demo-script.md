# MINGA Grid — three-minute demo

**Live app:** https://minga-grid.vercel.app
**Programme:** https://testnet-explorer.hskchain.net/address/0x315DE6Ff84680012cf81bFd9C256032996809cEC

Have the app open on `/app`, a wallet with a little testnet HSK ready, and the explorer in a second
tab. Event window 2 is unsettled and reserved for this.

---

### 0:00 – 0:30 · The hook, without touching the keyboard

> "In Colombia, every evening between six and nine, wholesale electricity costs about sixty per cent
> more than it costs the rest of the day. That number is on screen and it comes from XM, the system
> operator, live.
>
> The cheapest megawatt on any grid is the one nobody uses. In the US and Europe you get paid for
> not using it — it's an eight-billion-dollar market. In Latin America it doesn't exist, because
> verifying and paying ten thousand small participants costs more than the electricity they save.
>
> A **minga** is when a whole community drops what it's doing and works together for one common
> goal. MINGA Grid pays people for exactly that."

### 0:30 – 1:00 · The site and the measurement

Point at the chart.

> "This is a cold-storage warehouse. The dashed line is what five ordinary evenings predicted it
> would use. The blue line is what it actually used during the event. The green band between them —
> six hundred and nine kilowatt-hours — is what gets paid for.
>
> Every fifteen-minute reading is signed by the meter's own key."

### 1:00 – 1:50 · The agent, live

Press **Run the settlement agent**. Let the six steps appear.

> "Sense: it read XM's price and compared the window against that day's own average. Verify: it
> recovered the signer of all twelve readings. Baseline, measure, decide — six hundred and nine
> against a five-hundred commitment. And it signed.
>
> Nobody clicked anything."

**Then switch to "Site missed its commitment" and run it again.** This is the beat that matters.

> "Same agent, different evening. The site barely reduced. It verifies the readings fine — they're
> honest, just disappointing — and then it refuses to sign. No transaction exists. An agent that
> only ever says yes isn't verifying anything."

### 1:50 – 2:30 · Settling on chain, from a wallet that authorises nothing

Switch back to the delivered scenario, run it, connect the wallet, press **Relay the settlement**.

> "I'm about to send this transaction, and my signature is not in it. The contract wants two
> signatures: the meter's and the agent's. I'm paying gas. That's all a relayer is."

Open the transaction on Blockscout.

### 2:30 – 3:00 · The business, executing

Point at the split in the receipt.

> "Sixty-seven fifty to the site. Seven fifty to the protocol treasury. That ten per cent is our
> revenue, and it isn't on a slide — it's a split inside the same transaction that paid the site.
> If they got paid, we got paid. No invoicing, no collections.
>
> The offtaker pays fifteen cents for a kilowatt-hour it would have bought at thirty-one. Half
> price for the same relief.
>
> And the contract knows nothing about electricity. It knows an offtaker funded a budget, a device
> signed a measurement, and an agent verified it. Swap the sensor and it's water in a drought."

### The honest line — say it before anyone asks

> "The grid price is real. The meter readings are synthetic and signed by a development key. The
> signature proves non-repudiation, not physical tamper resistance — that needs a secure element,
> and it's the next step."

---

## If something fails on stage

| Problem | What to do |
|---|---|
| XM unreachable | The app says "FIXTURE" on the page. Read it out: "that's the fallback labelling itself, which is the behaviour I want." |
| Wallet or network trouble | Run the agent without relaying. The six steps and the refusal are the demo; the transaction is the proof. |
| Site down entirely | Open the settled transaction on Blockscout — window 1 is already on chain — and talk through it. |
| Window 2 already settled | `node apps/backend/scripts/grid-hsk.mjs --fresh` creates a new programme in about a minute. |
