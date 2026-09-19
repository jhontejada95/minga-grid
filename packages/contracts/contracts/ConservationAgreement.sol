// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConservationAgreement
 * @notice Individual escrow contract for a conservation project with two sequential milestones.
 * Release of milestone funds requires dual EIP-712 signatures from both the community representative
 * and the independent reviewer.
 */
contract ConservationAgreement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MILESTONE_APPROVAL_TYPEHASH = keccak256(
        "MilestoneApproval(uint256 milestoneId,bytes32 termsHash,bytes32 evidenceHash,uint256 amount,uint256 nonce,uint64 signedAt,uint64 validUntil,bool demoMode)"
    );

    struct MilestoneApproval {
        uint256 milestoneId;
        bytes32 termsHash;
        bytes32 evidenceHash;
        uint256 amount;
        uint256 nonce;
        uint64 signedAt;
        uint64 validUntil;
        bool demoMode;
    }

    struct MilestoneReceipt {
        uint256 milestoneId;
        bytes32 evidenceHash;
        bytes32 termsHash;
        address payeeCommunity;
        address payeeMonitoring;
        uint256 communityAmount;
        uint256 monitoringAmount;
        uint64 paidAt;
    }

    // Immutable agreement terms
    address public immutable payer;
    address public immutable communitySigner;
    address public immutable verifierSigner;
    address public immutable token;
    bytes32 public immutable projectRefHash;
    bytes32 public immutable metadataHash;
    bytes32 public immutable methodologyHash;
    address public immutable payeeCommunity;
    address public immutable payeeMonitoring;
    uint256 public immutable communityBps;
    uint256[2] public milestoneAmounts;
    uint64 public immutable fundingDeadline;
    uint64 public immutable executionDeadline;
    bool public immutable demoMode;
    uint256 public immutable totalBudget;
    bytes32 public immutable termsHash;

    // Lifecycle state
    bool public communityAccepted;
    bool public verifierAccepted;
    bool public funded;
    uint64 public fundedAt;
    bool public refunded;
    uint256 public totalPaid;
    uint256 public nextMilestoneId;

    mapping(uint256 => bool) public milestonePaid;
    mapping(uint256 => uint256) public milestoneNonce;
    mapping(uint256 => MilestoneReceipt) public milestoneReceipts;

    // Events
    event TermsAccepted(address indexed participant, bytes32 indexed termsHash);
    event AgreementFunded(address indexed payer, uint256 amount);
    event MilestonePaid(
        uint256 indexed milestoneId,
        bytes32 indexed evidenceHash,
        bytes32 termsHash,
        address payeeCommunity,
        address payeeMonitoring,
        uint256 communityAmount,
        uint256 monitoringAmount,
        uint64 paidAt
    );
    event ApprovalInvalidated(
        uint256 indexed milestoneId,
        address indexed invalidator,
        uint256 newNonce
    );
    event RemainingRefunded(address indexed payer, uint256 amount);

    /**
     * @dev Constructor parameters are passed as one struct to avoid "stack too deep".
     * All members are static types, so `abi.encode(p)` is byte-identical to the flat
     * `abi.encode(payer, communitySigner, ..., demoMode)` and defines the documented
     * `termsHash` schema: field order below is the schema order.
     */
    struct Params {
        address payer;
        address communitySigner;
        address verifierSigner;
        address token;
        bytes32 projectRefHash;
        bytes32 metadataHash;
        bytes32 methodologyHash;
        address payeeCommunity;
        address payeeMonitoring;
        uint256 communityBps;
        uint256[2] milestoneAmounts;
        uint64 fundingDeadline;
        uint64 executionDeadline;
        bool demoMode;
    }

    constructor(Params memory p) EIP712("MingaConservationAgreement", "1") {
        require(p.payer != address(0), "Invalid payer");
        require(p.communitySigner != address(0), "Invalid community signer");
        require(p.verifierSigner != address(0), "Invalid verifier signer");
        require(p.token != address(0) && p.token.code.length > 0, "Invalid token contract");
        require(
            p.payer != p.communitySigner &&
            p.payer != p.verifierSigner &&
            p.communitySigner != p.verifierSigner,
            "Signers and payer must be distinct"
        );
        require(
            p.payeeCommunity != address(0) && p.payeeMonitoring != address(0),
            "Invalid payee addresses"
        );
        require(p.payeeCommunity != p.payeeMonitoring, "Payees must be distinct");
        require(
            p.payeeCommunity != address(this) && p.payeeMonitoring != address(this),
            "Payee cannot be agreement contract"
        );
        require(
            p.milestoneAmounts[0] > 0 && p.milestoneAmounts[1] > 0,
            "Milestone amounts must be positive"
        );
        require(
            p.communityBps > 0 && p.communityBps < 10000,
            "Community bps must be between 1 and 9999"
        );
        require(
            block.timestamp < p.fundingDeadline && p.fundingDeadline < p.executionDeadline,
            "Invalid deadlines"
        );
        require(
            p.projectRefHash != bytes32(0) &&
            p.metadataHash != bytes32(0) &&
            p.methodologyHash != bytes32(0),
            "Required hashes must be non-zero"
        );

        payer = p.payer;
        communitySigner = p.communitySigner;
        verifierSigner = p.verifierSigner;
        token = p.token;
        projectRefHash = p.projectRefHash;
        metadataHash = p.metadataHash;
        methodologyHash = p.methodologyHash;
        payeeCommunity = p.payeeCommunity;
        payeeMonitoring = p.payeeMonitoring;
        communityBps = p.communityBps;
        milestoneAmounts = p.milestoneAmounts;
        fundingDeadline = p.fundingDeadline;
        executionDeadline = p.executionDeadline;
        demoMode = p.demoMode;

        totalBudget = p.milestoneAmounts[0] + p.milestoneAmounts[1];

        termsHash = keccak256(abi.encode(p));
    }

    /**
     * @notice Participant initial acceptance of agreement terms.
     */
    function acceptTerms(bytes32 expectedTermsHash) external {
        require(block.timestamp < fundingDeadline, "Funding deadline passed");
        require(expectedTermsHash == termsHash, "Terms hash mismatch");

        if (msg.sender == communitySigner) {
            communityAccepted = true;
        } else if (msg.sender == verifierSigner) {
            verifierAccepted = true;
        } else {
            revert("Caller not authorized to accept terms");
        }

        emit TermsAccepted(msg.sender, termsHash);
    }

    /**
     * @notice Funds the agreement escrow with the full total budget.
     */
    function fund() external nonReentrant {
        require(msg.sender == payer, "Only payer can fund");
        require(!funded, "Already funded");
        require(block.timestamp < fundingDeadline, "Funding deadline passed");
        require(communityAccepted && verifierAccepted, "Both parties must accept terms before funding");

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalBudget);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        require(balanceAfter - balanceBefore == totalBudget, "Fee-on-transfer unsupported");

        funded = true;
        fundedAt = uint64(block.timestamp);

        emit AgreementFunded(payer, totalBudget);
    }

    /**
     * @notice Releases milestone payment upon verification of dual EIP-712 signatures.
     */
    function release(
        MilestoneApproval calldata approval,
        bytes calldata communitySignature,
        bytes calldata verifierSignature
    ) external nonReentrant {
        require(funded, "Agreement not funded");
        require(!refunded, "Agreement refunded");
        require(approval.milestoneId == nextMilestoneId, "Milestone out of sequence");
        require(approval.milestoneId < 2, "Milestone index invalid");
        require(!milestonePaid[approval.milestoneId], "Milestone already paid");
        require(approval.termsHash == termsHash, "Terms hash mismatch");
        require(approval.amount == milestoneAmounts[approval.milestoneId], "Amount mismatch");
        require(approval.demoMode == demoMode, "Demo mode mismatch");
        require(approval.nonce == milestoneNonce[approval.milestoneId], "Nonce mismatch");
        require(approval.evidenceHash != bytes32(0), "Evidence hash empty");

        require(fundedAt <= approval.signedAt, "Signed before funding");
        require(approval.signedAt <= block.timestamp, "Future signedAt timestamp");
        require(block.timestamp <= approval.validUntil, "Approval expired");
        require(approval.validUntil <= executionDeadline, "Approval validity exceeds deadline");
        require(block.timestamp < executionDeadline, "Execution deadline reached");

        bytes32 structHash = keccak256(
            abi.encode(
                MILESTONE_APPROVAL_TYPEHASH,
                approval.milestoneId,
                approval.termsHash,
                approval.evidenceHash,
                approval.amount,
                approval.nonce,
                approval.signedAt,
                approval.validUntil,
                approval.demoMode
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        require(
            SignatureChecker.isValidSignatureNow(communitySigner, digest, communitySignature),
            "Invalid community signature"
        );
        require(
            SignatureChecker.isValidSignatureNow(verifierSigner, digest, verifierSignature),
            "Invalid verifier signature"
        );

        // State updates before external transfers
        milestonePaid[approval.milestoneId] = true;
        milestoneNonce[approval.milestoneId]++;
        nextMilestoneId++;
        totalPaid += approval.amount;

        uint256 communityAmount = (approval.amount * communityBps) / 10000;
        uint256 monitoringAmount = approval.amount - communityAmount;

        milestoneReceipts[approval.milestoneId] = MilestoneReceipt({
            milestoneId: approval.milestoneId,
            evidenceHash: approval.evidenceHash,
            termsHash: termsHash,
            payeeCommunity: payeeCommunity,
            payeeMonitoring: payeeMonitoring,
            communityAmount: communityAmount,
            monitoringAmount: monitoringAmount,
            paidAt: uint64(block.timestamp)
        });

        IERC20(token).safeTransfer(payeeCommunity, communityAmount);
        IERC20(token).safeTransfer(payeeMonitoring, monitoringAmount);

        emit MilestonePaid(
            approval.milestoneId,
            approval.evidenceHash,
            termsHash,
            payeeCommunity,
            payeeMonitoring,
            communityAmount,
            monitoringAmount,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Invalidates current pending approval signatures by bumping the milestone nonce.
     */
    function invalidateApproval(uint256 milestoneId) external {
        require(
            msg.sender == communitySigner || msg.sender == verifierSigner,
            "Only authorized signers can invalidate"
        );
        require(funded && !refunded, "Agreement not active");
        require(milestoneId < 2 && !milestonePaid[milestoneId], "Milestone invalid or paid");
        require(block.timestamp < executionDeadline, "Execution deadline passed");

        milestoneNonce[milestoneId]++;

        emit ApprovalInvalidated(milestoneId, msg.sender, milestoneNonce[milestoneId]);
    }

    /**
     * @notice Refunds remaining unspent budget to payer after execution deadline has passed.
     */
    function refundRemaining() external nonReentrant {
        require(funded, "Agreement not funded");
        require(!refunded, "Already refunded");
        require(block.timestamp >= executionDeadline, "Execution deadline not reached");

        uint256 remaining = totalBudget - totalPaid;
        require(remaining > 0, "No remaining balance");

        refunded = true;
        IERC20(token).safeTransfer(payer, remaining);

        emit RemainingRefunded(payer, remaining);
    }

    function getMilestoneAmounts() external view returns (uint256[2] memory) {
        return milestoneAmounts;
    }
}
