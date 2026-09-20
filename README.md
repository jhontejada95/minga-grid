# MINGA Grid

**Get paid for the electricity you don't use when the grid is about to fall.**

An agent watches Colombia's real wholesale electricity price. When an hour costs far more than an
ordinary one, it calls an event. Smart meters sign what they measured. The agent verifies the
reduction against a baseline and settles it on HSK Chain in stablecoin — in one transaction that
pays the site and the protocol together, or pays neither.

**No human signature takes part in the payment.**

| | |
|---|---|
| Live app | https://minga-grid.vercel.app |
| Programme on HSK | [`0x315DE6Ff…809cEC`](https://testnet-explorer.hskchain.net/address/0x315DE6Ff84680012cf81bFd9C256032996809cEC) |
| A settled event | [`0xb075e576…c0e7ff9b`](https://testnet-explorer.hskchain.net/tx/0xb075e57669939aa557abe8393fea6b2cf1cae0a71c2715270ff1c2fac0e7ff9b) — 67.50 mUSD to the site, 7.50 to the protocol |
| Network | HSK Chain testnet, chain id 133 |
| Tracks | Colombia Hackathon · AI x Ethereum & Agent Economy · HSK Chain |

---

## The problem

Every evening between six and nine, Colombian wholesale electricity costs well over half again
what it costs the rest of the day. Thermal plants set the price when hydro runs short of the peak.
These are live figures from XM, the system operator, converted at the official exchange rate:

| | |
|---|---|
| Evening window (18:00–21:00) | **≈ USD 0.31 / kWh** |
| That day's 24-hour average | ≈ USD 0.19 / kWh |
| Peak as a multiple of the day | **1.5–1.8×** |

The fastest capacity any grid has is demand that steps aside for three hours. Demand response is
an established, roughly eight-billion-dollar market in the countries that have it. It has not
reached Latin America for an unglamorous reason: **metering, verifying, contracting and paying ten
thousand small participants costs more than the electricity they would save.** The economics fail
on paperwork, not on physics.

That paperwork is what an agent, a stablecoin and a contract delete. It is the only reason a
blockchain belongs anywhere near this problem — not transparency.

## How it works

```
XM spot price ──► agent senses ──► event window declared
                                          │
  smart meter ──► signs every 15-min reading (EIP-712)
                                          │
                  agent verifies each signature, rebuilds the baseline,
                  subtracts, compares against the committed reduction
                                          │
                  ┌───────────────────────┴───────────────────────┐
             commitment met                                 commitment missed
                  │                                               │
        device + agent sign                              agent refuses to sign
                  │                                               │
        release() pays 90 / 10                            nothing happens
```

1. **The agent senses.** It reads XM's published hourly spot price and reservoir level and compares
   the evening window against that same day's average. Dispatch is arithmetic — 1.4× elevated,
   1.8× critical — not a model's opinion.
2. **The meters sign.** Every fifteen-minute reading is signed with the device's own key. The
   contract verifies a meter signature exactly as it verifies a human wallet, because
   `SignatureChecker` does not care which is which.
3. **The agent verifies.** It rebuilds the counterfactual from five ordinary evenings, subtracts
   what was measured, and compares the result against the reduction the site committed to.
4. **The contract pays.** If and only if the commitment was met, escrow releases: ninety per cent
   to the site, ten per cent to the protocol treasury, atomically.

**The agent can say no, and that is tested.** If the readings fail verification, or the site missed
its commitment, it refuses to sign and no payment is possible. An agent that only ever approves is
a rubber stamp, and a rubber stamp is not worth putting on a chain.

**The relayer is not an authoriser.** `release()` requires two signatures: the meter's and the
agent's. Whoever broadcasts the transaction pays gas — their signature is nowhere in it. The demo
lets you connect your own wallet and relay a settlement you did not authorise, which is the point.

## How it makes money

| Flow | Who pays | How much |
|---|---|---|
| **Take rate on every settlement** | the offtaker | **10%, as an on-chain split inside `release()`** |
| Per-dispatch verification fee | the offtaker, machine to machine | per event called |
| Capacity subscription | the offtaker | USD per MW-month committed |

The first one is not an invoice anyone has to chase. It is a split inside the settlement: the same
transaction that pays the site pays the protocol, or neither happens. You can watch it execute in
the transaction linked at the top of this file.

The offtaker pays fifteen cents for a kilowatt-hour it would otherwise buy at thirty-one during the
evening window. That is roughly half price for the same relief, and far cheaper than a blackout.
The arbitrage is the business; the contract is only what makes it cheap enough to run at scale.

## What is live on HSK testnet

| Contract | Address |
|---|---|
| `AgreementFactoryRegistry` | [`0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1`](https://testnet-explorer.hskchain.net/address/0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1) |
| `MockUSD` (mUSD, 6 decimals) | [`0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1`](https://testnet-explorer.hskchain.net/address/0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1) |
| Demo programme | [`0x315DE6Ff84680012cf81bFd9C256032996809cEC`](https://testnet-explorer.hskchain.net/address/0x315DE6Ff84680012cf81bFd9C256032996809cEC) |

Programme terms: a cold-storage warehouse commits to shedding **500 kWh** in the 18:00–21:00
window; the offtaker pays **USD 0.15 per avoided kWh**, so **75 mUSD per event window**, split
**90 / 10**. Budget 150 mUSD over two windows. Window 1 is settled — the agent verified 608.9 kWh
avoided against a 1,038.1 kWh baseline. Window 2 is open, which is what the live demo settles.

The device and agent identities are derived from public seed strings rather than stored, so the
demo is reproducible on any machine. **They sign data and hold no funds.**

## Architecture

```
apps/
  frontend/     Next.js 14 — the landing page, the app, and four route handlers that ARE the
                backend for the demand-response flow. No database, no indexer, no funded key.
  backend/      Fastify + SQLite — SIWE, evidence storage, an HSK event indexer and a bounded
                MPP research client. Used locally and by the inherited flow; the demo does not
                need it, which is why the whole thing deploys to Vercel as one project.
packages/
  contracts/    Solidity (Hardhat, OpenZeppelin). Escrow, EIP-712 dual-signature release,
                immutable payees and splits, timeout refunds.
  shared/       The agent itself, the meter simulator, the live XM feed, EIP-712 schemas,
                canonical JSON and ABIs — one implementation shared by all of the above.
```

**Data sources, both public and unauthenticated:**

- [XM](https://www.xm.com.co) — hourly spot price (`PrecBolsNaci`) and useful reservoir volume
  (`PorcVoluUtilDiar`), via `https://servapibi.xm.com.co`.
- Superfinanciera via [datos.gov.co](https://www.datos.gov.co) — the official COP/USD rate, so
  prices are shown in dollars without inventing a conversion.

XM publishes a couple of days behind, so the app always shows which day a figure belongs to. If a
source cannot be reached, the app falls back to a fixture **that says on the page that it is a
fixture**.

## Running it

Requires Node ≥ 22.13 (the backend uses `node:sqlite`). Foundry is optional and only needed for the
contract-integration tests.

```bash
npm install
cp .env.example .env          # every public value already has a working default

npm run contracts:test        # 56 tests
npm run backend:test          # 125 tests (anvil-dependent ones skip without Foundry)

npm run build --workspace=@minga/shared
npm run dev --workspace=@minga/frontend        # http://localhost:3000
```

Create and settle a programme on HSK testnet yourself (spends testnet gas; needs a funded key in
`DEPLOYER_PRIVATE_KEY`):

```bash
node apps/backend/scripts/grid-hsk.mjs --dry-run   # balances and identities, sends nothing
node apps/backend/scripts/grid-hsk.mjs --fresh     # create, fund and settle a new programme
```

## Tests

| Suite | Result |
|---|---|
| Contracts (Hardhat) | **56 / 56** |
| Backend + agent (`node --test`) | **125 / 125** |

The agent tests run against the real contracts on a local anvil chain, not against mocks. They
cover the happy path with its 90/10 split, a missed commitment, a tampered reading, a replayed
nonce, a reading outside the declared window, a calm grid that produces no event, and the case that
matters most: **a single machine signature cannot move funds.**

## What is real, and what is not

Being precise about this is part of the work, not a disclaimer bolted on.

**Real.** The contracts, deployed and holding escrow. The EIP-712 signature scheme and its
verification. The agent's arithmetic and its refusal logic. The grid price and reservoir level,
read live from XM. The payment and the 90/10 split, which you can open on Blockscout.

**Not real.** The meter readings are synthetic, generated deterministically and signed with a
development key. There is no physical meter connected — and with one, the baseline would still need
five days of history before it existed. A signature proves **non-repudiation**: that this device
said this. It does **not** prove the meter was not physically tampered with. That requires a secure
element, and it is the next step rather than a solved problem. `docs/hardware-roadmap.md` lays out
that path in full — measuring, attesting and transporting, and the one cryptographic trap (a curve
mismatch between the cheap secure element and Ethereum) that has sunk other projects.

The baseline is a convention agreed in the programme terms, not a measurement of a world that did
not happen. No utility has signed anything. The token has no monetary value.

`docs/limitations.md` carries the full list, including the contract's constraints and what has not
been audited.

## Roadmap

The contract knows nothing about electricity. It knows that an offtaker funded a budget, a device
signed a measurement, and an agent verified it against an agreed baseline. That is why the next
steps are mostly about sensors and counterparties rather than about Solidity:

- Secure-element device identity, so a signature says something about the physical meter — see
  `docs/hardware-roadmap.md` for the concrete plan and the curve-mismatch trap it warns against.
- Aggregation: one programme over thousands of sites instead of one, which is how demand response
  actually reaches households.
- A pilot with a single large consumer that already has interval metering, before going near a
  regulator.
- Other verticals on the same machinery: cubic metres of water not drawn during a drought,
  verified fire-risk mitigation around a páramo.

## License

MIT. See [LICENSE](LICENSE).

---

*A **minga** is what people in the Andes call it when a whole community drops what it is doing and
works together for one common goal. Ten thousand households turning things off at the same hour so
the grid does not fall is a minga. This makes it pay.*

*Built for the EAG hackathon in Cali, Colombia.*
