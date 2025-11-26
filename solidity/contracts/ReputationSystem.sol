// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ReputationSystem is Ownable {
    
    uint256 public constant MIN_GUIDED_POOL_REPUTATION = 40;
    uint256 public constant MIN_OPEN_POOL_REPUTATION = 100;
    uint256 public constant MIN_OUTCOME_PROPOSAL_REPUTATION = 100;
    uint256 public constant MIN_PREMIUM_FEATURES_REPUTATION = 300;
    uint256 public constant DEFAULT_REPUTATION = 40;
    uint256 public constant MAX_REPUTATION = 500;
    
    mapping(address => uint256) public userReputation;
    mapping(address => uint256) public influenceScore;
    mapping(address => uint256) public socialEngagement;
    mapping(address => uint256) public predictionStreak;
    mapping(address => uint256) public longestStreak;
    mapping(address => bool) public isVerifiedCreator;
    mapping(address => uint256) public totalActions;
    mapping(address => uint256) public successfulActions;
    
    mapping(address => mapping(string => uint256)) public actionCounts;
    mapping(address => uint256) public lastActionTime;
    
    mapping(address => bool) public authorizedUpdaters;
    mapping(address => bool) public authorizedContracts;
    
    enum ReputationAction {
        POOL_CREATED,
        BET_PLACED,
        BET_WON,
        BET_WON_HIGH_VALUE,
        BET_WON_MASSIVE,
        POOL_FILLED_ABOVE_60,
        POOL_SPAMMED,
        OUTCOME_PROPOSED_CORRECTLY,
        OUTCOME_PROPOSED_INCORRECTLY,
        CHALLENGE_SUCCESSFUL,
        CHALLENGE_FAILED,
        LIQUIDITY_PROVIDED,
        LIQUIDITY_REMOVED,
        SOCIAL_ENGAGEMENT,
        COMMUNITY_CONTRIBUTION,
        SPAM_DETECTED,
        ABUSE_DETECTED,
        VERIFICATION_GRANTED,
        VERIFICATION_REVOKED,
        ODDYSSEY_PARTICIPATION,
        ODDYSSEY_QUALIFYING,
        ODDYSSEY_EXCELLENT,
        ODDYSSEY_OUTSTANDING,
        ODDYSSEY_PERFECT,
        ODDYSSEY_WINNER,
        ODDYSSEY_CHAMPION
    }
    
    event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation, string reason);
    event ReputationActionRecorded(address indexed user, ReputationAction action, uint256 points, string details);
    event AuthorizedUpdaterSet(address indexed updater, bool authorized);
    event AuthorizedContractSet(address indexed contractAddr, bool authorized);
    event UserVerified(address indexed user, bool verified);
    
    mapping(ReputationAction => int256) public reputationPoints;
    
    constructor() Ownable(msg.sender) {
        reputationPoints[ReputationAction.POOL_CREATED] = 4;
        reputationPoints[ReputationAction.BET_PLACED] = 2;
        reputationPoints[ReputationAction.BET_WON] = 3;
        reputationPoints[ReputationAction.BET_WON_HIGH_VALUE] = 8;
        reputationPoints[ReputationAction.BET_WON_MASSIVE] = 15;
        reputationPoints[ReputationAction.POOL_FILLED_ABOVE_60] = 8;
        reputationPoints[ReputationAction.POOL_SPAMMED] = -15;
        reputationPoints[ReputationAction.OUTCOME_PROPOSED_CORRECTLY] = 12;
        reputationPoints[ReputationAction.OUTCOME_PROPOSED_INCORRECTLY] = -20;
        reputationPoints[ReputationAction.CHALLENGE_SUCCESSFUL] = 10;
        reputationPoints[ReputationAction.CHALLENGE_FAILED] = -12;
        reputationPoints[ReputationAction.LIQUIDITY_PROVIDED] = 2;
        reputationPoints[ReputationAction.LIQUIDITY_REMOVED] = -1;
        reputationPoints[ReputationAction.SOCIAL_ENGAGEMENT] = 1;
        reputationPoints[ReputationAction.COMMUNITY_CONTRIBUTION] = 3;
        reputationPoints[ReputationAction.SPAM_DETECTED] = -50;
        reputationPoints[ReputationAction.ABUSE_DETECTED] = -100;
        reputationPoints[ReputationAction.VERIFICATION_GRANTED] = 20;
        reputationPoints[ReputationAction.VERIFICATION_REVOKED] = -20;
        
        reputationPoints[ReputationAction.ODDYSSEY_PARTICIPATION] = 1;
        reputationPoints[ReputationAction.ODDYSSEY_QUALIFYING] = 3;
        reputationPoints[ReputationAction.ODDYSSEY_EXCELLENT] = 4;
        reputationPoints[ReputationAction.ODDYSSEY_OUTSTANDING] = 6;
        reputationPoints[ReputationAction.ODDYSSEY_PERFECT] = 8;
        reputationPoints[ReputationAction.ODDYSSEY_WINNER] = 10;
        reputationPoints[ReputationAction.ODDYSSEY_CHAMPION] = 15;
    }
    
    function setAuthorizedUpdater(address updater, bool authorized) external onlyOwner {
        authorizedUpdaters[updater] = authorized;
        emit AuthorizedUpdaterSet(updater, authorized);
    }
    
    function setAuthorizedContract(address contractAddr, bool authorized) external onlyOwner {
        authorizedContracts[contractAddr] = authorized;
        emit AuthorizedContractSet(contractAddr, authorized);
    }
    
    function updateReputation(address user, uint256 newReputation) external {
        require(authorizedUpdaters[msg.sender] || authorizedContracts[msg.sender], "Not authorized");
        require(newReputation <= MAX_REPUTATION, "Reputation exceeds maximum");
        
        if (newReputation > 0 && newReputation < DEFAULT_REPUTATION) {
            revert("Cannot set reputation below 40. Use 0 to reset to default or set >= 40");
        }
        
        uint256 oldReputation = userReputation[user];
        userReputation[user] = newReputation;
        
        emit ReputationUpdated(user, oldReputation, newReputation, "Manual update");
    }
    
    function recordReputationAction(address user, ReputationAction action, string memory details) external {
        require(authorizedUpdaters[msg.sender] || authorizedContracts[msg.sender], "Not authorized");
        
        int256 points = reputationPoints[action];
        
        uint256 currentReputation = userReputation[user] == 0 ? DEFAULT_REPUTATION : userReputation[user];
        uint256 newReputation;
        
        if (points > 0) {
            newReputation = currentReputation + uint256(points);
            if (newReputation > MAX_REPUTATION) {
                newReputation = MAX_REPUTATION;
            }
        } else {
            if (currentReputation >= uint256(-points)) {
                newReputation = currentReputation - uint256(-points);
            } else {
                newReputation = 0;
            }
        }
        
        userReputation[user] = newReputation;
        totalActions[user]++;
        lastActionTime[user] = block.timestamp;
        
        if (points > 0) {
            successfulActions[user]++;
        }
        
        if (points >= 0) {
            emit ReputationActionRecorded(user, action, uint256(points), details);
        } else {
            emit ReputationActionRecorded(user, action, uint256(-points), details);
        }
        emit ReputationUpdated(user, currentReputation, newReputation, "Action recorded");
    }
    
    function batchUpdateReputation(address[] calldata users, uint256[] calldata reputations) external {
        require(authorizedUpdaters[msg.sender] || authorizedContracts[msg.sender], "Not authorized");
        require(users.length == reputations.length, "Array length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            require(reputations[i] <= MAX_REPUTATION, "Reputation exceeds maximum");
            userReputation[users[i]] = reputations[i];
        }
    }
    
    function setUserVerified(address user, bool verified) external onlyOwner {
        isVerifiedCreator[user] = verified;
        emit UserVerified(user, verified);
    }
    
    function getUserReputationData(address user) external view returns (
        uint256 reputation,
        uint256 influenceScoreValue,
        uint256 socialEngagementValue,
        uint256 predictionStreakValue,
        uint256 longestStreakValue,
        bool verified,
        uint256 totalActionsCount,
        uint256 successfulActionsCount,
        uint256 successRate
    ) {
        reputation = userReputation[user] == 0 ? DEFAULT_REPUTATION : userReputation[user];
        influenceScoreValue = influenceScore[user];
        socialEngagementValue = socialEngagement[user];
        predictionStreakValue = predictionStreak[user];
        longestStreakValue = longestStreak[user];
        verified = isVerifiedCreator[user];
        totalActionsCount = totalActions[user];
        successfulActionsCount = successfulActions[user];
        successRate = totalActionsCount > 0 ? (successfulActionsCount * 100) / totalActionsCount : 0;
    }
    
    function _getNormalizedReputation(address user) internal view returns (uint256) {
        uint256 rawReputation = userReputation[user];
        if (rawReputation == 0) {
            return DEFAULT_REPUTATION;
        } else if (rawReputation < DEFAULT_REPUTATION) {
            return DEFAULT_REPUTATION;
        } else {
            return rawReputation;
        }
    }

    function getUserReputation(address user) external view returns (uint256) {
        return _getNormalizedReputation(user);
    }
    
    function canCreateGuidedPool(address user) external view returns (bool) {
        return _getNormalizedReputation(user) >= MIN_GUIDED_POOL_REPUTATION;
    }
    
    function canCreateOpenPool(address user) external view returns (bool) {
        return _getNormalizedReputation(user) >= MIN_OPEN_POOL_REPUTATION;
    }
    
    function canProposeOutcome(address user) external view returns (bool) {
        return _getNormalizedReputation(user) >= MIN_OUTCOME_PROPOSAL_REPUTATION;
    }

    function getReputationBundle(address user) external view returns (
        uint256 reputation,
        bool canCreateGuided,
        bool canCreateOpen,
        bool canPropose
    ) {
        reputation = _getNormalizedReputation(user);
        canCreateGuided = reputation >= MIN_GUIDED_POOL_REPUTATION;
        canCreateOpen = reputation >= MIN_OPEN_POOL_REPUTATION;
        canPropose = reputation >= MIN_OUTCOME_PROPOSAL_REPUTATION;
    }
    
    function getReputationThresholds() external pure returns (
        uint256 minGuided,
        uint256 minOpen,
        uint256 minProposal,
        uint256 minPremium,
        uint256 defaultRep,
        uint256 maxRep
    ) {
        return (
            MIN_GUIDED_POOL_REPUTATION,
            MIN_OPEN_POOL_REPUTATION,
            MIN_OUTCOME_PROPOSAL_REPUTATION,
            MIN_PREMIUM_FEATURES_REPUTATION,
            DEFAULT_REPUTATION,
            MAX_REPUTATION
        );
    }
    
    function isAuthorized(address caller) external view returns (bool) {
        return authorizedUpdaters[caller] || authorizedContracts[caller];
    }
}