# Local stack (no real network, no real funds)

A self-contained copy of the whole product for development and for the automated UI run. It uses a throwaway `anvil` chain (chain ID 31337), the **real** `MockUSD` and `AgreementFactoryRegistry` contracts and the **real** backend with its indexer and a real clock. It listens on ports that do not collide with the HSK testnet setup: anvil `8545`, API `4100`, frontend `3100`.

The anvil development accounts and mnemonic are public. Nothing here can touch HSK testnet or any real key.

## Requirements

- Foundry's `anvil` (found automatically in `~/.foundry/bin`, or set `ANVIL_BIN`).
- Microsoft Edge (used by the UI run through `playwright-core`; no browser download).
- Node 24 and one `npm install` at the repo root.

## Start it

```bash
# 1. chain + contracts + backend + two seeded agreements (A funded, B awaiting acceptance)
npm run local:stack --workspace=@minga/backend
#    writes .local-stack/stack.json and .local-stack/frontend.env, prints "LOCAL STACK READY"

# 2. build the frontend against it (separate build directory) and serve it on :3100
MINGA_ENV_FILE=.local-stack/frontend.env NEXT_DIST_DIR=.next-local npm run build --workspace=@minga/frontend
MINGA_ENV_FILE=.local-stack/frontend.env NEXT_DIST_DIR=.next-local npm exec --workspace=@minga/frontend -- next start -p 3100
```

On PowerShell set the two variables with `$env:MINGA_ENV_FILE = "..."; $env:NEXT_DIST_DIR = ".next-local"` first.

## Run the end-to-end UI check

```bash
npm run e2e:local --workspace=@minga/frontend
```

It drives a real browser through the whole story and prints one line per step:

1. connect a wallet (EIP-6963), create an agreement from the form (draft saved, factory transaction, redirect);
2. the terms are read back from the contract and the terms hash is recomputed before anyone accepts;
3. community representative and reviewer accept on-chain;
4. the funder approves the exact budget and funds the escrow;
5. the community representative uploads two files (SHA-256 compared with the browser's own digest) and creates an evidence version;
6. a non-participant sees the private sections locked;
7. the reviewer runs the review, the browser re-verifies the approval payload, and both signers sign the EIP-712 approval;
8. the funder releases the payment: 40 mUSD to the community and 10 mUSD to monitoring, with the on-chain receipt;
9. the activity tab lists the contract events.

Screenshots of each step are written to `.local-stack/shots/` (or `E2E_SHOTS`).

## What this does and does not prove

- It exercises the real contracts, the real API, the real indexer and the real UI code, including the signatures and transactions.
- The wallet is simulated: an EIP-1193 provider injected into the page signs with anvil's accounts. It says nothing about MetaMask, Rabby, Coinbase Wallet or WalletConnect behaviour, and nothing about HSK testnet (block times, gas, explorer, RPC limits).
- The model review runs without an AI key here, so only the document checks are exercised.

## Stop it

Stop the `local:stack` process (Ctrl+C) and the `next start` process. The database and evidence files live under `.local-stack/`, which is git-ignored and recreated on every start.
