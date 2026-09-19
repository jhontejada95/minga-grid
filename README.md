# MINGA Nature

> **“MINGA Nature connects every conservation payment to an agreement, reviewed evidence, and the people responsible for the territory.”**

MINGA Nature is an open protocol on **HSK Chain** (Testnet Chain ID `133`) for creating, funding, and settling conservation agreements with milestone disbursements authorized by dual cryptographic signatures (EIP-712) from an independent reviewer and a community representative.

---

## 🏛️ Architecture Overview

The repository is structured as a TypeScript monorepo with three independently runnable components:

```text
apps/
  frontend/          # Next.js 14, React, viem/wagmi, custom responsive theme (Forest Green & Amber)
  backend/           # Fastify REST service, SQLite persistence, SIWE auth, AI review, MPP client, HSK indexer
packages/
  contracts/         # Solidity smart contracts (Hardhat, OpenZeppelin), test suite, deployment scripts
  shared/            # Shared TypeScript types, ABIs, EIP-712 schemas, chain configurations
fixtures/            # Synthetic demonstration packages (Pacific Mangrove Demo)
docs/                # Architecture diagrams, 3-minute pitch & demo script, limitations
```

### Trust & Separation Boundaries

- **HSK Smart Contracts**: The ultimate financial truth. Escrows funds, enforces required immutable parameters, validates dual signatures, and executes non-reversible splits directly to immutable payees.
- **Backend Service**: Manages off-chain evidence manifests, provides Sign-In with Ethereum (SIWE), indexes HSK logs, runs deterministic document checks (optionally enriched by a language model via Groq), and can execute bounded MPP external research. *Status:* implemented and tested against real contracts; the Groq path is tested against a fake provider only, and a live payment to the Parallel gateway has not been exercised (it needs a funded operating account).
- **Machine Payments Protocol (MPP)**: Strictly bounded operational micropayments (Parallel gateway: Search/Extract). MPP research is funded from a separate backend operational account and **never touches conservation escrow or participant wallets**.
- **Frontend App**: presentation and wallet-interaction client (Next.js 14, wagmi/viem). It holds no custody, sends real transactions from the user's own wallet after simulating them, reads the terms straight from the contract and recomputes the terms hash before anyone accepts, and re-verifies every approval payload in the browser before asking for an EIP-712 signature. *Status:* the whole flow (create, accept, fund, evidence, review, dual signature, release) was run through the real UI against a local chain with real contracts and the real backend (`docs/local-stack.md`), using a scripted wallet. It has **not** yet been run with real wallets (MetaMask, WalletConnect, ...) or on HSK testnet.

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Node.js >= 22.13 (the backend uses the built-in `node:sqlite`, so there are no native modules to compile; developed on Node 24)
- npm >= 10.x
- Optional, for the backend integration tests: [Foundry](https://getfoundry.sh) (`anvil`) on your PATH or `ANVIL_BIN` pointing to it. Without it those tests are skipped and say so.

### 1. Installation
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` in root and configure required variables:
```bash
cp .env.example .env
```

### 3. Compile & Test Smart Contracts
```bash
npm run contracts:compile
npm run contracts:test
```

### 4. Run Development Services
- **Backend Service (Port 4000)**. Reads the root `.env`; needs `FACTORY_ADDRESS` (see the deployment table below). Its API description is served at `GET /api/v1/openapi.json`.
  ```bash
  npm run build --workspace=@minga/shared   # once, and after changing packages/shared
  npm run backend:dev
  ```
- **Frontend Application (Port 3000)**. Set the `NEXT_PUBLIC_*` variables from `.env.example` (factory, mUSD, API base URL; `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is optional and enables mobile wallets):
  ```bash
  npm run frontend:dev
  ```
- **Local stack without real funds** (throwaway chain, real contracts, real backend, scripted end-to-end UI run): see [docs/local-stack.md](docs/local-stack.md).

### 5. Tests
```bash
npm run contracts:test      # 56 Hardhat tests
npm run backend:test        # 108 tests: config, canonical JSON, SIWE, evidence, review (deterministic + model), MPP policy, indexer, approvals
npm run backend:typecheck
npm run test --workspace=@minga/frontend   # 20 unit tests: amounts, roles, error translation, pre-signature approval checks
npm run e2e:local --workspace=@minga/frontend   # 14-step UI run on the local stack (needs the stack running, see docs/local-stack.md)
```
The backend integration tests deploy the real contracts to a local `anvil` chain and exercise the API end to end, including a real `release()` with the signatures the API produced.

---

## 📜 Smart Contracts (`packages/contracts`)

- `AgreementFactoryRegistry.sol`: Factory that creates and registers standalone `ConservationAgreement` instances.
- `ConservationAgreement.sol`: Escrow contract with 2 sequential milestones, immutable parameters (`termsHash`), EIP-712 approval validation, split disbursements to community & monitoring payees, and timeout refund protections.
- `MockUSD.sol`: Standard 6-decimal test ERC20 token for hackathon simulation on HSK Testnet.

### Deployed on HSK Testnet (chain ID 133) — 2026-09-19

Explorer: https://testnet-explorer.hskchain.net (Blockscout).

| Contract | Address | Deployment tx | Block | Source verification |
|---|---|---|---|---|
| `MockUSD` (mUSD, 6 decimals) | `0xEE2CDdBAaDB687E4932cB26295ADC5F5Ab3631E1` | `0xb6cad658…443412` | 33328729 | Full match |
| `AgreementFactoryRegistry` | `0x3caa9a17892A5e111d01640C1Ab2F8d6814857a1` | `0x90c521a6…c1888928` | 33328730 | **Partial match** (see below) |

Full hashes and the deployer address are in `packages/contracts/deployed-addresses.json`. The indexer starts at block `33328730`.

Post-deploy checks run against the live RPC: both contracts have code (factory 16 604 bytes, mUSD 1 918 bytes, identical to the compiled runtime), `agreementCount() == 0`, `mUSD.decimals() == 6`, both deployment receipts have `status 1`.

Verification note: the explorer's API gateway rejects uploads above ~100 KB with HTTP 413, and the factory's OpenZeppelin dependency closure is ~205 KB. `hardhat verify` therefore fails for the factory. `npm run verify:blockscout --workspace=@minga/contracts -- <address> <ContractName>` sends only the needed sources and, if still too large, strips comments and indentation. That does not change the executable bytecode but changes the metadata hash, so Blockscout reports a *partial* match. Agreements created by the factory need the same treatment.

---

## 🧪 Verification & Security Notes

- Banner in UI: **“HSK testnet · No monetary value · Demonstration project and evidence.”**
- Signatures cannot replay across instances, nonces, or chain IDs.
- Neither the AI assistant nor the MPP agent can authorize milestone payments or touch conservation funds.
