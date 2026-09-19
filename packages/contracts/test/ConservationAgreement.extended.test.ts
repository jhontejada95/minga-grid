import { expect } from "chai";
import { ethers } from "hardhat";
import type { Contract } from "ethers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  Actors,
  AgreementInput,
  acceptBoth,
  buildInput,
  createAgreement,
  fundAgreement,
  getActors,
  makeApproval,
  signApproval,
  signBoth,
  usd,
} from "./helpers";

/**
 * Covers section 14 ("Contracts", items 1-11) of the implementation brief.
 * The base suite (ConservationAgreement.test.ts) covers the happy paths.
 */
describe("ConservationAgreement — extended verification (brief §14 items 1-11)", function () {
  let a: Actors;
  let factory: Contract;
  let token: Contract;
  let tokenAddress: string;

  beforeEach(async function () {
    a = await getActors();
    token = (await (await ethers.getContractFactory("MockUSD")).deploy()) as unknown as Contract;
    tokenAddress = await token.getAddress();
    factory = (await (await ethers.getContractFactory("AgreementFactoryRegistry")).deploy()) as unknown as Contract;
    await token.mint(a.payer.address, usd("1000"));
  });

  /** Creates an accepted and funded agreement. */
  async function fundedAgreement(overrides: Partial<AgreementInput> = {}, tokenContract: Contract = token) {
    const input = await buildInput(await tokenContract.getAddress(), a, overrides);
    const agreement = await createAgreement(factory, a.payer, input);
    await acceptBoth(agreement, a);
    await fundAgreement(agreement, tokenContract, a.payer);
    return { agreement, input };
  }

  async function release(agreement: Contract, approval: any, sigs: { community: string; verifier: string }) {
    return agreement.release(approval, sigs.community, sigs.verifier);
  }

  describe("Schema", function () {
    it("termsHash equals keccak256 of the documented flat abi.encode schema", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "address", "address", "address", "address",
            "bytes32", "bytes32", "bytes32",
            "address", "address", "uint256", "uint256[2]",
            "uint64", "uint64", "bool",
          ],
          [
            a.payer.address, input.communitySigner, input.verifierSigner, input.token,
            input.projectRefHash, input.metadataHash, input.methodologyHash,
            input.payeeCommunity, input.payeeMonitoring, input.communityBps, input.milestoneAmounts,
            input.fundingDeadline, input.executionDeadline, input.demoMode,
          ]
        )
      );
      expect(await agreement.termsHash()).to.equal(expected);
      expect(await agreement.totalBudget()).to.equal(usd("100"));
    });
  });

  describe("1. Factory registration and instance isolation", function () {
    it("emits AgreementCreated and stores the factory caller as payer, never a request value", async function () {
      const input = await buildInput(tokenAddress, a);
      await expect(factory.connect(a.payer).createAgreement(input)).to.emit(factory, "AgreementCreated");
      const record = await factory.getAgreement(0);
      expect(record.payer).to.equal(a.payer.address);
      expect(record.projectRefHash).to.equal(input.projectRefHash);
      expect(record.metadataHash).to.equal(input.metadataHash);
      await expect(factory.getAgreement(1)).to.be.revertedWith("Agreement does not exist");
    });

    it("keeps funds, nonces and paid state independent between two instances", async function () {
      const input = await buildInput(tokenAddress, a);
      const first = await createAgreement(factory, a.payer, input);
      const second = await createAgreement(factory, a.payer, input);
      expect(await first.getAddress()).to.not.equal(await second.getAddress());
      expect(await factory.agreementCount()).to.equal(2n);

      for (const agreement of [first, second]) {
        await acceptBoth(agreement, a);
        await fundAgreement(agreement, token, a.payer);
      }

      const approval = await makeApproval(first);
      await release(first, approval, await signBoth(first, a, approval));
      await first.connect(a.community).invalidateApproval(1);

      expect(await first.totalPaid()).to.equal(usd("50"));
      expect(await second.totalPaid()).to.equal(0n);
      expect(await second.nextMilestoneId()).to.equal(0n);
      expect(await second.milestonePaid(0)).to.equal(false);
      expect(await second.milestoneNonce(0)).to.equal(0n);
      expect(await second.milestoneNonce(1)).to.equal(0n);
      expect(await token.balanceOf(await second.getAddress())).to.equal(usd("100"));
      expect(await token.balanceOf(await first.getAddress())).to.equal(usd("50"));
    });

    it("invalidating milestone 0 does not touch the milestone 1 nonce", async function () {
      const { agreement } = await fundedAgreement();
      await agreement.connect(a.verifier).invalidateApproval(0);
      expect(await agreement.milestoneNonce(0)).to.equal(1n);
      expect(await agreement.milestoneNonce(1)).to.equal(0n);
    });
  });

  describe("2. Invalid parameters, missing acceptances and unauthorized calls", function () {
    const create = (overrides: Partial<AgreementInput>, caller = () => a.payer) =>
      buildInput(tokenAddress, a, overrides).then((input) => factory.connect(caller()).createAgreement(input));

    it("rejects zero or invalid participant addresses and tokens", async function () {
      await expect(create({ communitySigner: ethers.ZeroAddress })).to.be.revertedWith("Invalid community signer");
      await expect(create({ verifierSigner: ethers.ZeroAddress })).to.be.revertedWith("Invalid verifier signer");
      await expect(create({ token: ethers.ZeroAddress })).to.be.revertedWith("Invalid token contract");
      await expect(create({ token: a.outsider.address })).to.be.revertedWith("Invalid token contract");
    });

    it("requires payer, community signer and reviewer to be three distinct accounts", async function () {
      await expect(create({ communitySigner: a.payer.address })).to.be.revertedWith(
        "Signers and payer must be distinct"
      );
      await expect(create({ verifierSigner: a.payer.address })).to.be.revertedWith(
        "Signers and payer must be distinct"
      );
      await expect(create({ verifierSigner: a.community.address })).to.be.revertedWith(
        "Signers and payer must be distinct"
      );
    });

    it("requires two distinct non-zero payees that are not the agreement itself", async function () {
      await expect(create({ payeeCommunity: ethers.ZeroAddress })).to.be.revertedWith("Invalid payee addresses");
      await expect(create({ payeeMonitoring: ethers.ZeroAddress })).to.be.revertedWith("Invalid payee addresses");
      await expect(create({ payeeMonitoring: a.payeeCommunity.address })).to.be.revertedWith(
        "Payees must be distinct"
      );

      const factoryAddress = await factory.getAddress();
      const predicted = ethers.getCreateAddress({
        from: factoryAddress,
        nonce: await ethers.provider.getTransactionCount(factoryAddress),
      });
      await expect(create({ payeeCommunity: predicted })).to.be.revertedWith("Payee cannot be agreement contract");
    });

    it("allows the community signer to also be the community payee", async function () {
      await expect(create({ payeeCommunity: a.community.address })).to.emit(factory, "AgreementCreated");
    });

    it("rejects non-positive milestone amounts, out-of-range split and zero hashes", async function () {
      await expect(create({ milestoneAmounts: [0n, usd("50")] })).to.be.revertedWith(
        "Milestone amounts must be positive"
      );
      await expect(create({ milestoneAmounts: [usd("50"), 0n] })).to.be.revertedWith(
        "Milestone amounts must be positive"
      );
      await expect(create({ communityBps: 0 })).to.be.revertedWith("Community bps must be between 1 and 9999");
      await expect(create({ communityBps: 10000 })).to.be.revertedWith("Community bps must be between 1 and 9999");
      for (const field of ["projectRefHash", "metadataHash", "methodologyHash"] as const) {
        await expect(create({ [field]: ethers.ZeroHash })).to.be.revertedWith("Required hashes must be non-zero");
      }
    });

    it("rejects deadlines that are not strictly now < funding < execution", async function () {
      const now = BigInt(await time.latest());
      await expect(create({ fundingDeadline: now, executionDeadline: now + 100n })).to.be.revertedWith(
        "Invalid deadlines"
      );
      await expect(create({ fundingDeadline: now + 100n, executionDeadline: now + 100n })).to.be.revertedWith(
        "Invalid deadlines"
      );
      await expect(create({ fundingDeadline: now + 200n, executionDeadline: now + 100n })).to.be.revertedWith(
        "Invalid deadlines"
      );
    });

    it("rejects acceptance with a wrong hash, by outsiders and after the funding deadline", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      await expect(agreement.connect(a.community).acceptTerms(ethers.id("wrong"))).to.be.revertedWith(
        "Terms hash mismatch"
      );
      const termsHash = await agreement.termsHash();
      await expect(agreement.connect(a.payer).acceptTerms(termsHash)).to.be.revertedWith(
        "Caller not authorized to accept terms"
      );
      await time.increaseTo(input.fundingDeadline);
      await expect(agreement.connect(a.community).acceptTerms(termsHash)).to.be.revertedWith(
        "Funding deadline passed"
      );
    });

    it("blocks funding until both parties accepted, and only for the payer", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      await token.connect(a.payer).approve(await agreement.getAddress(), usd("100"));

      await expect(agreement.connect(a.payer).fund()).to.be.revertedWith(
        "Both parties must accept terms before funding"
      );
      await agreement.connect(a.community).acceptTerms(await agreement.termsHash());
      await expect(agreement.connect(a.payer).fund()).to.be.revertedWith(
        "Both parties must accept terms before funding"
      );
      await agreement.connect(a.verifier).acceptTerms(await agreement.termsHash());
      await expect(agreement.connect(a.outsider).fund()).to.be.revertedWith("Only payer can fund");
      await expect(agreement.connect(a.community).fund()).to.be.revertedWith("Only payer can fund");
    });
  });

  describe("3. Funding: exact, once, allowance and fee-on-transfer", function () {
    it("funds exactly the total budget once and cannot fund twice", async function () {
      const { agreement } = await fundedAgreement();
      expect(await agreement.funded()).to.equal(true);
      expect(await agreement.fundedAt()).to.be.greaterThan(0n);
      expect(await token.balanceOf(await agreement.getAddress())).to.equal(usd("100"));
      await expect(agreement.connect(a.payer).fund()).to.be.revertedWith("Already funded");
    });

    it("emits AgreementFunded with the exact amount", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      await acceptBoth(agreement, a);
      await token.connect(a.payer).approve(await agreement.getAddress(), usd("100"));
      await expect(agreement.connect(a.payer).fund())
        .to.emit(agreement, "AgreementFunded")
        .withArgs(a.payer.address, usd("100"));
    });

    it("fails with insufficient allowance or insufficient balance", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      await acceptBoth(agreement, a);

      await token.connect(a.payer).approve(await agreement.getAddress(), usd("99.999999"));
      await expect(agreement.connect(a.payer).fund()).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientAllowance"
      );

      // Drain the payer, then approve enough: now the balance is the limit.
      await token.connect(a.payer).transfer(a.outsider.address, usd("1000"));
      await token.connect(a.payer).approve(await agreement.getAddress(), usd("100"));
      await expect(agreement.connect(a.payer).fund()).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance"
      );
      expect(await agreement.funded()).to.equal(false);
    });

    it("rejects fee-on-transfer tokens because the balance delta is not the budget", async function () {
      const feeToken = (await (await ethers.getContractFactory("FeeOnTransferToken")).deploy()) as unknown as Contract;
      await feeToken.mint(a.payer.address, usd("1000"));
      const input = await buildInput(await feeToken.getAddress(), a);
      const agreement = await createAgreement(factory, a.payer, input);
      await acceptBoth(agreement, a);
      await feeToken.connect(a.payer).approve(await agreement.getAddress(), usd("100"));
      await expect(agreement.connect(a.payer).fund()).to.be.revertedWith("Fee-on-transfer unsupported");
      expect(await agreement.funded()).to.equal(false);
      expect(await feeToken.balanceOf(await agreement.getAddress())).to.equal(0n);
    });

    it("an unfunded agreement expires: no funding after the deadline, nothing to release or refund", async function () {
      const input = await buildInput(tokenAddress, a);
      const agreement = await createAgreement(factory, a.payer, input);
      await acceptBoth(agreement, a);
      await token.connect(a.payer).approve(await agreement.getAddress(), usd("100"));
      await time.increaseTo(input.fundingDeadline);

      await expect(agreement.connect(a.payer).fund()).to.be.revertedWith("Funding deadline passed");
      await expect(agreement.refundRemaining()).to.be.revertedWith("Agreement not funded");
      const approval = await makeApproval(agreement);
      await expect(release(agreement, approval, { community: "0x", verifier: "0x" })).to.be.revertedWith(
        "Agreement not funded"
      );
    });

    it("accidental token transfers do not enlarge the budget or the refund", async function () {
      const { agreement, input } = await fundedAgreement();
      await token.connect(a.payer).transfer(await agreement.getAddress(), usd("25"));
      expect(await agreement.totalBudget()).to.equal(usd("100"));

      await time.increaseTo(input.executionDeadline);
      const before = await token.balanceOf(a.payer.address);
      await agreement.refundRemaining();
      expect((await token.balanceOf(a.payer.address)) - before).to.equal(usd("100"));
      expect(await token.balanceOf(await agreement.getAddress())).to.equal(usd("25"));
    });
  });

  describe("4. Valid releases, receipts and the full lifecycle", function () {
    it("pays 40/10, leaves 50, stores the receipt and emits MilestonePaid", async function () {
      const { agreement } = await fundedAgreement();
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);

      await expect(release(agreement, approval, sigs)).to.emit(agreement, "MilestonePaid");

      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(usd("40"));
      expect(await token.balanceOf(a.payeeMonitoring.address)).to.equal(usd("10"));
      expect(await token.balanceOf(await agreement.getAddress())).to.equal(usd("50"));

      const receipt = await agreement.milestoneReceipts(0);
      expect(receipt.milestoneId).to.equal(0n);
      expect(receipt.evidenceHash).to.equal(approval.evidenceHash);
      expect(receipt.termsHash).to.equal(await agreement.termsHash());
      expect(receipt.payeeCommunity).to.equal(a.payeeCommunity.address);
      expect(receipt.payeeMonitoring).to.equal(a.payeeMonitoring.address);
      expect(receipt.communityAmount).to.equal(usd("40"));
      expect(receipt.monitoringAmount).to.equal(usd("10"));
      expect(receipt.paidAt).to.be.greaterThan(0n);
    });

    it("lets anyone submit the release but the recipients never change", async function () {
      const { agreement } = await fundedAgreement();
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      await agreement.connect(a.outsider).release(approval, sigs.community, sigs.verifier);
      expect(await token.balanceOf(a.outsider.address)).to.equal(0n);
      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(usd("40"));
    });

    it("completes both milestones, rounds the split down, and then has nothing to refund", async function () {
      // 33.333333 mUSD at 80%: floor(33333333 * 8000 / 10000) = 26666666; monitoring gets the remainder.
      const { agreement, input } = await fundedAgreement({ milestoneAmounts: [33333333n, usd("50")] });
      const first = await makeApproval(agreement);
      await release(agreement, first, await signBoth(agreement, a, first));
      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(26666666n);
      expect(await token.balanceOf(a.payeeMonitoring.address)).to.equal(6666667n);

      const second = await makeApproval(agreement, {}, 1n);
      await release(agreement, second, await signBoth(agreement, a, second));

      expect(await agreement.nextMilestoneId()).to.equal(2n);
      expect(await agreement.totalPaid()).to.equal(await agreement.totalBudget());
      expect(await token.balanceOf(await agreement.getAddress())).to.equal(0n);

      await time.increaseTo(input.executionDeadline);
      await expect(agreement.refundRemaining()).to.be.revertedWith("No remaining balance");
    });
  });

  describe("5. Missing or invalid signatures and altered payloads", function () {
    let agreement: Contract;
    beforeEach(async function () {
      ({ agreement } = await fundedAgreement());
    });

    it("rejects a missing community or reviewer signature", async function () {
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      await expect(release(agreement, approval, { community: "0x", verifier: sigs.verifier })).to.be.revertedWith(
        "Invalid community signature"
      );
      await expect(release(agreement, approval, { community: sigs.community, verifier: "0x" })).to.be.revertedWith(
        "Invalid verifier signature"
      );
    });

    it("rejects swapped roles and signatures from unrelated accounts", async function () {
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      await expect(
        release(agreement, approval, { community: sigs.verifier, verifier: sigs.community })
      ).to.be.revertedWith("Invalid community signature");

      const outsiderSig = await signApproval(await agreement.getAddress(), a.outsider, approval);
      await expect(
        release(agreement, approval, { community: sigs.community, verifier: outsiderSig })
      ).to.be.revertedWith("Invalid verifier signature");
    });

    it("rejects altered amount, terms hash, evidence hash and demo mode", async function () {
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);

      await expect(release(agreement, { ...approval, amount: usd("60") }, sigs)).to.be.revertedWith("Amount mismatch");
      await expect(release(agreement, { ...approval, termsHash: ethers.id("other") }, sigs)).to.be.revertedWith(
        "Terms hash mismatch"
      );
      await expect(release(agreement, { ...approval, demoMode: false }, sigs)).to.be.revertedWith(
        "Demo mode mismatch"
      );
      // The evidence hash is only bound by the signatures, so tampering shows up as an invalid signature.
      await expect(
        release(agreement, { ...approval, evidenceHash: ethers.id("swapped-evidence") }, sigs)
      ).to.be.revertedWith("Invalid community signature");
    });

    it("rejects an empty evidence hash", async function () {
      const approval = await makeApproval(agreement, { evidenceHash: ethers.ZeroHash });
      const sigs = await signBoth(agreement, a, approval);
      await expect(release(agreement, approval, sigs)).to.be.revertedWith("Evidence hash empty");
    });

    it("rejects signers that approved two different payloads", async function () {
      const approvalA = await makeApproval(agreement, { evidenceHash: ethers.id("evidence-A") });
      const approvalB = await makeApproval(agreement, { evidenceHash: ethers.id("evidence-B") });
      const address = await agreement.getAddress();
      const communityOnA = await signApproval(address, a.community, approvalA);
      const verifierOnB = await signApproval(address, a.verifier, approvalB);
      await expect(
        release(agreement, approvalA, { community: communityOnA, verifier: verifierOnB })
      ).to.be.revertedWith("Invalid verifier signature");
    });
  });

  describe("6. Signature replay boundaries", function () {
    it("a signature for one instance cannot be replayed on another with identical terms", async function () {
      const input = await buildInput(tokenAddress, a);
      const first = await createAgreement(factory, a.payer, input);
      const second = await createAgreement(factory, a.payer, input);
      for (const agreement of [first, second]) {
        await acceptBoth(agreement, a);
        await fundAgreement(agreement, token, a.payer);
      }
      expect(await first.termsHash()).to.equal(await second.termsHash());

      const approval = await makeApproval(first);
      const sigs = await signBoth(first, a, approval);
      await expect(release(second, approval, sigs)).to.be.revertedWith("Invalid community signature");
      await expect(release(first, approval, sigs)).to.emit(first, "MilestonePaid");
    });

    it("a signature for another chain ID is rejected", async function () {
      const { agreement } = await fundedAgreement();
      const approval = await makeApproval(agreement);
      const address = await agreement.getAddress();
      const wrongChain = {
        community: await signApproval(address, a.community, approval, { chainId: 1n }),
        verifier: await signApproval(address, a.verifier, approval, { chainId: 1n }),
      };
      await expect(release(agreement, approval, wrongChain)).to.be.revertedWith("Invalid community signature");
    });

    it("signatures collected before an invalidation cannot be reused, nor re-signed at the old nonce", async function () {
      const { agreement } = await fundedAgreement();
      const stale = await makeApproval(agreement);
      const staleSigs = await signBoth(agreement, a, stale);

      await agreement.connect(a.community).invalidateApproval(0);

      await expect(release(agreement, stale, staleSigs)).to.be.revertedWith("Nonce mismatch");
      const relabelled = { ...stale, nonce: 1n };
      await expect(release(agreement, relabelled, staleSigs)).to.be.revertedWith("Invalid community signature");

      const fresh = await makeApproval(agreement);
      expect(fresh.nonce).to.equal(1n);
      await expect(release(agreement, fresh, await signBoth(agreement, a, fresh))).to.emit(agreement, "MilestonePaid");
    });
  });

  describe("7. Sequence, duplicates and time window", function () {
    let agreement: Contract;
    beforeEach(async function () {
      ({ agreement } = await fundedAgreement());
    });

    it("rejects milestone 2 before milestone 1 and out-of-range milestones", async function () {
      const second = await makeApproval(agreement, {}, 1n);
      await expect(release(agreement, second, await signBoth(agreement, a, second))).to.be.revertedWith(
        "Milestone out of sequence"
      );
      const bogus = await makeApproval(agreement, { milestoneId: 2n });
      await expect(release(agreement, bogus, { community: "0x", verifier: "0x" })).to.be.revertedWith(
        "Milestone out of sequence"
      );
    });

    it("rejects paying the same milestone twice", async function () {
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      await release(agreement, approval, sigs);
      await expect(release(agreement, approval, sigs)).to.be.revertedWith("Milestone out of sequence");
      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(usd("40"));
    });

    it("rejects paying milestone 2 twice", async function () {
      const first = await makeApproval(agreement);
      await release(agreement, first, await signBoth(agreement, a, first));
      const second = await makeApproval(agreement, {}, 1n);
      const sigs = await signBoth(agreement, a, second);
      await release(agreement, second, sigs);
      await expect(release(agreement, second, sigs)).to.be.revertedWith("Milestone out of sequence");
    });

    it("rejects expired approvals", async function () {
      const now = BigInt(await time.latest());
      const approval = await makeApproval(agreement, { signedAt: now, validUntil: now });
      await expect(release(agreement, approval, await signBoth(agreement, a, approval))).to.be.revertedWith(
        "Approval expired"
      );
    });

    it("rejects a future signedAt and a signedAt before funding", async function () {
      const now = BigInt(await time.latest());
      const future = await makeApproval(agreement, { signedAt: now + 1000n, validUntil: now + 4000n });
      await expect(release(agreement, future, await signBoth(agreement, a, future))).to.be.revertedWith(
        "Future signedAt timestamp"
      );

      const early = await makeApproval(agreement, { signedAt: (await agreement.fundedAt()) - 1n });
      await expect(release(agreement, early, await signBoth(agreement, a, early))).to.be.revertedWith(
        "Signed before funding"
      );
    });

    it("rejects an approval valid beyond the execution deadline", async function () {
      const approval = await makeApproval(agreement, { validUntil: (await agreement.executionDeadline()) + 1n });
      await expect(release(agreement, approval, await signBoth(agreement, a, approval))).to.be.revertedWith(
        "Approval validity exceeds deadline"
      );
    });
  });

  describe("8. Invalidation", function () {
    it("either authorized signer can invalidate and the event carries the new nonce", async function () {
      const { agreement } = await fundedAgreement();
      await expect(agreement.connect(a.community).invalidateApproval(0))
        .to.emit(agreement, "ApprovalInvalidated")
        .withArgs(0n, a.community.address, 1n);
      await expect(agreement.connect(a.verifier).invalidateApproval(0))
        .to.emit(agreement, "ApprovalInvalidated")
        .withArgs(0n, a.verifier.address, 2n);
      expect(await agreement.milestoneNonce(0)).to.equal(2n);
    });

    it("unrelated accounts, including the payer, cannot invalidate", async function () {
      const { agreement } = await fundedAgreement();
      for (const account of [a.outsider, a.payer, a.payeeCommunity]) {
        await expect(agreement.connect(account).invalidateApproval(0)).to.be.revertedWith(
          "Only authorized signers can invalidate"
        );
      }
    });

    it("cannot invalidate before funding, a paid milestone, an unknown milestone or after the deadline", async function () {
      const input = await buildInput(tokenAddress, a);
      const unfunded = await createAgreement(factory, a.payer, input);
      await expect(unfunded.connect(a.community).invalidateApproval(0)).to.be.revertedWith("Agreement not active");

      const { agreement, input: fundedInput } = await fundedAgreement();
      const approval = await makeApproval(agreement);
      await release(agreement, approval, await signBoth(agreement, a, approval));
      await expect(agreement.connect(a.community).invalidateApproval(0)).to.be.revertedWith(
        "Milestone invalid or paid"
      );
      await expect(agreement.connect(a.community).invalidateApproval(2)).to.be.revertedWith(
        "Milestone invalid or paid"
      );

      await time.increaseTo(fundedInput.executionDeadline);
      await expect(agreement.connect(a.community).invalidateApproval(1)).to.be.revertedWith(
        "Execution deadline passed"
      );
    });
  });

  describe("9. Refunds", function () {
    it("cannot refund before the deadline or before funding, and only once", async function () {
      const { agreement, input } = await fundedAgreement();
      await expect(agreement.refundRemaining()).to.be.revertedWith("Execution deadline not reached");

      await time.increaseTo(input.executionDeadline);
      await expect(agreement.connect(a.outsider).refundRemaining())
        .to.emit(agreement, "RemainingRefunded")
        .withArgs(a.payer.address, usd("100"));
      await expect(agreement.refundRemaining()).to.be.revertedWith("Already refunded");
    });

    it("after one payment refunds exactly the remaining 50 to the original payer and blocks release", async function () {
      const { agreement, input } = await fundedAgreement();
      const approval = await makeApproval(agreement);
      await release(agreement, approval, await signBoth(agreement, a, approval));

      const payerBefore = await token.balanceOf(a.payer.address);
      await time.increaseTo(input.executionDeadline);
      await agreement.connect(a.outsider).refundRemaining();

      expect((await token.balanceOf(a.payer.address)) - payerBefore).to.equal(usd("50"));
      expect(await token.balanceOf(await agreement.getAddress())).to.equal(0n);
      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(usd("40"));
      expect(await token.balanceOf(a.payeeMonitoring.address)).to.equal(usd("10"));
      expect(await agreement.totalPaid()).to.equal(usd("50"));
      expect(await agreement.refunded()).to.equal(true);

      const second = await makeApproval(agreement, {}, 1n);
      await expect(release(agreement, second, { community: "0x", verifier: "0x" })).to.be.revertedWith(
        "Agreement refunded"
      );
    });
  });

  describe("10. Exact execution-deadline boundary", function () {
    it("release is forbidden at the deadline second and refund is allowed", async function () {
      const { agreement, input } = await fundedAgreement();
      const approval = await makeApproval(agreement, { validUntil: input.executionDeadline });
      const sigs = await signBoth(agreement, a, approval);

      await time.setNextBlockTimestamp(input.executionDeadline);
      // Explicit gasLimit skips gas estimation so the transaction is mined exactly at the deadline.
      await expect(
        agreement.release(approval, sigs.community, sigs.verifier, { gasLimit: 1_000_000 })
      ).to.be.revertedWith("Execution deadline reached");

      await agreement.refundRemaining({ gasLimit: 1_000_000 });
      expect(await agreement.refunded()).to.equal(true);
      expect(await token.balanceOf(a.payeeCommunity.address)).to.equal(0n);
    });

    it("refund succeeds in the very block whose timestamp equals the deadline", async function () {
      const { agreement, input } = await fundedAgreement();
      await time.setNextBlockTimestamp(input.executionDeadline);
      await agreement.refundRemaining({ gasLimit: 1_000_000 });
      const block = await ethers.provider.getBlock("latest");
      expect(BigInt(block!.timestamp)).to.equal(input.executionDeadline);
      expect(await agreement.refunded()).to.equal(true);
    });

    it("the last second before the deadline still allows release", async function () {
      const { agreement, input } = await fundedAgreement();
      const approval = await makeApproval(agreement, { validUntil: input.executionDeadline });
      const sigs = await signBoth(agreement, a, approval);
      await time.setNextBlockTimestamp(input.executionDeadline - 1n);
      await agreement.release(approval, sigs.community, sigs.verifier, { gasLimit: 1_000_000 });
      expect(await agreement.milestonePaid(0)).to.equal(true);
    });
  });

  describe("11. Failing transfers and reentrancy", function () {
    it("a failing second transfer rolls back every state change and the first transfer", async function () {
      const blockable = (await (await ethers.getContractFactory("BlockableToken")).deploy()) as unknown as Contract;
      await blockable.mint(a.payer.address, usd("1000"));
      const { agreement } = await fundedAgreement({}, blockable);

      await blockable.setBlocked(a.payeeMonitoring.address, true);
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      await expect(release(agreement, approval, sigs)).to.be.revertedWith("Blocked recipient");

      expect(await agreement.milestonePaid(0)).to.equal(false);
      expect(await agreement.totalPaid()).to.equal(0n);
      expect(await agreement.nextMilestoneId()).to.equal(0n);
      expect(await agreement.milestoneNonce(0)).to.equal(0n);
      expect((await agreement.milestoneReceipts(0)).paidAt).to.equal(0n);
      expect(await blockable.balanceOf(a.payeeCommunity.address)).to.equal(0n);
      expect(await blockable.balanceOf(await agreement.getAddress())).to.equal(usd("100"));

      // The same signatures still work once the recipient is unblocked: nothing was consumed.
      await blockable.setBlocked(a.payeeMonitoring.address, false);
      await expect(release(agreement, approval, sigs)).to.emit(agreement, "MilestonePaid");
    });

    const REENTRANCY_SELECTOR = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);

    async function reentrantSetup() {
      const reentrant = (await (await ethers.getContractFactory("ReentrantToken")).deploy()) as unknown as Contract;
      await reentrant.mint(a.payer.address, usd("1000"));
      const { agreement, input } = await fundedAgreement({}, reentrant);
      return { reentrant, agreement, input };
    }

    it("re-entering release() during the payout is blocked by the reentrancy guard", async function () {
      const { reentrant, agreement } = await reentrantSetup();
      const approval = await makeApproval(agreement);
      const sigs = await signBoth(agreement, a, approval);
      const replay = agreement.interface.encodeFunctionData("release", [approval, sigs.community, sigs.verifier]);
      await reentrant.arm(await agreement.getAddress(), replay);

      await release(agreement, approval, sigs);

      expect(await reentrant.attempted()).to.equal(true);
      expect(await reentrant.reentrySucceeded()).to.equal(false);
      expect((await reentrant.reentryReturnData()).slice(0, 10)).to.equal(REENTRANCY_SELECTOR);
      expect(await reentrant.balanceOf(a.payeeCommunity.address)).to.equal(usd("40"));
      expect(await reentrant.balanceOf(a.payeeMonitoring.address)).to.equal(usd("10"));
      expect(await reentrant.balanceOf(await agreement.getAddress())).to.equal(usd("50"));
    });

    it("re-entering refundRemaining() during the refund is blocked by the reentrancy guard", async function () {
      const { reentrant, agreement, input } = await reentrantSetup();
      await reentrant.arm(await agreement.getAddress(), agreement.interface.encodeFunctionData("refundRemaining"));
      await time.increaseTo(input.executionDeadline);

      const before = await reentrant.balanceOf(a.payer.address);
      await agreement.refundRemaining();

      expect(await reentrant.attempted()).to.equal(true);
      expect(await reentrant.reentrySucceeded()).to.equal(false);
      expect((await reentrant.reentryReturnData()).slice(0, 10)).to.equal(REENTRANCY_SELECTOR);
      expect((await reentrant.balanceOf(a.payer.address)) - before).to.equal(usd("100"));
      expect(await reentrant.balanceOf(await agreement.getAddress())).to.equal(0n);
    });
  });
});
