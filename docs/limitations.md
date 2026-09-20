# MINGA Grid — limitations

Being precise about this is part of the work. If a judge finds one of these before we say it, it
reads as concealment rather than scope.

## 1. The data

- **The meter readings are synthetic.** They are generated deterministically and signed with a
  development key. No physical meter is connected. Even with one, the baseline needs five days of
  history before it exists, which is why the demo ships with generated data rather than a wait.
- **A signature proves non-repudiation, not physical truth.** It proves this device said this. It
  does not prove the meter was not tampered with, that the site exists, or that the energy was
  really avoided. That requires a secure element or a TEE, and it is the next step.
- **The baseline is a convention**, not a measurement of a world that did not happen. "Mean of five
  ordinary evenings" is agreed in the programme terms. Real programmes adjust for weather and
  occupancy; this one does not.
- **The grid price is real but published late.** XM publishes a couple of days behind, so "live"
  honestly means "the most recent day XM has published", and the app always shows that date. If XM
  or the exchange-rate source cannot be reached, the app falls back to a fixture **whose label says
  it is a fixture**, printed on the page.
- **No utility has signed anything.** There is no pilot, no counterparty and no regulatory review.

## 2. The contracts

- **Two milestones, fixed amounts.** `release()` pays `milestoneAmounts[id]` exactly. That is why
  the programme is modelled as a capacity contract — a commitment to shed X kWh for a fixed payment
  — rather than a variable per-kWh settlement. This matches how real demand-response contracts
  work, but it is a constraint, not a free choice.
- **Single payer, no pooling.** One offtaker funds the whole budget before a deadline.
- **Immutable payees and splits.** Set at creation and never changeable. A lost device or agent key
  makes a programme unsettleable; the budget returns to the payer after `executionDeadline` via
  `refundRemaining()`.
- **Blocklisting tokens can stall a payout.** If the token blocks a payee, `release()` reverts
  atomically. Funds are not lost — the refund path still works.
- **`MockUSD.mint` is public.** Intentional for a testnet demo. It must never be reused for a token
  with value.
- **Tokens sent directly to an agreement are unrecoverable.** No admin path, by design.
- **Explorer verification is partial** for the factory and for every agreement it creates: the HSK
  explorer gateway rejects uploads above ~100 KB and the OpenZeppelin dependency closure exceeds
  that. The executable bytecode is unchanged; the metadata hash differs. Only `MockUSD` is a full
  match.
- **No audit, no static analysis.** Slither and Mythril have not been run. The Hardhat suite
  includes mutation checks on reentrancy, the deadline boundary and the fee-on-transfer guard, but
  that is not an audit.

## 3. The agent

- **Dispatch is a threshold, not a forecast.** It compares the event window against the same day's
  average. It does not predict, does not optimise across sites, and does not know what the site can
  actually shed.
- **The agent holds one of two keys.** It cannot pay anyone alone, cannot change an amount and
  cannot redirect a payment. It can only refuse, or contribute a signature.
- **Model-assisted review is implemented but unused in this flow.** A language model may propose
  what to research; it can never authorise a payment or overturn a failed verification.
- **Paid external research (MPP) has never executed a live payment.** The client, the endpoint
  allowlist and the deterministic spending caps are implemented and tested against a local 402
  server, but no real purchase has been made — that needs a funded operating account.

## 4. The application

- **The frontend has no automated tests.** The inherited suite covered code that the pivot retired;
  it now lives in `apps/frontend/legacy/` and does not compile. The current app was verified by
  driving it in a real browser at desktop and phone widths, running both scenarios, with no console
  errors. Do not quote the old numbers.
- **EOA wallets only.** Smart-contract and passkey wallets are not supported.
- **The backend's storage model is a single instance.** SQLite plus a local directory, with
  in-memory rate limiting. It is not suitable for ephemeral serverless storage — which is why the
  demand-response flow deliberately depends on none of it.
- **The HSK public RPC lags**, so every write is followed by a read that waits for the chain to
  agree before the next step depends on it. Without that, transactions fail for reasons that look
  like bugs and are not.

## 5. What this is not

A payment receipt here is not a certified credit, an offset, a claim on land, equity, or a promise
of return. The token has no monetary value. This is settlement infrastructure for verified demand
reduction, demonstrated on a testnet.
