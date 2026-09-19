# MINGA Nature — Limitations and Trade-offs (Hackathon MVP)

This document explicitly outlines the scope, known constraints, and trade-offs of the MINGA Nature MVP.

## 1. Trust and Cryptographic Boundaries
- **Wallet Address != Ecological Truth**: Holding a private key or signing an approval does not guarantee biological success, species resurgence, or community land tenure. It solely guarantees non-repudiation and cryptographic consent from the designated keyholder.
- **AI and MPP are Advisory**: The AI review assistant and Parallel MPP web research client do not certify carbon credits, biodiversity metrics, or ecological permanence. They assist human reviewers in spotting inconsistencies and checking public references.

## 2. Smart Contract Constraints
- **Sequential 2-Milestone Structure**: The MVP contract is tailored for a two-milestone lifecycle (e.g., initial baseline / monitoring report). Multi-year variable milestone graphs are future work.
- **Fixed Single Payer**: Escrow is funded in full by a single payer before the funding deadline. Pooled crowdfunding or multi-funder syndicates are out of scope.
- **Standalone Contracts (No Upgradability / Proxies)**: Contracts are deployed as independent, immutable instances from the factory to minimize attack surfaces and eliminate admin-key rug pulls.
- **Fixed Token & Decimals**: Built for 6-decimal tokens (`MockUSD` on HSK Testnet).
- **Blocklisting tokens can stall a payout**: if the agreement token blocks a payee address (as some regulated stablecoins can), `release()` reverts atomically and the milestone cannot be paid. Funds are not lost: after `executionDeadline` anyone can call `refundRemaining()` to return the unspent budget to the payer. Payees cannot be changed after creation.
- **`MockUSD.mint` is public**: anyone can mint the demo token. This is intentional for testnet and must never be reused for a token with value.
- **Accidental surplus is unrecoverable**: tokens sent directly to an agreement do not enlarge the budget or the refund and cannot be withdrawn (no admin path by design).
- **Explorer verification is partial for the factory**: the HSK testnet explorer gateway returns HTTP 413 for uploads above ~100 KB, so `hardhat verify` cannot verify contracts that pull in OpenZeppelin's `SignatureChecker` (the factory and every agreement). We submit comment-stripped sources via `scripts/verify-blockscout.cjs`; the executable bytecode is unchanged but Blockscout reports a partial match. Only `MockUSD` has a full match.
- **No static analysis yet**: the contracts are covered by the Hardhat suite (including mutation checks on reentrancy, the deadline boundary and the fee-on-transfer guard) but Slither/Mythril have not been run and there has been no external audit.

## 3. Storage and Backend Scope
- **Storage Model**: Uses local SQLite with write-ahead logging and local filesystem storage for evidence files. In production, this would transition to PostgreSQL + distributed object storage (e.g., IPFS, Filecoin, or S3).
- **SIWE Verification**: EOA wallets (MetaMask, Rabby, Frame) are fully supported. Smart contract wallets (ERC-4337 / safe) authentication via 1271 is documented in architecture for future production deployment.

## 4. MPP Research Constraints
- **Allowlisted Endpoints Only**: Only Parallel MPP gateway endpoints (`/api/search`, `/api/extract`) are enabled. Autonomous dynamic agent discovery and recurring subscriptions are disallowed.
- **Hard Budget Caps**: Enforced deterministically by the backend policy ($0.05 USD / 5 calls / 3 extract URLs per review by default), against the live 402 offer and before any payment credential is created, regardless of any model output. Verified with the real `mppx` client against a local 402 server (the offer is read and declined without signing).
- **Live payment not exercised**: no automated test pays the real Parallel gateway (that needs a funded operating account). Only the `tempo` method and pathUSD are accepted; anything else is refused.
- **Model-assisted review (Groq) is optional and advisory**: with `AI_PROVIDER=groq` and a key, a model reads the stored text of the manifest's files and adds observations. It has no tools; its JSON is validated; a quoted excerpt is kept only if it appears literally in the file (otherwise the observation is labeled uncertain); links are removed and certification or payment language is discarded. It never changes the deterministic status, agreement state, recipients or budgets. **The text of the evidence files is sent to the provider**, which must be acceptable for the data involved. A failed call falls back to document checks and is retried at most three times. Tested against a fake provider; not yet exercised with a real Groq key.

## 5. Backend Operations
- **Single instance**: SQLite (`node:sqlite`) plus a local evidence directory. Rate limiting is in memory per process. Do not run several instances against the same files or on ephemeral storage.
- **`node:sqlite` is marked experimental by Node** (a warning may print). It requires Node >= 22.13.
- **Signatures are validated when submitted**; role, nonce, deadline and funding state are re-read from the chain whenever approvals are read. A later change of a smart-contract wallet's validity would not be noticed until release simulation.
- **Reorgs**: the indexer keeps a small window of block hashes and rolls back on a mismatch. An agreement created in an orphaned block that already has stored evidence is kept (and logged) rather than deleted.
- **EOA wallets only** for sign-in in this demo (signature checks use viem, which also handles ERC-1271, but smart-wallet login is not tested).
