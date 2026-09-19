// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ConservationAgreement.sol";

/**
 * @title AgreementFactoryRegistry
 * @notice Multitenant factory and registry that deploys and indexes ConservationAgreement instances on HSK Chain.
 */
contract AgreementFactoryRegistry {
    struct AgreementRecord {
        uint256 id;
        address agreementAddress;
        address payer;
        bytes32 projectRefHash;
        bytes32 metadataHash;
        uint64 createdAt;
    }

    uint256 public agreementCount;
    mapping(uint256 => AgreementRecord) public agreements;
    mapping(address => bool) public isRegisteredAgreement;

    event AgreementCreated(
        uint256 indexed id,
        address indexed agreementAddress,
        address indexed payer,
        bytes32 projectRefHash,
        bytes32 metadataHash
    );

    struct CreateAgreementInput {
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

    /**
     * @notice Deploys a new ConservationAgreement instance with msg.sender as the immutable payer.
     */
    function createAgreement(CreateAgreementInput calldata input) external returns (address agreementAddress) {
        // The factory caller is always the payer; it is never taken from the request.
        // Fields are assigned one by one (not as a struct literal) to keep the stack shallow.
        ConservationAgreement.Params memory p;
        p.payer = msg.sender;
        p.communitySigner = input.communitySigner;
        p.verifierSigner = input.verifierSigner;
        p.token = input.token;
        p.projectRefHash = input.projectRefHash;
        p.metadataHash = input.metadataHash;
        p.methodologyHash = input.methodologyHash;
        p.payeeCommunity = input.payeeCommunity;
        p.payeeMonitoring = input.payeeMonitoring;
        p.communityBps = input.communityBps;
        p.milestoneAmounts = input.milestoneAmounts;
        p.fundingDeadline = input.fundingDeadline;
        p.executionDeadline = input.executionDeadline;
        p.demoMode = input.demoMode;

        ConservationAgreement agreement = new ConservationAgreement(p);

        agreementAddress = address(agreement);
        uint256 id = agreementCount;

        agreements[id] = AgreementRecord({
            id: id,
            agreementAddress: agreementAddress,
            payer: msg.sender,
            projectRefHash: input.projectRefHash,
            metadataHash: input.metadataHash,
            createdAt: uint64(block.timestamp)
        });

        isRegisteredAgreement[agreementAddress] = true;
        agreementCount++;

        emit AgreementCreated(
            id,
            agreementAddress,
            msg.sender,
            input.projectRefHash,
            input.metadataHash
        );
    }

    /**
     * @notice Fetch agreement record by ID.
     */
    function getAgreement(uint256 id) external view returns (AgreementRecord memory) {
        require(id < agreementCount, "Agreement does not exist");
        return agreements[id];
    }
}
