# MINGA Nature — 3-Minute Hackathon Demo Script

> **Demo Project**: Pacific Mangrove — Demo  
> **Budget**: 100 mUSD (MockUSD) across 2 sequential milestones (50 mUSD each)  
> **Split**: 80% Community Execution (40 mUSD) / 20% Monitoring (10 mUSD)  
> **Network**: HSK Chain Testnet (Chain ID 133)

---

### Timing Breakdown

#### 0:00 – 0:25 · Introduction & Agreement Context
- Open the MINGA Nature UI. Point out the visible banner:  
  *“HSK testnet · No monetary value · Demonstration project and evidence.”*
- Present the core thesis: Connecting conservation disbursements directly to immutable agreements, verifiable evidence, and dual authorization.
- Introduce the participants: Funder, Community Representative, and Independent Reviewer.

#### 0:25 – 0:55 · Reusable Factory Protocol
- Navigate to the **Create Agreement** screen.
- Demonstrate deploying a second agreement (**Agreement B**) directly from the UI to prove the protocol is a multi-tenant factory on HSK, not a one-off hardcoded contract.
- Switch back to **Agreement A (Pacific Mangrove — Demo)**, showing it has already been accepted and funded with genuine on-chain HSK transactions. Open the HSK explorer links for the funding receipt.

#### 0:55 – 1:25 · Evidence Manifest & AI / MPP Research
- Open Milestone 1. Show the **Incomplete Evidence Manifest** (flags missing required field reports).
- Switch to the **Complete Evidence Manifest**.
- Trigger the AI Review summary: shows deterministic checklist matches and model-assisted highlights.
- If MPP is active: Show the bounded Parallel Search/Extract micro-transaction ($0.01) verifying public coastal data, displaying receipt metadata.
- Emphasize: *“MPP paid for research from an operational account; it did NOT touch conservation escrow.”*

#### 1:25 – 2:05 · Dual Human Authorization & Simulation
- Show the Reviewer's cryptographic signature in place.
- Attempt to call `release()` with only one signature: show the frontend pre-flight simulation catching the rejection.
- Connect the Community wallet and sign the identical EIP-712 typed data payload.
- Both signatures are now valid and aligned on the exact manifest hash and current nonce.

#### 2:05 – 2:35 · On-chain Settlement & Immutable Splits
- Submit the `release()` transaction on HSK Chain.
- Display the confirmed payment receipt:
  - 40 mUSD automatically paid to Community Execution account.
  - 10 mUSD automatically paid to Monitoring account.
  - 50 mUSD remaining in escrow for Milestone 2.
- Attempt a duplicate release: show transaction reverts immediately.

#### 2:35 – 3:00 · Transparency & Wrap-up
- Show the confirmed event activity log and receipt details.
- Conclude with MINGA's mission: infrastructure that eliminates ambiguity and guarantees money reaches the people stewarding the land.
