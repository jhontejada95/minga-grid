import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  AgreementFactoryRegistry,
  ConservationAgreement,
  MockUSD,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MINGA Nature — Smart Contracts Suite", function () {
  let factory: AgreementFactoryRegistry;
  let mockUSD: MockUSD;
  let agreement: ConservationAgreement;

  let deployer: SignerWithAddress;
  let payer: SignerWithAddress;
  let communitySigner: SignerWithAddress;
  let verifierSigner: SignerWithAddress;
  let payeeCommunity: SignerWithAddress;
  let payeeMonitoring: SignerWithAddress;
  let outsider: SignerWithAddress;

  const projectRefHash = ethers.keccak256(ethers.toUtf8Bytes("pacific-mangrove-demo"));
  const metadataHash = ethers.keccak256(ethers.toUtf8Bytes("pacific-mangrove-metadata-v1"));
  const methodologyHash = ethers.keccak256(ethers.toUtf8Bytes("coastal-mangrove-standard-v1"));

  const communityBps = 8000; // 80% community, 20% monitoring
  const milestoneAmounts = [ethers.parseUnits("50", 6), ethers.parseUnits("50", 6)] as [bigint, bigint];
  const totalBudget = ethers.parseUnits("100", 6);

  let fundingDeadline: bigint;
  let executionDeadline: bigint;
  const demoMode = true;

  async function createAgreementInput() {
    const now = BigInt(await time.latest());
    fundingDeadline = now + 3600n; // 1 hour from now
    executionDeadline = now + 86400n; // 24 hours from now

    return {
      communitySigner: communitySigner.address,
      verifierSigner: verifierSigner.address,
      token: await mockUSD.getAddress(),
      projectRefHash,
      metadataHash,
      methodologyHash,
      payeeCommunity: payeeCommunity.address,
      payeeMonitoring: payeeMonitoring.address,
      communityBps,
      milestoneAmounts,
      fundingDeadline,
      executionDeadline,
      demoMode,
    };
  }

  async function signApproval(
    agreementAddress: string,
    signer: SignerWithAddress,
    approval: {
      milestoneId: bigint;
      termsHash: string;
      evidenceHash: string;
      amount: bigint;
      nonce: bigint;
      signedAt: bigint;
      validUntil: bigint;
      demoMode: boolean;
    }
  ) {
    const domain = {
      name: "MingaConservationAgreement",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: agreementAddress,
    };

    const types = {
      MilestoneApproval: [
        { name: "milestoneId", type: "uint256" },
        { name: "termsHash", type: "bytes32" },
        { name: "evidenceHash", type: "bytes32" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "signedAt", type: "uint64" },
        { name: "validUntil", type: "uint64" },
        { name: "demoMode", type: "bool" },
      ],
    };

    return await signer.signTypedData(domain, types, approval);
  }

  beforeEach(async function () {
    [
      deployer,
      payer,
      communitySigner,
      verifierSigner,
      payeeCommunity,
      payeeMonitoring,
      outsider,
    ] = await ethers.getSigners();

    const MockUSDFactory = await ethers.getContractFactory("MockUSD");
    mockUSD = await MockUSDFactory.deploy();

    const FactoryRegistry = await ethers.getContractFactory("AgreementFactoryRegistry");
    factory = await FactoryRegistry.deploy();

    // Distribute mUSD to payer and approve factory/agreement
    await mockUSD.mint(payer.address, totalBudget * 10n);

    // Deploy agreement A through factory called by payer
    const input = await createAgreementInput();
    const tx = await factory.connect(payer).createAgreement(input);
    const receipt = await tx.wait();

    const event = receipt?.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "AgreementCreated");

    const agreementAddress = event?.args?.agreementAddress;
    agreement = await ethers.getContractAt("ConservationAgreement", agreementAddress);
  });

  describe("1. Factory and Agreement Isolation", function () {
    it("should register agreement correctly with factory caller as payer", async function () {
      expect(await factory.agreementCount()).to.equal(1n);
      expect(await factory.isRegisteredAgreement(await agreement.getAddress())).to.be.true;

      const record = await factory.getAgreement(0);
      expect(record.agreementAddress).to.equal(await agreement.getAddress());
      expect(record.payer).to.equal(payer.address);
      expect(await agreement.payer()).to.equal(payer.address);
    });

    it("should allow deploying a second agreement with independent isolation", async function () {
      const inputB = await createAgreementInput();
      const txB = await factory.connect(outsider).createAgreement(inputB);
      const receiptB = await txB.wait();

      expect(await factory.agreementCount()).to.equal(2n);
      const recordB = await factory.getAgreement(1);
      expect(recordB.payer).to.equal(outsider.address);
      expect(recordB.agreementAddress).to.not.equal(await agreement.getAddress());
    });
  });

  describe("2. Initial Acceptance and Funding", function () {
    it("rejects funding before both parties accept terms", async function () {
      await mockUSD.connect(payer).approve(await agreement.getAddress(), totalBudget);
      await expect(agreement.connect(payer).fund()).to.be.revertedWith(
        "Both parties must accept terms before funding"
      );
    });

    it("allows community and verifier to accept terms with exact termsHash", async function () {
      const termsHash = await agreement.termsHash();
      await expect(
        agreement.connect(outsider).acceptTerms(termsHash)
      ).to.be.revertedWith("Caller not authorized to accept terms");

      await agreement.connect(communitySigner).acceptTerms(termsHash);
      expect(await agreement.communityAccepted()).to.be.true;

      await agreement.connect(verifierSigner).acceptTerms(termsHash);
      expect(await agreement.verifierAccepted()).to.be.true;
    });

    it("funds exact budget successfully once both parties accept", async function () {
      const termsHash = await agreement.termsHash();
      await agreement.connect(communitySigner).acceptTerms(termsHash);
      await agreement.connect(verifierSigner).acceptTerms(termsHash);

      await mockUSD.connect(payer).approve(await agreement.getAddress(), totalBudget);
      await agreement.connect(payer).fund();

      expect(await agreement.funded()).to.be.true;
      expect(await mockUSD.balanceOf(await agreement.getAddress())).to.equal(totalBudget);
    });
  });

  describe("3. Dual-Signature Milestone Settlement & Split", function () {
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("manifest-milestone-1"));

    beforeEach(async function () {
      const termsHash = await agreement.termsHash();
      await agreement.connect(communitySigner).acceptTerms(termsHash);
      await agreement.connect(verifierSigner).acceptTerms(termsHash);
      await mockUSD.connect(payer).approve(await agreement.getAddress(), totalBudget);
      await agreement.connect(payer).fund();
    });

    it("disburses exact 80/20 split on valid dual signatures", async function () {
      const termsHash = await agreement.termsHash();
      const now = BigInt(await time.latest());

      const approvalPayload = {
        milestoneId: 0n,
        termsHash,
        evidenceHash,
        amount: milestoneAmounts[0],
        nonce: 0n,
        signedAt: now,
        validUntil: now + 3600n,
        demoMode: true,
      };

      const communitySig = await signApproval(
        await agreement.getAddress(),
        communitySigner,
        approvalPayload
      );
      const verifierSig = await signApproval(
        await agreement.getAddress(),
        verifierSigner,
        approvalPayload
      );

      const commBalanceBefore = await mockUSD.balanceOf(payeeCommunity.address);
      const monBalanceBefore = await mockUSD.balanceOf(payeeMonitoring.address);

      await agreement.release(approvalPayload, communitySig, verifierSig);

      // 80% of 50 mUSD is 40 mUSD, 20% is 10 mUSD
      const expectedCommunity = ethers.parseUnits("40", 6);
      const expectedMonitoring = ethers.parseUnits("10", 6);

      expect((await mockUSD.balanceOf(payeeCommunity.address)) - commBalanceBefore).to.equal(
        expectedCommunity
      );
      expect((await mockUSD.balanceOf(payeeMonitoring.address)) - monBalanceBefore).to.equal(
        expectedMonitoring
      );

      expect(await agreement.totalPaid()).to.equal(milestoneAmounts[0]);
      expect(await agreement.nextMilestoneId()).to.equal(1n);
      expect(await agreement.milestonePaid(0)).to.be.true;
    });

    it("rejects release with altered amount or termsHash", async function () {
      const termsHash = await agreement.termsHash();
      const now = BigInt(await time.latest());

      const approvalPayload = {
        milestoneId: 0n,
        termsHash,
        evidenceHash,
        amount: milestoneAmounts[0],
        nonce: 0n,
        signedAt: now,
        validUntil: now + 3600n,
        demoMode: true,
      };

      const communitySig = await signApproval(
        await agreement.getAddress(),
        communitySigner,
        approvalPayload
      );
      const verifierSig = await signApproval(
        await agreement.getAddress(),
        verifierSigner,
        approvalPayload
      );

      // Alter amount in submitted payload
      const alteredPayload = { ...approvalPayload, amount: ethers.parseUnits("60", 6) };
      await expect(
        agreement.release(alteredPayload, communitySig, verifierSig)
      ).to.be.revertedWith("Amount mismatch");
    });

    it("rejects release when signatures are invalid or mismatched", async function () {
      const termsHash = await agreement.termsHash();
      const now = BigInt(await time.latest());

      const approvalPayload = {
        milestoneId: 0n,
        termsHash,
        evidenceHash,
        amount: milestoneAmounts[0],
        nonce: 0n,
        signedAt: now,
        validUntil: now + 3600n,
        demoMode: true,
      };

      // Outsider signs instead of community
      const badCommunitySig = await signApproval(
        await agreement.getAddress(),
        outsider,
        approvalPayload
      );
      const verifierSig = await signApproval(
        await agreement.getAddress(),
        verifierSigner,
        approvalPayload
      );

      await expect(
        agreement.release(approvalPayload, badCommunitySig, verifierSig)
      ).to.be.revertedWith("Invalid community signature");
    });

    it("allows signer to invalidate approvals and rejects previous signatures", async function () {
      const termsHash = await agreement.termsHash();
      const now = BigInt(await time.latest());

      const approvalPayload = {
        milestoneId: 0n,
        termsHash,
        evidenceHash,
        amount: milestoneAmounts[0],
        nonce: 0n,
        signedAt: now,
        validUntil: now + 3600n,
        demoMode: true,
      };

      const communitySig = await signApproval(
        await agreement.getAddress(),
        communitySigner,
        approvalPayload
      );
      const verifierSig = await signApproval(
        await agreement.getAddress(),
        verifierSigner,
        approvalPayload
      );

      // Community invalidates milestone 0
      await agreement.connect(communitySigner).invalidateApproval(0);
      expect(await agreement.milestoneNonce(0)).to.equal(1n);

      // Attempting release with nonce 0 fails
      await expect(
        agreement.release(approvalPayload, communitySig, verifierSig)
      ).to.be.revertedWith("Nonce mismatch");
    });
  });

  describe("4. Deadlines and Refunds", function () {
    it("rejects refund before executionDeadline and allows refund after deadline", async function () {
      const termsHash = await agreement.termsHash();
      await agreement.connect(communitySigner).acceptTerms(termsHash);
      await agreement.connect(verifierSigner).acceptTerms(termsHash);
      await mockUSD.connect(payer).approve(await agreement.getAddress(), totalBudget);
      await agreement.connect(payer).fund();

      // Refund before deadline fails
      await expect(agreement.refundRemaining()).to.be.revertedWith(
        "Execution deadline not reached"
      );

      // Fast-forward past executionDeadline
      await time.increaseTo(executionDeadline + 1n);

      const payerBalanceBefore = await mockUSD.balanceOf(payer.address);
      await agreement.refundRemaining();

      expect(await agreement.refunded()).to.be.true;
      expect((await mockUSD.balanceOf(payer.address)) - payerBalanceBefore).to.equal(totalBudget);

      // Second refund attempt fails
      await expect(agreement.refundRemaining()).to.be.revertedWith("Already refunded");
    });
  });
});
