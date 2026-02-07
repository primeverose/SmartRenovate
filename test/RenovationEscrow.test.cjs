import { expect } from "chai";
import { ethers } from "hardhat";
import { RenovationEscrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("RenovationEscrow", function () {
  let renovationEscrow: RenovationEscrow;
  let contractor: HardhatEthersSigner;
  let homeowner: HardhatEthersSigner;
  let inspector: HardhatEthersSigner;
  let arbitrator: HardhatEthersSigner;

  const BASE_AMOUNT = ethers.parseEther("30"); // 30 USDC
  const CONTINGENCY = ethers.parseEther("5"); // 5 USDC
  const TOTAL_AMOUNT = BASE_AMOUNT + CONTINGENCY;

  const DOWN_PAYMENT_PCT = 20;
  const RETENTION_PCT = 10;
  const MILESTONE_PCTS = [30, 40, 30];
  const MILESTONE_DESCRIPTIONS = [
    "Milestone 1: Demolition",
    "Milestone 2: Plumbing & Electrical",
    "Milestone 3: Completion & Handover"
  ];

  beforeEach(async function () {
    [contractor, homeowner, inspector, arbitrator] = await ethers.getSigners();

    const RenovationEscrow = await ethers.getContractFactory("RenovationEscrow");
    renovationEscrow = await RenovationEscrow.deploy();
    await renovationEscrow.waitForDeployment();
  });

  describe("Project Creation", function () {
    it("Should create a new project", async function () {
      const inspectorSolanaAddress = ethers.encodeBytes32String("SolanaAddress123");

      const tx = await renovationEscrow.connect(contractor).createProject(
        homeowner.address,
        inspectorSolanaAddress,
        arbitrator.address,
        BASE_AMOUNT,
        CONTINGENCY,
        DOWN_PAYMENT_PCT,
        RETENTION_PCT,
        MILESTONE_PCTS,
        MILESTONE_DESCRIPTIONS
      );

      await expect(tx)
        .to.emit(renovationEscrow, "ProjectCreated")
        .withArgs(0, contractor.address, homeowner.address, TOTAL_AMOUNT);

      const project = await renovationEscrow.getProject(0);
      expect(project.homeowner).to.equal(homeowner.address);
      expect(project.contractor).to.equal(contractor.address);
      expect(project.baseAmount).to.equal(BASE_AMOUNT);
      expect(project.status).to.equal(0); // Pending
    });

    it("Should create correct number of milestones", async function () {
      const inspectorSolanaAddress = ethers.encodeBytes32String("SolanaAddress123");

      await renovationEscrow.connect(contractor).createProject(
        homeowner.address,
        inspectorSolanaAddress,
        arbitrator.address,
        BASE_AMOUNT,
        CONTINGENCY,
        DOWN_PAYMENT_PCT,
        RETENTION_PCT,
        MILESTONE_PCTS,
        MILESTONE_DESCRIPTIONS
      );

      const milestones = await renovationEscrow.getMilestones(0);
      expect(milestones.length).to.equal(3);
    });
  });

  describe("Project Approval & Funding", function () {
    beforeEach(async function () {
      const inspectorSolanaAddress = ethers.encodeBytes32String("SolanaAddress123");

      await renovationEscrow.connect(contractor).createProject(
        homeowner.address,
        inspectorSolanaAddress,
        arbitrator.address,
        BASE_AMOUNT,
        CONTINGENCY,
        DOWN_PAYMENT_PCT,
        RETENTION_PCT,
        MILESTONE_PCTS,
        MILESTONE_DESCRIPTIONS
      );
    });

    it("Should allow homeowner to approve project", async function () {
      await expect(renovationEscrow.connect(homeowner).approveProject(0))
        .to.emit(renovationEscrow, "ProjectApproved")
        .withArgs(0, homeowner.address);

      const project = await renovationEscrow.getProject(0);
      expect(project.status).to.equal(1); // InProgress
    });

    it("Should allow homeowner to deposit funds", async function () {
      await renovationEscrow.connect(homeowner).approveProject(0);

      await expect(
        renovationEscrow.connect(homeowner).depositToEscrow(0, { value: TOTAL_AMOUNT })
      )
        .to.emit(renovationEscrow, "FundsDeposited")
        .withArgs(0, TOTAL_AMOUNT);

      const project = await renovationEscrow.getProject(0);
      expect(project.fundsDeposited).to.be.true;
    });

    it("Should pay down payment and start project", async function () {
      await renovationEscrow.connect(homeowner).approveProject(0);
      await renovationEscrow.connect(homeowner).depositToEscrow(0, { value: TOTAL_AMOUNT });

      const downPayment = (BASE_AMOUNT * BigInt(DOWN_PAYMENT_PCT)) / 100n;

      await expect(renovationEscrow.connect(homeowner).payDownPaymentAndStart(0))
        .to.emit(renovationEscrow, "ProjectStarted")
        .withArgs(0, downPayment);

      const project = await renovationEscrow.getProject(0);
      expect(project.projectStarted).to.be.true;
    });
  });

  describe("Milestone Submission & Approval", function () {
    beforeEach(async function () {
      const inspectorSolanaAddress = ethers.encodeBytes32String("SolanaAddress123");

      await renovationEscrow.connect(contractor).createProject(
        homeowner.address,
        inspectorSolanaAddress,
        arbitrator.address,
        BASE_AMOUNT,
        CONTINGENCY,
        DOWN_PAYMENT_PCT,
        RETENTION_PCT,
        MILESTONE_PCTS,
        MILESTONE_DESCRIPTIONS
      );

      await renovationEscrow.connect(homeowner).approveProject(0);
      await renovationEscrow.connect(homeowner).depositToEscrow(0, { value: TOTAL_AMOUNT });
      await renovationEscrow.connect(homeowner).payDownPaymentAndStart(0);
    });

    it("Should allow contractor to submit milestone", async function () {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-data"));

      await expect(renovationEscrow.connect(contractor).submitMilestone(0, 0, proofHash))
        .to.emit(renovationEscrow, "MilestoneSubmitted")
        .withArgs(0, 0, proofHash);

      const milestone = await renovationEscrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(2); // Submitted
    });

    it("Should allow inspector to approve milestone", async function () {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-data"));

      await renovationEscrow.connect(contractor).submitMilestone(0, 0, proofHash);

      const milestone = await renovationEscrow.getMilestone(0, 0);
      const contractorAmount = (milestone.amount * 90n) / 100n;
      const inspectorAmount = milestone.amount - contractorAmount;

      await expect(renovationEscrow.connect(inspector).approveMilestone(0, 0))
        .to.emit(renovationEscrow, "MilestoneApproved")
        .withArgs(0, 0, contractorAmount, inspectorAmount);
    });

    it("Should allow inspector to reject milestone", async function () {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-data"));
      const reason = "Work not completed properly";

      await renovationEscrow.connect(contractor).submitMilestone(0, 0, proofHash);

      await expect(renovationEscrow.connect(inspector).rejectMilestone(0, 0, reason))
        .to.emit(renovationEscrow, "MilestoneRejected")
        .withArgs(0, 0, reason);

      const milestone = await renovationEscrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(4); // Rejected
    });
  });

  describe("Change Orders", function () {
    beforeEach(async function () {
      const inspectorSolanaAddress = ethers.encodeBytes32String("SolanaAddress123");

      await renovationEscrow.connect(contractor).createProject(
        homeowner.address,
        inspectorSolanaAddress,
        arbitrator.address,
        BASE_AMOUNT,
        CONTINGENCY,
        DOWN_PAYMENT_PCT,
        RETENTION_PCT,
        MILESTONE_PCTS,
        MILESTONE_DESCRIPTIONS
      );

      await renovationEscrow.connect(homeowner).approveProject(0);
      await renovationEscrow.connect(homeowner).depositToEscrow(0, { value: TOTAL_AMOUNT });
      await renovationEscrow.connect(homeowner).payDownPaymentAndStart(0);
    });

    it("Should allow contractor to propose change order", async function () {
      const changeAmount = ethers.parseEther("2");
      const documentHash = ethers.keccak256(ethers.toUtf8Bytes("change-order-doc"));
      const reason = "Additional electrical work required";

      await expect(
        renovationEscrow.connect(contractor).proposeChangeOrder(
          0,
          0,
          changeAmount,
          documentHash,
          reason
        )
      )
        .to.emit(renovationEscrow, "ChangeOrderProposed")
        .withArgs(0, 0, changeAmount);
    });

    it("Should allow homeowner to approve change order", async function () {
      const changeAmount = ethers.parseEther("2");
      const documentHash = ethers.keccak256(ethers.toUtf8Bytes("change-order-doc"));
      const reason = "Additional work required";

      await renovationEscrow.connect(contractor).proposeChangeOrder(
        0,
        0,
        changeAmount,
        documentHash,
        reason
      );

      await expect(renovationEscrow.connect(homeowner).approveChangeOrder(0, 0))
        .to.emit(renovationEscrow, "ChangeOrderApproved")
        .withArgs(0, 0);
    });
  });
});
