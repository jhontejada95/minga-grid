# From a simulated meter to a real one

The demo signs synthetic readings with a development key. This is the concrete path to signing
real measurements with a key that cannot be copied — written down because "we'll add IoT later" is
not an answer, and because there is one cryptographic trap on this road that sinks most attempts.

Three separate problems hide inside "real measurement". Solving one does not solve the others.

| Problem | What it means | What solves it |
|---|---|---|
| **Measure** | know how many watt-hours actually passed | a metering IC and a current transformer |
| **Attest** | prove *this specific device* said it, unforgeably | a private key the device cannot be made to reveal |
| **Transport** | get the statement out of the building | WiFi, cellular or LoRaWAN |

## 1. Measuring

| Option | What it is | Rough cost | When to use it |
|---|---|---|---|
| **Shelly Pro 3EM** | DIN-rail three-phase energy meter, local REST and MODBUS API, no cloud required | ~USD 120 | **Start here.** It is a finished, certified product with an open local API. One afternoon of work instead of a month of firmware. |
| **ESP32 + SCT-013 CT clamps + ATM90E32AS** | build your own three-phase meter | ~USD 35 | When you need the metering IC and the secure element on the same board you control |
| **Utility AMI meter (DLMS/IEC 62056)** | read the real billing meter through its optical or serial port | needs the utility | The endgame, and the only one a utility will settle against without argument |

For a pilot, the Shelly is a **sub-meter**: it measures a circuit inside the customer's installation,
not the commercial boundary. That is enough for a bilateral contract with a large consumer and not
enough for anything the regulator has to bless. See §6.

## 2. Attesting — read this part twice

The whole product rests on one claim: *this reading came from this device and nobody altered it.*
A key sitting in flash that anyone with a screwdriver can dump does not support that claim. The key
must live in a chip that performs the signature internally and never releases it.

**The trap.** The obvious cheap answer, Microchip's **ATECC608A/B** (about USD 1, I²C, used
everywhere), only implements **NIST P-256, also called secp256r1**. Ethereum uses **secp256k1**.
They are different curves. An ATECC608 physically cannot produce a signature that
`ecrecover` or `SignatureChecker` will accept. Plenty of projects have discovered this after
ordering the boards.

There are three honest ways around it, and the choice is an architecture decision, not a detail:

**(a) A secure element that does secp256k1.** NXP's **EdgeLock SE050 / SE05x** is the candidate:
NXP publishes an application note, *AN12665 — EdgeLock SE05x for Blockchain ID*, and states that
"private keys that are used to sign transactions are securely stored in EdgeLock SE05x
tamper-resistant environment and never leave the boundaries of the secure element". **Verify
secp256k1 explicitly in the SE05x datasheet curve table before ordering** — the application note
lists ECDSA generically without naming the curve, and that is not good enough to commit to.

**(b) Keep P-256 on the device and verify it off-chain.** This suits our design better than it
first appears, because the architecture already has two different signatures:

- *Per-reading signatures*, in the meter's own EIP-712 domain, which the **agent** verifies off
  chain, one by one, in `verifyMeterBatch`.
- *One settlement approval*, which the **contract** verifies on chain.

Only the second has to be secp256k1. The per-reading signatures can be P-256 from an ATECC608, with
the on-chain `evidenceHash` committing to the whole verified batch. This keeps the cheap chip on
every meter and puts the expensive constraint in one place. The cost is that the chain no longer
verifies the meter directly — it verifies that the agent verified it — and that trade has to be
stated out loud, not buried.

**(c) Wait for the chain to verify P-256.** [EIP-7951](https://eips.ethereum.org/EIPS/eip-7951)
specifies a precompile for secp256r1. Where it is available, an ATECC608 signature can be verified
on chain directly. **Do not assume HSK Chain has it** — check before designing around it.

**Weaker but real fallback:** an **ESP32-S3 with secure boot and flash encryption enabled through
eFuses**. The key sits in encrypted flash rather than in a tamper-resistant chip. It defeats a
casual attacker with a programmer, not a determined one with lab equipment. Acceptable for a pilot,
not for settlement at scale.

## 3. Transporting

| Link | Fit | Watch out for |
|---|---|---|
| **WiFi (ESP32)** | warehouses, supermarkets, offices | the simplest thing that works; start here |
| **LTE-M / NB-IoT** | sites with no usable WiFi | a SIM per site and a monthly fee |
| **LoRaWAN** | remote or rural sites | **payload size.** One signed reading is roughly 200 bytes; a LoRaWAN frame carries 51–242 depending on data rate. Send a Merkle root over a batch and deliver the leaves another way, or sign at a gateway and lose per-meter attestation. |

## 4. What changes in this codebase

Almost nothing, which is the point.

```
meter firmware ──► POST /api/grid/readings ──► same MeterReading struct, same EIP-712 domain
                                                     │
                                            verifyMeterBatch()  ← unchanged
                                            buildBaselineProfile()  ← unchanged
                                            computeSettlement()  ← unchanged
```

The simulator in `packages/shared/src/meter-sim.ts` is replaced by an ingestion endpoint that
stores what real devices send. The verification, the baseline, the arithmetic, the decision and
the contract are untouched. A device registry is the one genuinely new piece: mapping a site to the
public key its meter is allowed to sign with, and a way to rotate that key when hardware is
replaced.

## 5. A pilot, in phases

| Phase | What ships | Per-site cost | Time |
|---|---|---|---|
| **0 — today** | synthetic readings, development key | 0 | done |
| **1 — first real meter** | Shelly Pro 3EM + ESP32 + secure element, one cooperating site, sub-metered, bilateral contract | ~USD 150 | 2–4 weeks |
| **2 — defensible** | tamper-evident enclosure, secure boot, key rotation, periodic physical audit, ten sites | ~USD 150 | 2–3 months |
| **3 — settlement-grade** | type-approved meter at the commercial boundary, or integration with the utility's AMI head-end | utility-dependent | 6–12 months |

Phase 1 is the one that matters for this project: it turns "the readings are synthetic" into "the
readings come from one real building", and it is a fortnight of work, not a research programme.

## 6. What hardware attestation still does not prove

Worth saying before someone else says it.

A secure element proves **the chip signed it**. It does not prove the current transformer is around
the right conductor, that nobody clamped a magnet to the meter, or that the analogue path between
the metering IC and the secure element was not manipulated. This is exactly why utilities use
sealed, type-approved meters and send people to look at them.

Cryptography shrinks the trust surface from "trust the operator's spreadsheet" to "trust the
physical integrity of one sealed device". That is a large and useful reduction. It is not the same
as eliminating trust, and any project claiming otherwise is overselling.

## 7. Colombia, specifically

For a settlement a *comercializadora* will accept, metering has to meet CREG's rules for a
*frontera comercial*: a type-approved meter, installed and sealed by an authorised party. That is
Phase 3, and it involves the regulator.

Phase 1 does not need any of that, because it is a **private bilateral contract** with a large
consumer — a shopping centre, a campus, a cold-storage operator — who already has interval metering
and wants a lower bill. That is the right first customer anyway: they can decide in a meeting, and
they do not need CREG's permission to pay someone for reducing consumption on their own premises.
