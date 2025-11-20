// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// Interface for BitredictPool to interact with
interface IBitredictPool {
    function settlePool(uint256 poolId, bytes32 outcome) external;
}

interface IReputationSystem {
    function getUserReputation(address user) external view returns (uint256);
    function canProposeOutcome(address user) external view returns (bool);
}

contract OptimisticOracle is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public immutable bondToken; // BITR token for bonds (STT is native coin)
    IBitredictPool public immutable bitredictPool;
    
    // Oracle configuration
    uint256 public constant PROPOSAL_BOND = 50e18; // 50 BITR bond to propose outcome
    uint256 public constant DISPUTE_BOND = 100e18; // 100 BITR bond to dispute
    uint256 public constant CHALLENGE_WINDOW = 24 hours; // 24h to dispute
    uint256 public constant RESOLUTION_WINDOW = 48 hours; // 48h for community resolution
    uint256 public constant MIN_REPUTATION = 100; // Minimum reputation to propose outcomes
    IReputationSystem public reputationSystem;
    uint256 public constant MIN_DISPUTE_REPUTATION = 75; // Minimum reputation to dispute
    
    // Open market integration
    address public openMarketFactory;
    mapping(bytes32 => bool) public isOpenMarket;
    mapping(bytes32 => uint256) public openMarketId;
    
    // Market states
    enum MarketState {
        PENDING,      // Waiting for outcome proposal
        PROPOSED,     // Outcome proposed, in challenge window
        DISPUTED,     // Outcome disputed, needs resolution
        RESOLVED,     // Final outcome determined
        EXPIRED       // Challenge window expired without dispute
    }
    
    // Market data structure
    struct Market {
        bytes32 marketId;           // Unique market identifier
        uint256 poolId;             // Associated BitredictPool ID
        string question;            // Market question
        string category;            // Market category
        bytes32 proposedOutcome;    // Proposed outcome
        address proposer;           // Address that proposed outcome
        uint256 proposalTime;       // When outcome was proposed
        uint256 proposalBond;       // Bond amount locked by proposer
        address disputer;           // Address that disputed (if any)
        uint256 disputeTime;        // When dispute was raised
        uint256 disputeBond;        // Bond amount locked by disputer
        bytes32 finalOutcome;       // Final resolved outcome
        MarketState state;          // Current market state
        uint256 eventEndTime;       // When the real-world event ended
        bool bondsClaimed;          // Whether bonds have been claimed
    }
    
    // Voting structure for disputed markets
    struct Vote {
        bytes32 outcome;
        uint256 votingPower;        // Based on reputation
        uint256 timestamp;
    }
    
    struct Dispute {
        bytes32 marketId;
        mapping(address => Vote) votes;
        mapping(bytes32 => uint256) outcomeTotals;
        address[] voters;
        uint256 totalVotingPower;
        uint256 disputeEndTime;
        bool resolved;
    }
    
    // Storage
    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => Dispute) public disputes;
    mapping(address => uint256) public userReputation; // Reputation scores
    
    bytes32[] public allMarkets;
    mapping(bytes32 => bytes32[]) public categoryMarkets;
    
    // Events
    event MarketCreated(bytes32 indexed marketId, uint256 indexed poolId, string question, string category, uint256 eventEndTime);
    event OutcomeProposed(bytes32 indexed marketId, address indexed proposer, bytes32 outcome, uint256 bond);
    event OutcomeDisputed(bytes32 indexed marketId, address indexed disputer, uint256 bond);
    event VoteCast(bytes32 indexed marketId, address indexed voter, bytes32 outcome, uint256 votingPower);
    event MarketResolved(bytes32 indexed marketId, bytes32 finalOutcome, address winner, uint256 reward);
    event BondClaimed(bytes32 indexed marketId, address indexed claimer, uint256 amount);
    event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation);
    
    // Reputation actions for tracking
    event ReputationAction(
        address indexed user,
        string action,           // "OUTCOME_PROPOSED_CORRECTLY", "OUTCOME_PROPOSED_INCORRECTLY", etc.
        int256 reputationDelta,
        bytes32 indexed marketId,
        uint256 timestamp
    );

    constructor(address _bondToken, address _bitredictPool) Ownable(msg.sender) {
        bondToken = IERC20(_bondToken);
        bitredictPool = IBitredictPool(_bitredictPool);
    }
    
    /**
     * @dev Set open market factory address
     */
    function setOpenMarketFactory(address _openMarketFactory) external onlyOwner {
        openMarketFactory = _openMarketFactory;
    }
    
    /**
     * @dev Register an open market for oracle resolution
     */
    function registerOpenMarket(bytes32 marketId, uint256 _openMarketId) external {
        require(msg.sender == openMarketFactory, "Only open market factory");
        isOpenMarket[marketId] = true;
        openMarketId[marketId] = _openMarketId;
    }
    
    /**
     * @dev Set the reputation system contract (only owner)
     */
    function setReputationSystem(address _reputationSystem) external onlyOwner {
        reputationSystem = IReputationSystem(_reputationSystem);
    }

    modifier onlyBitredictPool() {
        require(msg.sender == address(bitredictPool), "Only BitredictPool can call");
        _;
    }

    modifier marketExists(bytes32 marketId) {
        require(markets[marketId].marketId != bytes32(0), "Market does not exist");
        _;
    }

    modifier hasReputation(uint256 minReputation) {
        if (address(reputationSystem) != address(0)) {
            require(reputationSystem.getUserReputation(msg.sender) >= minReputation, "Insufficient reputation");
        } else {
            require(userReputation[msg.sender] >= minReputation, "Insufficient reputation");
        }
        _;
    }

    // Create a new market for outcome resolution
    function createMarket(
        string memory marketId,
        uint256 poolId,
        string memory question,
        string memory category,
        uint256 eventEndTime
    ) external onlyBitredictPool {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId == bytes32(0), "Market already exists");
        require(eventEndTime > block.timestamp, "Event end time must be in future");

        markets[marketIdBytes] = Market({
            marketId: marketIdBytes,
            poolId: poolId,
            question: question,
            category: category,
            proposedOutcome: bytes32(0),
            proposer: address(0),
            proposalTime: 0,
            proposalBond: 0,
            disputer: address(0),
            disputeTime: 0,
            disputeBond: 0,
            finalOutcome: bytes32(0),
            state: MarketState.PENDING,
            eventEndTime: eventEndTime,
            bondsClaimed: false
        });

        allMarkets.push(marketIdBytes);
        categoryMarkets[keccak256(bytes(category))].push(marketIdBytes);

        emit MarketCreated(marketIdBytes, poolId, question, category, eventEndTime);
    }

    // Propose an outcome for a market
    function proposeOutcome(
        string memory marketId,
        bytes32 outcome
    ) external hasReputation(MIN_REPUTATION) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId != bytes32(0), "Market does not exist");
        Market storage market = markets[marketIdBytes];
        
        require(market.state == MarketState.PENDING, "Market not pending outcome");
        require(block.timestamp >= market.eventEndTime, "Event not ended yet");
        require(outcome != bytes32(0), "Invalid outcome");

        // Transfer bond from proposer
        require(
            bondToken.transferFrom(msg.sender, address(this), PROPOSAL_BOND),
            "Bond transfer failed"
        );

        market.proposedOutcome = outcome;
        market.proposer = msg.sender;
        market.proposalTime = block.timestamp;
        market.proposalBond = PROPOSAL_BOND;
        market.state = MarketState.PROPOSED;

        emit OutcomeProposed(marketIdBytes, msg.sender, outcome, PROPOSAL_BOND);
    }

    // Dispute a proposed outcome
    function disputeOutcome(
        string memory marketId
    ) external hasReputation(MIN_DISPUTE_REPUTATION) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId != bytes32(0), "Market does not exist");
        Market storage market = markets[marketIdBytes];
        
        require(market.state == MarketState.PROPOSED, "Market not in proposed state");
        require(block.timestamp <= market.proposalTime + CHALLENGE_WINDOW, "Challenge window expired");
        require(msg.sender != market.proposer, "Proposer cannot dispute own proposal");

        // Transfer dispute bond
        require(
            bondToken.transferFrom(msg.sender, address(this), DISPUTE_BOND),
            "Dispute bond transfer failed"
        );

        market.disputer = msg.sender;
        market.disputeTime = block.timestamp;
        market.disputeBond = DISPUTE_BOND;
        market.state = MarketState.DISPUTED;

        // Initialize dispute voting
        Dispute storage dispute = disputes[marketIdBytes];
        dispute.marketId = marketIdBytes;
        dispute.disputeEndTime = block.timestamp + RESOLUTION_WINDOW;
        dispute.resolved = false;

        emit OutcomeDisputed(marketIdBytes, msg.sender, DISPUTE_BOND);
    }

    // Vote on a disputed outcome (community resolution)
    function voteOnDispute(
        string memory marketId,
        bytes32 outcome
    ) external hasReputation(MIN_DISPUTE_REPUTATION) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId != bytes32(0), "Market does not exist");
        Market storage market = markets[marketIdBytes];
        Dispute storage dispute = disputes[marketIdBytes];
        
        require(market.state == MarketState.DISPUTED, "Market not disputed");
        require(block.timestamp <= dispute.disputeEndTime, "Voting period ended");
        require(outcome != bytes32(0), "Invalid outcome");
        require(dispute.votes[msg.sender].timestamp == 0, "Already voted");

        uint256 votingPower = userReputation[msg.sender];
        require(votingPower > 0, "No voting power");

        // Record vote
        dispute.votes[msg.sender] = Vote({
            outcome: outcome,
            votingPower: votingPower,
            timestamp: block.timestamp
        });

        dispute.voters.push(msg.sender);
        dispute.outcomeTotals[outcome] += votingPower;
        dispute.totalVotingPower += votingPower;

        emit VoteCast(marketIdBytes, msg.sender, outcome, votingPower);
    }

    // Resolve a market (finalize outcome)
    function resolveMarket(string memory marketId) external {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId != bytes32(0), "Market does not exist");
        Market storage market = markets[marketIdBytes];
        
        if (market.state == MarketState.PROPOSED) {
            // Challenge window expired, accept proposed outcome
            require(
                block.timestamp > market.proposalTime + CHALLENGE_WINDOW,
                "Challenge window not expired"
            );
            
            market.finalOutcome = market.proposedOutcome;
            market.state = MarketState.RESOLVED;
            
            // Update reputations
            _updateReputationForCorrectProposal(market.proposer, marketIdBytes);
            
            emit MarketResolved(marketIdBytes, market.finalOutcome, market.proposer, market.proposalBond);
            
        } else if (market.state == MarketState.DISPUTED) {
            Dispute storage dispute = disputes[marketIdBytes];
            require(block.timestamp > dispute.disputeEndTime, "Voting period not ended");
            require(!dispute.resolved, "Already resolved");
            
            // Find winning outcome
            bytes32 winningOutcome = _determineWinningOutcome(marketIdBytes);
            market.finalOutcome = winningOutcome;
            market.state = MarketState.RESOLVED;
            dispute.resolved = true;
            
            // Update reputations based on voting results
            _updateReputationsAfterDispute(marketIdBytes, winningOutcome);
            
            emit MarketResolved(marketIdBytes, winningOutcome, address(0), 0);
        } else {
            revert("Market not ready for resolution");
        }

        // Settle the pool in BitredictPool
        bitredictPool.settlePool(market.poolId, market.finalOutcome);
    }

    // Get market outcome (used by BitredictPool)
    function getOutcome(string memory marketId) external view returns (bool isSettled, bytes memory outcome) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        Market storage market = markets[marketIdBytes];
        
        if (market.state == MarketState.RESOLVED) {
            return (true, abi.encode(market.finalOutcome));
        }
        
        return (false, "");
    }

    // Claim bonds after market resolution
    function claimBonds(string memory marketId) external {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        require(markets[marketIdBytes].marketId != bytes32(0), "Market does not exist");
        Market storage market = markets[marketIdBytes];
        
        require(market.state == MarketState.RESOLVED, "Market not resolved");
        require(!market.bondsClaimed, "Bonds already claimed");
        
        market.bondsClaimed = true;
        
        if (market.disputer == address(0)) {
            // No dispute, proposer gets bond back
            require(bondToken.transfer(market.proposer, market.proposalBond), "Bond transfer failed");
            emit BondClaimed(marketIdBytes, market.proposer, market.proposalBond);
            
        } else {
            // There was a dispute, determine who was correct
            bytes32 winningOutcome = market.finalOutcome;
            
            if (market.proposedOutcome == winningOutcome) {
                // Proposer was correct, gets both bonds
                uint256 totalReward = market.proposalBond + market.disputeBond;
                require(bondToken.transfer(market.proposer, totalReward), "Reward transfer failed");
                emit BondClaimed(marketIdBytes, market.proposer, totalReward);
                
            } else {
                // Disputer was correct, distribute rewards among correct voters
                _distributeBondsToCorrectVoters(marketIdBytes, winningOutcome);
            }
        }
    }

    // Admin function to set user reputation (for bootstrapping)
    function setUserReputation(address user, uint256 reputation) external onlyOwner {
        uint256 oldReputation = userReputation[user];
        userReputation[user] = reputation;
        
        emit ReputationUpdated(user, oldReputation, reputation);
    }

    // Batch set reputations for efficiency
    function batchSetReputations(address[] calldata users, uint256[] calldata reputations) external onlyOwner {
        require(users.length == reputations.length, "Array length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            uint256 oldReputation = userReputation[users[i]];
            userReputation[users[i]] = reputations[i];
            emit ReputationUpdated(users[i], oldReputation, reputations[i]);
        }
    }

    // Distribute bonds to correct voters proportionally
    function _distributeBondsToCorrectVoters(bytes32 marketId, bytes32 winningOutcome) internal {
        Market storage market = markets[marketId];
        Dispute storage dispute = disputes[marketId];
        
        uint256 totalBonds = market.proposalBond + market.disputeBond;
        uint256 winningVotingPower = dispute.outcomeTotals[winningOutcome];
        
        if (winningVotingPower == 0) {
            // No correct voters, return bonds to disputer as they initiated valid dispute
            require(bondToken.transfer(market.disputer, totalBonds), "Bond refund failed");
            emit BondClaimed(marketId, market.disputer, totalBonds);
            return;
        }
        
        // Distribute proportionally to correct voters
        for (uint256 i = 0; i < dispute.voters.length; i++) {
            address voter = dispute.voters[i];
            if (dispute.votes[voter].outcome == winningOutcome) {
                uint256 voterPower = dispute.votes[voter].votingPower;
                uint256 reward = (totalBonds * voterPower) / winningVotingPower;
                
                if (reward > 0) {
                    require(bondToken.transfer(voter, reward), "Voter reward transfer failed");
                    emit BondClaimed(marketId, voter, reward);
                }
            }
        }
    }

    // Emergency functions for admin control
    function emergencyResolveMarket(string memory marketId, bytes32 outcome) external onlyOwner {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        Market storage market = markets[marketIdBytes];
        require(market.state != MarketState.RESOLVED, "Already resolved");
        
        market.finalOutcome = outcome;
        market.state = MarketState.RESOLVED;
        
        if (disputes[marketIdBytes].marketId != bytes32(0)) {
            disputes[marketIdBytes].resolved = true;
        }
        
        bitredictPool.settlePool(market.poolId, outcome);
        emit MarketResolved(marketIdBytes, outcome, owner(), 0);
    }

    // Internal function to determine winning outcome from votes
    function _determineWinningOutcome(bytes32 marketIdBytes) internal view returns (bytes32) {
        Dispute storage dispute = disputes[marketIdBytes];
        
        bytes32 winningOutcome;
        uint256 maxVotes = 0;
        
        // Find the outcome with the most voting power
        for (uint256 i = 0; i < dispute.voters.length; i++) {
            address voter = dispute.voters[i];
            bytes32 outcome = dispute.votes[voter].outcome;
            uint256 totalForOutcome = dispute.outcomeTotals[outcome];
            
            if (totalForOutcome > maxVotes) {
                maxVotes = totalForOutcome;
                winningOutcome = outcome;
            }
        }
        
        return winningOutcome;
    }

    // Update reputation for correct proposal
    function _updateReputationForCorrectProposal(address proposer, bytes32 marketId) internal {
        uint256 oldReputation = userReputation[proposer];
        uint256 newReputation = oldReputation + 10; // +10 for correct proposal
        userReputation[proposer] = newReputation;
        
        emit ReputationUpdated(proposer, oldReputation, newReputation);
        emit ReputationAction(proposer, "OUTCOME_PROPOSED_CORRECTLY", 10, marketId, block.timestamp);
    }

    // Update reputations after dispute resolution
    function _updateReputationsAfterDispute(bytes32 marketId, bytes32 winningOutcome) internal {
        Market storage market = markets[marketId];
        Dispute storage dispute = disputes[marketId];
        
        // Update proposer reputation
        if (market.proposedOutcome == winningOutcome) {
            // Proposer was correct
            uint256 oldRep = userReputation[market.proposer];
            uint256 newRep = oldRep + 10;
            userReputation[market.proposer] = newRep;
            emit ReputationUpdated(market.proposer, oldRep, newRep);
            emit ReputationAction(market.proposer, "OUTCOME_PROPOSED_CORRECTLY", 10, marketId, block.timestamp);
        } else {
            // Proposer was incorrect
            uint256 oldRep = userReputation[market.proposer];
            uint256 newRep = oldRep >= 15 ? oldRep - 15 : 0;
            userReputation[market.proposer] = newRep;
            emit ReputationUpdated(market.proposer, oldRep, newRep);
            emit ReputationAction(market.proposer, "OUTCOME_PROPOSED_INCORRECTLY", -15, marketId, block.timestamp);
        }
        
        // Update voter reputations
        for (uint256 i = 0; i < dispute.voters.length; i++) {
            address voter = dispute.voters[i];
            bytes32 voterOutcome = dispute.votes[voter].outcome;
            
            if (voterOutcome == winningOutcome) {
                // Voter was correct
                uint256 oldRep = userReputation[voter];
                uint256 newRep = oldRep + 5; // +5 for correct vote
                userReputation[voter] = newRep;
                emit ReputationUpdated(voter, oldRep, newRep);
                emit ReputationAction(voter, "CHALLENGE_SUCCESSFUL", 10, marketId, block.timestamp);
            } else {
                // Voter was incorrect
                uint256 oldRep = userReputation[voter];
                uint256 newRep = oldRep >= 3 ? oldRep - 3 : 0; // -3 for incorrect vote
                userReputation[voter] = newRep;
                emit ReputationUpdated(voter, oldRep, newRep);
                emit ReputationAction(voter, "CHALLENGE_FAILED", -8, marketId, block.timestamp);
            }
        }
        
        // Update disputer reputation
        if (market.proposedOutcome != winningOutcome) {
            // Disputer was correct to dispute
            uint256 oldRep = userReputation[market.disputer];
            uint256 newRep = oldRep + 10;
            userReputation[market.disputer] = newRep;
            emit ReputationUpdated(market.disputer, oldRep, newRep);
            emit ReputationAction(market.disputer, "CHALLENGE_SUCCESSFUL", 10, marketId, block.timestamp);
        } else {
            // Disputer was incorrect
            uint256 oldRep = userReputation[market.disputer];
            uint256 newRep = oldRep >= 8 ? oldRep - 8 : 0;
            userReputation[market.disputer] = newRep;
            emit ReputationUpdated(market.disputer, oldRep, newRep);
            emit ReputationAction(market.disputer, "CHALLENGE_FAILED", -8, marketId, block.timestamp);
        }
    }

    // View functions
    function getMarket(string memory marketId) external view returns (Market memory) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        return markets[marketIdBytes];
    }

    function getMarketsByCategory(string memory category) external view returns (bytes32[] memory) {
        return categoryMarkets[keccak256(bytes(category))];
    }

    function getAllMarkets() external view returns (bytes32[] memory) {
        return allMarkets;
    }

    function getDispute(string memory marketId) external view returns (
        uint256 totalVotingPower,
        uint256 disputeEndTime,
        bool resolved,
        address[] memory voters
    ) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        Dispute storage dispute = disputes[marketIdBytes];
        return (
            dispute.totalVotingPower,
            dispute.disputeEndTime,
            dispute.resolved,
            dispute.voters
        );
    }

    function getVote(string memory marketId, address voter) external view returns (
        bytes32 outcome,
        uint256 votingPower,
        uint256 timestamp
    ) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        Vote storage vote = disputes[marketIdBytes].votes[voter];
        return (vote.outcome, vote.votingPower, vote.timestamp);
    }

    function getOutcomeTotals(string memory marketId, bytes32 outcome) external view returns (uint256) {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        return disputes[marketIdBytes].outcomeTotals[outcome];
    }

    // Emergency functions

    function emergencyWithdrawBonds(string memory marketId) external onlyOwner {
        bytes32 marketIdBytes = keccak256(abi.encodePacked(marketId));
        Market storage market = markets[marketIdBytes];
        uint256 totalBonds = market.proposalBond + market.disputeBond;
        
        if (totalBonds > 0) {
            market.bondsClaimed = true;
            require(bondToken.transfer(owner(), totalBonds), "Emergency withdrawal failed");
        }
    }
} 