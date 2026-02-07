// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title RenovationEscrow
 * @notice Smart contract for managing construction project payments with escrow and milestone-based releases
 * @dev Built for Arc Testnet - Uses USDC as native gas token
 */
contract RenovationEscrow {
    // ============ Enums ============

    enum ProjectStatus {
        Pending,        // Waiting for homeowner approval
        InProgress,     // Project is active
        Completed,      // All milestones completed
        Frozen          // Dispute/arbitration
    }

    enum MilestoneStatus {
        Locked,         // Not yet started
        InProgress,     // Currently active
        Submitted,      // Contractor submitted proof
        Approved,       // Inspector approved
        Rejected,       // Inspector rejected
        Paid            // Payment released
    }

    // ============ Structs ============

    struct Milestone {
        uint256 amount;              // USDC amount for this milestone
        uint256 percentage;          // Percentage of base budget
        MilestoneStatus status;      // Current status
        bytes32 proofHash;           // Hash of uploaded proof documents
        string description;          // Milestone description
    }

    struct ChangeOrder {
        uint256 milestoneId;         // Related milestone
        uint256 amount;              // Additional amount requested
        bytes32 documentHash;        // Hash of change order documents
        string reason;               // Reason for change
        bool approved;               // Approval status
        bool processed;              // Whether funds have been released
    }

    struct Project {
        uint256 id;
        address homeowner;                   // Homeowner operating & payment wallet (Arc)
        address contractor;                  // Contractor operating & payment wallet (Arc)
        address inspectorOperatingAddress;   // Inspector operating wallet (Arc) - for login
        bytes32 inspectorPaymentAddress;     // Inspector payment wallet (Base Sepolia) - bytes32
        address arbitrator;                  // Arbitrator operating & payment wallet (Arc)

        uint256 baseAmount;                  // Base project budget
        uint256 contingency;                 // Contingency fund
        uint256 downPayment;                 // Down payment amount
        uint256 retention;                   // Retention amount

        ProjectStatus status;
        uint256 currentMilestone;            // Current active milestone

        bool fundsDeposited;                 // Whether homeowner deposited funds
        bool projectStarted;                 // Whether down payment was paid
        uint256 contingencyUsed;             // Amount of contingency used

        uint256 createdAt;
        uint256 completedAt;
    }

    // ============ State Variables ============

    uint256 public projectCounter;

    mapping(uint256 => Project) public projects;
    mapping(uint256 => Milestone[]) public projectMilestones;
    mapping(uint256 => ChangeOrder[]) public projectChangeOrders;
    mapping(uint256 => mapping(uint256 => string)) public milestoneRejectionReasons;

    // ============ Events ============

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed contractor,
        address indexed homeowner,
        uint256 totalAmount
    );

    event ProjectApproved(uint256 indexed projectId, address indexed homeowner);
    event FundsDeposited(uint256 indexed projectId, uint256 amount);
    event ProjectStarted(uint256 indexed projectId, uint256 downPayment);

    event MilestoneSubmitted(
        uint256 indexed projectId,
        uint256 indexed milestoneId,
        bytes32 proofHash
    );

    event MilestoneApproved(
        uint256 indexed projectId,
        uint256 indexed milestoneId,
        uint256 contractorAmount,
        uint256 inspectorAmount
    );

    event MilestoneRejected(
        uint256 indexed projectId,
        uint256 indexed milestoneId,
        string reason
    );

    event MilestonePaid(
        uint256 indexed projectId,
        uint256 indexed milestoneId,
        address indexed recipient,
        uint256 amount
    );

    event ChangeOrderProposed(
        uint256 indexed projectId,
        uint256 indexed changeOrderId,
        uint256 amount
    );

    event ChangeOrderApproved(
        uint256 indexed projectId,
        uint256 indexed changeOrderId
    );

    event ProjectCompleted(uint256 indexed projectId);

    // ============ Modifiers ============

    modifier onlyHomeowner(uint256 _projectId) {
        require(msg.sender == projects[_projectId].homeowner, "Only homeowner");
        _;
    }

    modifier onlyContractor(uint256 _projectId) {
        require(msg.sender == projects[_projectId].contractor, "Only contractor");
        _;
    }

    modifier onlyInspector(uint256 _projectId) {
        require(msg.sender == projects[_projectId].inspectorOperatingAddress, "Only inspector");
        _;
    }

    modifier projectExists(uint256 _projectId) {
        require(_projectId < projectCounter, "Project does not exist");
        _;
    }

    modifier projectInProgress(uint256 _projectId) {
        require(projects[_projectId].status == ProjectStatus.InProgress, "Project not in progress");
        _;
    }

    // ============ Constructor ============

    constructor() {
        projectCounter = 0;
    }

    // ============ Core Functions ============

    /**
     * @notice Create a new renovation project
     * @param _homeowner Address of the homeowner (operating & payment wallet on Arc)
     * @param _inspectorOperating Inspector's operating wallet on Arc (for login)
     * @param _inspectorPayment Inspector's payment wallet on Base Sepolia (as bytes32)
     * @param _arbitrator Address of arbitrator (operating & payment wallet on Arc)
     * @param _baseAmount Base project budget in USDC
     * @param _contingency Contingency fund amount
     * @param _downPaymentPct Down payment percentage (0-100)
     * @param _retentionPct Retention percentage (0-100)
     * @param _milestonePcts Array of milestone percentages
     * @param _milestoneDescriptions Array of milestone descriptions
     */
    function createProject(
        address _homeowner,
        address _inspectorOperating,
        bytes32 _inspectorPayment,
        address _arbitrator,
        uint256 _baseAmount,
        uint256 _contingency,
        uint256 _downPaymentPct,
        uint256 _retentionPct,
        uint256[] memory _milestonePcts,
        string[] memory _milestoneDescriptions
    ) external returns (uint256) {
        require(_homeowner != address(0), "Invalid homeowner address");
        require(_inspectorOperating != address(0), "Invalid inspector operating address");
        require(_inspectorPayment != bytes32(0), "Invalid inspector payment address");
        require(_arbitrator != address(0), "Invalid arbitrator address");
        require(_milestonePcts.length == _milestoneDescriptions.length, "Milestone data mismatch");
        require(_milestonePcts.length > 0, "At least one milestone required");

        // Validate percentages add up correctly
        uint256 totalPct = _downPaymentPct + _retentionPct;
        for (uint256 i = 0; i < _milestonePcts.length; i++) {
            totalPct += _milestonePcts[i];
        }
        require(totalPct == 100, "Percentages must sum to 100");

        uint256 projectId = projectCounter++;

        // Calculate amounts
        uint256 downPayment = (_baseAmount * _downPaymentPct) / 100;
        uint256 retention = (_baseAmount * _retentionPct) / 100;

        // Create project
        projects[projectId] = Project({
            id: projectId,
            homeowner: _homeowner,
            contractor: msg.sender,
            inspectorOperatingAddress: _inspectorOperating,
            inspectorPaymentAddress: _inspectorPayment,
            arbitrator: _arbitrator,
            baseAmount: _baseAmount,
            contingency: _contingency,
            downPayment: downPayment,
            retention: retention,
            status: ProjectStatus.Pending,
            currentMilestone: 0,
            fundsDeposited: false,
            projectStarted: false,
            contingencyUsed: 0,
            createdAt: block.timestamp,
            completedAt: 0
        });

        // Create milestones
        for (uint256 i = 0; i < _milestonePcts.length; i++) {
            uint256 milestoneAmount = (_baseAmount * _milestonePcts[i]) / 100;

            projectMilestones[projectId].push(Milestone({
                amount: milestoneAmount,
                percentage: _milestonePcts[i],
                status: MilestoneStatus.Locked,
                proofHash: bytes32(0),
                description: _milestoneDescriptions[i]
            }));
        }

        emit ProjectCreated(projectId, msg.sender, _homeowner, _baseAmount + _contingency);

        return projectId;
    }

    /**
     * @notice Homeowner approves the project
     */
    function approveProject(uint256 _projectId)
        external
        onlyHomeowner(_projectId)
        projectExists(_projectId)
    {
        require(projects[_projectId].status == ProjectStatus.Pending, "Project already approved");

        projects[_projectId].status = ProjectStatus.InProgress;

        emit ProjectApproved(_projectId, msg.sender);
    }

    /**
     * @notice Homeowner deposits total funds into escrow
     */
    function depositToEscrow(uint256 _projectId)
        external
        payable
        onlyHomeowner(_projectId)
        projectExists(_projectId)
    {
        Project storage project = projects[_projectId];
        require(project.status == ProjectStatus.InProgress, "Project not approved");
        require(!project.fundsDeposited, "Funds already deposited");

        uint256 totalAmount = project.baseAmount + project.contingency;
        require(msg.value == totalAmount, "Incorrect deposit amount");

        project.fundsDeposited = true;

        emit FundsDeposited(_projectId, msg.value);
    }

    /**
     * @notice Pay down payment and start the project
     */
    function payDownPaymentAndStart(uint256 _projectId)
        external
        onlyHomeowner(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        Project storage project = projects[_projectId];
        require(project.fundsDeposited, "Funds not deposited");
        require(!project.projectStarted, "Project already started");

        // Pay down payment to contractor
        payable(project.contractor).transfer(project.downPayment);

        // Unlock first milestone
        projectMilestones[_projectId][0].status = MilestoneStatus.InProgress;

        project.projectStarted = true;
        project.currentMilestone = 0;

        emit ProjectStarted(_projectId, project.downPayment);
        emit MilestonePaid(_projectId, 0, project.contractor, project.downPayment);
    }

    /**
     * @notice Contractor submits milestone completion proof
     */
    function submitMilestone(
        uint256 _projectId,
        uint256 _milestoneId,
        bytes32 _proofHash
    )
        external
        onlyContractor(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        require(_milestoneId < projectMilestones[_projectId].length, "Invalid milestone");
        Milestone storage milestone = projectMilestones[_projectId][_milestoneId];

        require(milestone.status == MilestoneStatus.InProgress, "Milestone not in progress");
        require(_proofHash != bytes32(0), "Invalid proof hash");

        milestone.status = MilestoneStatus.Submitted;
        milestone.proofHash = _proofHash;

        emit MilestoneSubmitted(_projectId, _milestoneId, _proofHash);
    }

    /**
     * @notice Inspector approves milestone
     * @dev This triggers payment: 90% to contractor (on-chain), 10% to inspector (cross-chain via Bridge Kit)
     */
    function approveMilestone(
        uint256 _projectId,
        uint256 _milestoneId
    )
        external
        onlyInspector(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        require(_milestoneId < projectMilestones[_projectId].length, "Invalid milestone");
        Milestone storage milestone = projectMilestones[_projectId][_milestoneId];

        require(milestone.status == MilestoneStatus.Submitted, "Milestone not submitted");

        milestone.status = MilestoneStatus.Approved;

        Project storage project = projects[_projectId];

        // Calculate payment split (90% contractor, 10% inspector)
        uint256 contractorAmount = (milestone.amount * 90) / 100;
        uint256 inspectorAmount = milestone.amount - contractorAmount;

        // Pay contractor immediately (on Arc)
        payable(project.contractor).transfer(contractorAmount);
        milestone.status = MilestoneStatus.Paid;

        emit MilestoneApproved(_projectId, _milestoneId, contractorAmount, inspectorAmount);
        emit MilestonePaid(_projectId, _milestoneId, project.contractor, contractorAmount);

        // Note: Inspector payment (inspectorAmount) will be handled off-chain via Bridge Kit
        // The frontend will listen to MilestoneApproved event and trigger cross-chain transfer

        // Move to next milestone or complete project
        if (_milestoneId < projectMilestones[_projectId].length - 1) {
            projectMilestones[_projectId][_milestoneId + 1].status = MilestoneStatus.InProgress;
            project.currentMilestone = _milestoneId + 1;
        } else {
            // All milestones completed
            project.status = ProjectStatus.Completed;
            project.completedAt = block.timestamp;

            // Pay retention to contractor
            payable(project.contractor).transfer(project.retention);

            // Return unused contingency to homeowner
            uint256 unusedContingency = project.contingency - project.contingencyUsed;
            if (unusedContingency > 0) {
                payable(project.homeowner).transfer(unusedContingency);
            }

            emit ProjectCompleted(_projectId);
        }
    }

    /**
     * @notice Inspector rejects milestone
     */
    function rejectMilestone(
        uint256 _projectId,
        uint256 _milestoneId,
        string memory _reason
    )
        external
        onlyInspector(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        require(_milestoneId < projectMilestones[_projectId].length, "Invalid milestone");
        Milestone storage milestone = projectMilestones[_projectId][_milestoneId];

        require(milestone.status == MilestoneStatus.Submitted, "Milestone not submitted");
        require(bytes(_reason).length > 0, "Rejection reason required");

        milestone.status = MilestoneStatus.Rejected;
        milestoneRejectionReasons[_projectId][_milestoneId] = _reason;

        emit MilestoneRejected(_projectId, _milestoneId, _reason);
    }

    /**
     * @notice Contractor resubmits rejected milestone
     */
    function resubmitMilestone(
        uint256 _projectId,
        uint256 _milestoneId,
        bytes32 _newProofHash
    )
        external
        onlyContractor(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        require(_milestoneId < projectMilestones[_projectId].length, "Invalid milestone");
        Milestone storage milestone = projectMilestones[_projectId][_milestoneId];

        require(milestone.status == MilestoneStatus.Rejected, "Milestone not rejected");
        require(_newProofHash != bytes32(0), "Invalid proof hash");

        milestone.status = MilestoneStatus.Submitted;
        milestone.proofHash = _newProofHash;

        emit MilestoneSubmitted(_projectId, _milestoneId, _newProofHash);
    }

    /**
     * @notice Contractor proposes a change order
     */
    function proposeChangeOrder(
        uint256 _projectId,
        uint256 _milestoneId,
        uint256 _amount,
        bytes32 _documentHash,
        string memory _reason
    )
        external
        onlyContractor(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
        returns (uint256)
    {
        Project storage project = projects[_projectId];
        require(_amount > 0, "Amount must be greater than 0");
        require(project.contingencyUsed + _amount <= project.contingency, "Exceeds contingency");
        require(bytes(_reason).length > 0, "Reason required");

        uint256 changeOrderId = projectChangeOrders[_projectId].length;

        projectChangeOrders[_projectId].push(ChangeOrder({
            milestoneId: _milestoneId,
            amount: _amount,
            documentHash: _documentHash,
            reason: _reason,
            approved: false,
            processed: false
        }));

        emit ChangeOrderProposed(_projectId, changeOrderId, _amount);

        return changeOrderId;
    }

    /**
     * @notice Homeowner approves change order
     */
    function approveChangeOrder(
        uint256 _projectId,
        uint256 _changeOrderId
    )
        external
        onlyHomeowner(_projectId)
        projectExists(_projectId)
        projectInProgress(_projectId)
    {
        require(_changeOrderId < projectChangeOrders[_projectId].length, "Invalid change order");

        ChangeOrder storage changeOrder = projectChangeOrders[_projectId][_changeOrderId];
        require(!changeOrder.approved, "Already approved");
        require(!changeOrder.processed, "Already processed");

        Project storage project = projects[_projectId];
        require(project.contingencyUsed + changeOrder.amount <= project.contingency, "Exceeds contingency");

        changeOrder.approved = true;
        changeOrder.processed = true;

        // Pay from contingency
        project.contingencyUsed += changeOrder.amount;
        payable(project.contractor).transfer(changeOrder.amount);

        emit ChangeOrderApproved(_projectId, _changeOrderId);
    }

    // ============ View Functions ============

    function getProject(uint256 _projectId) external view returns (Project memory) {
        return projects[_projectId];
    }

    function getMilestones(uint256 _projectId) external view returns (Milestone[] memory) {
        return projectMilestones[_projectId];
    }

    function getMilestone(uint256 _projectId, uint256 _milestoneId) external view returns (Milestone memory) {
        return projectMilestones[_projectId][_milestoneId];
    }

    function getChangeOrders(uint256 _projectId) external view returns (ChangeOrder[] memory) {
        return projectChangeOrders[_projectId];
    }

    function getProjectCount() external view returns (uint256) {
        return projectCounter;
    }

    function getRejectionReason(uint256 _projectId, uint256 _milestoneId) external view returns (string memory) {
        return milestoneRejectionReasons[_projectId][_milestoneId];
    }
}
