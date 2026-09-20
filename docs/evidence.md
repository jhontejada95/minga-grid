# On-chain evidence

Every claim in the pitch, as a transaction anyone can open. Nothing here is a screenshot or a
description — these are receipts on HSK Chain testnet.

**Programme:** [`0x315DE6Ff84680012cf81bFd9C256032996809cEC`](https://testnet-explorer.hskchain.net/address/0x315DE6Ff84680012cf81bFd9C256032996809cEC)

## The programme being created, funded and settled

| Step | Result | Transaction |
|---|---|---|
| The offtaker creates the programme through the factory | success · block 33343339 | [`0x3b3af7c0…`](https://testnet-explorer.hskchain.net/tx/0x3b3af7c0120eb8502d300a1e36cc366521783771f3739bb2eb24244d022873bb) |
| **The meter** accepts the terms, from its own account | success · block 33343341 | [`0x9d727702…`](https://testnet-explorer.hskchain.net/tx/0x9d727702b7535f7543ee3d7635f980009ed0c43062ffb7286b137e12afdf6df5) |
| **The agent** accepts the terms, from its own account | success · block 33343343 | [`0xc8f64bf7…`](https://testnet-explorer.hskchain.net/tx/0xc8f64bf7072703538a5020e5642e916df415a41971df78195c79203622ad3a89) |
| The offtaker approves the budget | success · block 33343345 | [`0x79bbd5b9…`](https://testnet-explorer.hskchain.net/tx/0x79bbd5b99fd478e17830812b08e481bb6351f9d7cd429830c40600963b5d4f66) |
| The offtaker funds 150 mUSD into escrow | success · block 33343347 | [`0x9269d910…`](https://testnet-explorer.hskchain.net/tx/0x9269d910cd5fbbf408607ba5df2f72441eca8247bb25946ea4a7c13f483e7491) |
| **The settlement.** 67.50 mUSD to the site, 7.50 to the protocol, in one transaction | success · block 33343351 | [`0xb075e576…`](https://testnet-explorer.hskchain.net/tx/0xb075e57669939aa557abe8393fea6b2cf1cae0a71c2715270ff1c2fac0e7ff9b) |

Note the second and third rows: the two parties that accepted the terms are **machines**, signing
from their own accounts. No person accepted anything.

Open the settlement and look at the token transfers. Two of them, one transaction, 90/10. That
split is the business model, and it is enforced by the contract rather than invoiced afterwards.

## The attacks, and what the contract did about them

These were sent to the live contract with a forced gas limit, so they would be mined and fail
publicly rather than being quietly refused by the node. Each one is a permanent record of a
security property, not a claim about one.

| Attack | Contract's answer | Transaction |
|---|---|---|
| **Replay** — settle window 1 a second time | `Milestone out of sequence` | [`0xdae6a711…`](https://testnet-explorer.hskchain.net/tx/0xdae6a71146ab3260dab6fe719ca140bf9eed05b6d73a3857e50441906dc09463) |
| **One signature** — the agent signs twice, the meter never does | `Invalid community signature` | [`0x38c56d7c…`](https://testnet-explorer.hskchain.net/tx/0x38c56d7c7a347bdb010e02cf9f32223c382d8e2419fab1481f615a57dd99b728) |
| **Inflated amount** — both machines sign, but for double the payout | `Amount mismatch` | [`0x86979016…`](https://testnet-explorer.hskchain.net/tx/0x8697901632da7cd10f924ed9f029b07523e87a3718c1c9bb41f893053d25f639) |
| **Impostor** — a stranger's key signs in place of the meter | `Invalid community signature` | [`0xc75e0e15…`](https://testnet-explorer.hskchain.net/tx/0xc75e0e151d0a95194ecd061dd4c6e2cdaaef3e512cbff4a42fe51b43fa80a11a) |

After all four, the contract state was unchanged: window 1 still settled once, window 2 still open,
escrow untouched.

Reproduce it yourself — it sends nothing that can succeed:

```bash
node scripts/adversarial.mjs
```

## What this proves, and what it does not

**Proves:** a window cannot be paid twice. One machine signature cannot move funds. Neither signer
can change the amount, because the amount is fixed in the terms the contract holds. A key that is
not the registered one is simply not accepted.

**Does not prove:** that the meter measured honestly. That is a physical question, not a
cryptographic one, and `docs/limitations.md` and `docs/hardware-roadmap.md` say so plainly.
