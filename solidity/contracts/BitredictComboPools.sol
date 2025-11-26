// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ReputationSystem.sol";
import "./BitredictPoolCore.sol";



contract BitredictComboPools is Ownable, ReentrancyGuard {
    
    IERC20 public bitrToken;
    BitredictPoolCore public poolCore;
    
    uint256 public comboPoolCount;
    
    // Constants
    uint256 public constant creationFeeSTT = 1e18;     // 1 STT
    uint256 public constant creationFeeBITR = 70e18;   // 70 BITR
    uint256 public constant minPoolStakeSTT = 5e18;    // 5 STT
    uint256 public constant minPoolStakeBITR = 1000e18; // 1000 BITR
    uint256 public constant minBetAmount = 1e18;
    uint256 public constant bettingGracePeriod = 60;
    uint256 public constant MAX_PARTICIPANTS = 500;
    uint256 public constant MAX_LP_PROVIDERS = 100;
    uint256 public constant MAX_CONDITIONS = 5;
    uint256 public constant MIN_CONDITIONS = 2;

    // Fee tracking
    uint256 public totalCollectedSTT;
    uint256 public totalCollectedBITR;
    address public immutable feeCollector;

    struct OutcomeCondition {
        bytes32 marketId;           // SportMonks match ID or external reference
        bytes32 expectedOutcome;    // Expected result for this condition
        bool resolved;              // Whether this condition has been resolved
        bytes32 actualOutcome;      // Actual result (set when resolved)
        string description;         // Human readable description
        uint16 odds;               // Individual odds for this condition
    }

    struct ComboPool {
        address creator;
        uint256 creatorStake;
        uint256 totalCreatorSideStake;
        uint256 maxBettorStake;
        uint256 totalBettorStake;
        uint16 totalOdds;           // Combined odds for all conditions
        uint8 flags;               // Packed bools: bit 0=settled, bit 1=creatorSideWon, bit 2=usesBitr
        uint8 conditionCount;      // Number of conditions
        uint256 eventStartTime;     // Earliest event start time
        uint256 eventEndTime;       // Latest event end time
        uint256 bettingEndTime;
        uint256 resultTimestamp;
        bytes32 category;
        uint256 maxBetPerUser;
        OutcomeCondition[] conditions; // Array of conditions (max 4)
    }

    // Analytics structures
    struct ComboAnalytics {
        uint256 totalVolume;
        uint256 participantCount;
        uint256 averageBetSize;
        uint256 successRate;
        uint256 averageOdds;
        uint256 conditionSuccessRates;
        uint256 lastActivityTime;
    }

    struct ComboStats {
        uint256 totalComboPools;
        uint256 totalComboVolume;
        uint256 averageConditions;
        uint256 mostPopularConditionCount;
        uint256 totalSuccessfulCombos;
        mapping(uint8 => uint256) conditionCountStats; // Track usage by condition count
        mapping(bytes32 => uint256) categoryStats; // Track usage by category
    }

    // Storage mappings
    mapping(uint256 => ComboPool) public comboPools;
    mapping(uint256 => address[]) public comboPoolBettors;
    mapping(uint256 => mapping(address => uint256)) public comboBettorStakes;
    mapping(uint256 => address[]) public comboPoolLPs;
    mapping(uint256 => mapping(address => uint256)) public comboLPStakes;
    mapping(uint256 => mapping(address => bool)) public comboClaimed;
    mapping(uint256 => ComboAnalytics) public comboAnalytics;
    
    mapping(address => uint256[]) public userComboBettingHistory;
    mapping(address => uint256[]) public userComboPoolHistory;
    mapping(address => uint256) public userComboTotalBets;
    mapping(address => uint256) public userComboTotalWins;
    mapping(address => uint256) public userComboTotalVolume;
    mapping(address => uint256) public userComboWinRate;
    
    mapping(address => address[]) public userComboFollowing;
    mapping(address => address[]) public userComboFollowers;
    mapping(bytes32 => bool) public isComboFollowing;
    
    mapping(uint256 => uint256) public comboPoolPerformanceScore;
    mapping(bytes32 => uint256) public comboCategoryTrendScore;
    mapping(address => uint256) public comboCreatorPerformanceScore;
    
    ComboStats public comboStats;

    // Events
    event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds, bytes32 category);
    event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount);
    event ComboLiquidityAdded(uint256 indexed comboPoolId, address indexed provider, uint256 amount);
    event ComboConditionResolved(uint256 indexed comboPoolId, uint256 conditionIndex, bytes32 actualOutcome, bool successful);
    event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 successfulConditions, uint256 timestamp);
    event ComboRewardClaimed(uint256 indexed comboPoolId, address indexed user, uint256 amount);
    event ComboPoolRefunded(uint256 indexed comboPoolId, string reason);
    event ReputationActionOccurred(address indexed user, ReputationSystem.ReputationAction action, uint256 value, bytes32 indexed poolId, uint256 timestamp);
    event ComboAnalyticsUpdated(uint256 indexed comboPoolId, uint256 totalVolume, uint256 participantCount);
    event ComboUserFollowed(address indexed follower, address indexed creator);
    event ComboUserUnfollowed(address indexed follower, address indexed creator);
    event ComboPoolPerformanceUpdated(uint256 indexed comboPoolId, uint256 score);
    event ComboUserPerformanceUpdated(address indexed user, uint256 winRate, uint256 totalVolume);

    constructor(
        address _bitrToken,
        address _feeCollector,
        address _poolCore
    ) Ownable(msg.sender) {
        require(_bitrToken != address(0), "Invalid BITR address");
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_poolCore != address(0), "Invalid pool core");
        
        bitrToken = IERC20(_bitrToken);
        feeCollector = _feeCollector;
        poolCore = BitredictPoolCore(_poolCore);
        
        comboStats.totalComboPools = 0;
        comboStats.totalComboVolume = 0;
    }

    modifier validComboPool(uint256 comboPoolId) {
        require(comboPoolId < comboPoolCount, "Invalid combo pool");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == address(poolCore.guidedOracle()) || msg.sender == address(poolCore.optimisticOracle()), "Not authorized oracle");
        _;
    }

    // --- Combo Pool Creation ---

    function createComboPool(
        OutcomeCondition[] memory conditions,
        uint16 combinedOdds,
        uint256 creatorStake,
        uint256 earliestEventStart,
        uint256 latestEventEnd,
        bytes32 categoryHash,
        uint256 maxBetPerUser,
        bool useBitr
    ) external payable nonReentrant returns (uint256) {
        require(conditions.length >= MIN_CONDITIONS && conditions.length <= MAX_CONDITIONS, "Invalid condition count");
        require(combinedOdds > 100 && combinedOdds <= 50000, "Invalid combined odds"); // Max 500x
        require(creatorStake > 0, "Creator stake must be positive");
        require(earliestEventStart > block.timestamp, "Event start must be in future");
        require(latestEventEnd > earliestEventStart, "Event end must be after start");
        
        // Check minimum stake
        if (useBitr) {
            require(creatorStake >= minPoolStakeBITR, "BITR stake below minimum");
        } else {
            require(creatorStake >= minPoolStakeSTT, "STT stake below minimum");
        }
        
        require(earliestEventStart > block.timestamp + bettingGracePeriod, "Event too soon");
        require(latestEventEnd > earliestEventStart, "Invalid event times");
        
        // Validate each condition
        for (uint256 i = 0; i < conditions.length; i++) {
            require(conditions[i].marketId != bytes32(0), "Invalid market ID");
            require(conditions[i].expectedOutcome != bytes32(0), "Invalid expected outcome");
            require(conditions[i].odds > 100, "Invalid condition odds");
        }
        
        // Calculate creation fee and handle payment
        uint256 creationFee = useBitr ? creationFeeBITR : creationFeeSTT;
        uint256 totalRequired = creationFee + creatorStake;
        
        if (useBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), totalRequired), "BITR transfer failed");
            totalCollectedBITR += creationFee;
        } else {
            require(msg.value == totalRequired, "Incorrect STT amount");
            totalCollectedSTT += creationFee;
        }
        
        // Calculate max bettor stake with overflow protection
        require(combinedOdds > 100, "Invalid odds");
        uint256 maxBettorStake = (creatorStake * 100) / (combinedOdds - 100);
        require(maxBettorStake >= creatorStake, "Max bettor stake calculation overflow");
        uint256 bettingEndTime = earliestEventStart - bettingGracePeriod;
        
        // Pack flags
        uint8 flags = 0;
        if (useBitr) flags |= 4; // bit 2

        // Create combo pool
        ComboPool storage newPool = comboPools[comboPoolCount];
        newPool.creator = msg.sender;
        newPool.creatorStake = creatorStake;
        newPool.totalCreatorSideStake = creatorStake;
        newPool.maxBettorStake = maxBettorStake;
        newPool.totalBettorStake = 0;
        newPool.totalOdds = combinedOdds;
        newPool.flags = flags;
        newPool.conditionCount = uint8(conditions.length);
        newPool.eventStartTime = earliestEventStart;
        newPool.eventEndTime = latestEventEnd;
        newPool.bettingEndTime = bettingEndTime;
        newPool.resultTimestamp = 0;
        newPool.category = categoryHash;
        newPool.maxBetPerUser = maxBetPerUser;
        
        // Add conditions
        for (uint256 i = 0; i < conditions.length; i++) {
            newPool.conditions.push(conditions[i]);
        }
        
        // Initialize analytics
        comboAnalytics[comboPoolCount] = ComboAnalytics({
            totalVolume: creatorStake,
            participantCount: 1,
            averageBetSize: creatorStake,
            successRate: 0,
            averageOdds: combinedOdds,
            conditionSuccessRates: 0,
            lastActivityTime: block.timestamp
        });
        
        // Creator is first LP
        comboPoolLPs[comboPoolCount].push(msg.sender);
        comboLPStakes[comboPoolCount][msg.sender] = creatorStake;
        
        // Update stats
        _updateComboStats(categoryHash, uint8(conditions.length), creatorStake);
        
        emit ComboPoolCreated(comboPoolCount, msg.sender, conditions.length, combinedOdds, categoryHash);
        emit ReputationActionOccurred(msg.sender, ReputationSystem.ReputationAction.POOL_CREATED, creatorStake, bytes32(comboPoolCount), block.timestamp);
        
        uint256 currentComboPoolId = comboPoolCount;
        comboPoolCount++;
        return currentComboPoolId;
    }

    // --- Betting on Combo Pools ---

    function placeComboBet(uint256 comboPoolId, uint256 amount) external payable validComboPool(comboPoolId) nonReentrant {
        ComboPool storage pool = comboPools[comboPoolId];
        
        require(!_isComboPoolSettled(comboPoolId), "Pool settled");
        require(amount >= minBetAmount, "Bet below minimum");
        require(amount <= 100000 * 1e18, "Bet too large");
        require(block.timestamp < pool.bettingEndTime, "Betting period ended");
        require(pool.totalBettorStake + amount <= pool.maxBettorStake, "Pool full");
        require(amount > 0, "Amount must be positive");
        
        // Check max bet per user
        if (pool.maxBetPerUser > 0) {
            require(comboBettorStakes[comboPoolId][msg.sender] + amount <= pool.maxBetPerUser, "Exceeds max bet per user");
        }
        
        // Add to bettors list if first bet
        if (comboBettorStakes[comboPoolId][msg.sender] == 0) {
            require(comboPoolBettors[comboPoolId].length < MAX_PARTICIPANTS, "Too many participants");
            comboPoolBettors[comboPoolId].push(msg.sender);
        }
        
        comboBettorStakes[comboPoolId][msg.sender] += amount;
        pool.totalBettorStake += amount;
        
        // Handle payment
        if (_comboPoolUsesBitr(comboPoolId)) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount), "BITR transfer failed");
        } else {
            require(msg.value == amount, "Incorrect STT amount");
        }
        
        // Update analytics
        _updateComboAnalytics(comboPoolId, amount, 1);
        _updateComboUserBettingData(msg.sender, comboPoolId, amount, false);
        
        emit ComboBetPlaced(comboPoolId, msg.sender, amount);
    }

    function addComboLiquidity(uint256 comboPoolId, uint256 amount) external payable validComboPool(comboPoolId) nonReentrant {
        ComboPool storage pool = comboPools[comboPoolId];
        
        require(!_isComboPoolSettled(comboPoolId), "Pool settled");
        require(amount >= minBetAmount, "Liquidity below minimum");
        require(amount <= 500000 * 1e18, "Liquidity too large");
        require(block.timestamp < pool.bettingEndTime, "Betting period ended");
        require(amount > 0, "Amount must be positive");
        
        // Check LP limits
        if (comboLPStakes[comboPoolId][msg.sender] == 0) {
            require(comboPoolLPs[comboPoolId].length < MAX_LP_PROVIDERS, "Too many LP providers");
        }
        
        // Add to LP list if first liquidity
        if (comboLPStakes[comboPoolId][msg.sender] == 0) {
            comboPoolLPs[comboPoolId].push(msg.sender);
        }
        
        comboLPStakes[comboPoolId][msg.sender] += amount;
        pool.totalCreatorSideStake += amount;
        
        // Recalculate max bettor stake with overflow protection
        require(pool.totalOdds > 100, "Invalid odds");
        uint256 newMaxBettorStake = (pool.totalCreatorSideStake * 100) / (pool.totalOdds - 100);
        require(newMaxBettorStake >= pool.totalCreatorSideStake, "Max bettor stake calculation overflow");
        pool.maxBettorStake = newMaxBettorStake;
        
        // Handle payment
        if (_comboPoolUsesBitr(comboPoolId)) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount), "BITR transfer failed");
        } else {
            require(msg.value == amount, "Incorrect STT amount");
        }
        
        // Update analytics
        _updateComboAnalytics(comboPoolId, amount, 0);
        _updateComboUserBettingData(msg.sender, comboPoolId, amount, false);
        
        emit ComboLiquidityAdded(comboPoolId, msg.sender, amount);
    }

    // --- Condition Resolution ---

    function resolveComboCondition(uint256 comboPoolId, uint256 conditionIndex, bytes32 actualOutcome) 
        external onlyOracle validComboPool(comboPoolId) {
        ComboPool storage pool = comboPools[comboPoolId];
        require(!_isComboPoolSettled(comboPoolId), "Pool already settled");
        require(conditionIndex < pool.conditions.length, "Invalid condition index");
        require(!pool.conditions[conditionIndex].resolved, "Condition already resolved");
        
        pool.conditions[conditionIndex].resolved = true;
        pool.conditions[conditionIndex].actualOutcome = actualOutcome;
        
        bool conditionSuccessful = (actualOutcome == pool.conditions[conditionIndex].expectedOutcome);
        
        emit ComboConditionResolved(comboPoolId, conditionIndex, actualOutcome, conditionSuccessful);
        
        // Check if all conditions are resolved
        bool allResolved = true;
        uint256 successfulConditions = 0;
        
        for (uint256 i = 0; i < pool.conditions.length; i++) {
            if (!pool.conditions[i].resolved) {
                allResolved = false;
                break;
            }
            
            if (pool.conditions[i].actualOutcome == pool.conditions[i].expectedOutcome) {
                successfulConditions++;
            }
        }
        
        // Settle pool if all conditions resolved and past event end time
        if (allResolved && block.timestamp >= pool.eventEndTime) {
            // Combo pools need ALL conditions to be successful for bettors to win
            bool creatorWins = (successfulConditions < pool.conditions.length);
            
            pool.flags |= 1; // Set settled bit
            if (creatorWins) {
                pool.flags |= 2; // Set creatorSideWon bit
            }
            pool.resultTimestamp = block.timestamp;
            
            // Update analytics
            _updateComboSuccessRate(comboPoolId, successfulConditions, pool.conditions.length);
            
            emit ComboPoolSettled(comboPoolId, creatorWins, successfulConditions, block.timestamp);
        }
    }

    // --- Claims ---

    function claimCombo(uint256 comboPoolId) external validComboPool(comboPoolId) nonReentrant {
        ComboPool storage pool = comboPools[comboPoolId];
        require(_isComboPoolSettled(comboPoolId), "Not settled");
        require(!comboClaimed[comboPoolId][msg.sender], "Already claimed");
        
        // Calculate payout and stake first (before state changes)
        uint256 payout = 0;
        uint256 stake = 0;
        bool userWon = false;
        
        if (_comboPoolCreatorSideWon(comboPoolId)) {
            // LP wins - check if user has LP stake
            stake = comboLPStakes[comboPoolId][msg.sender];
            if (stake > 0) {
                require(pool.totalCreatorSideStake > 0, "No creator side stake");
                uint256 sharePercentage = (stake * 10000) / pool.totalCreatorSideStake;
                payout = stake + ((pool.totalBettorStake * sharePercentage) / 10000);
                userWon = true;
            }
        } else {
            // Bettor wins (all conditions successful) - check if user has bettor stake
            stake = comboBettorStakes[comboPoolId][msg.sender];
            if (stake > 0) {
                payout = (stake * uint256(pool.totalOdds)) / 100;
                uint256 profit = payout - stake;
                uint256 fee = (profit * poolCore.adjustedFeeRate(msg.sender)) / 10000;
                payout -= fee;
                userWon = true;
                
                // Track fees (before external call)
                if (fee > 0) {
                    if (_comboPoolUsesBitr(comboPoolId)) {
                        totalCollectedBITR += fee;
                    } else {
                        totalCollectedSTT += fee;
                    }
                }
                
                // Reputation for high-value wins
                uint256 minValueSTT = 10 * 1e18;
                uint256 minValueBITR = 2000 * 1e18;
                bool qualifiesForReputation = _comboPoolUsesBitr(comboPoolId) ? 
                    (stake >= minValueBITR) : (stake >= minValueSTT);
                
                if (qualifiesForReputation) {
                    emit ReputationActionOccurred(msg.sender, ReputationSystem.ReputationAction.BET_WON_HIGH_VALUE, stake, bytes32(comboPoolId), block.timestamp);
                }
            }
        }
        
        // Only allow claims if user has stake and is a winner
        require(stake > 0, "No stake to claim");
        require(payout > 0, "No payout available");
        
        // Update state before external calls (reentrancy protection)
        comboClaimed[comboPoolId][msg.sender] = true;
        _updateComboUserBettingData(msg.sender, comboPoolId, stake, userWon);
        
        // External calls after state updates
        if (_comboPoolUsesBitr(comboPoolId)) {
            require(bitrToken.transfer(msg.sender, payout), "BITR payout failed");
        } else {
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "STT payout failed");
        }
        
        emit ComboRewardClaimed(comboPoolId, msg.sender, payout);
    }

    // --- Pool Management ---

    function refundComboPool(uint256 comboPoolId) external validComboPool(comboPoolId) {
        ComboPool storage pool = comboPools[comboPoolId];
        require(!_isComboPoolSettled(comboPoolId), "Already settled");
        require(block.timestamp > pool.eventEndTime + 7 days, "Refund period not reached"); // 7 days after event end
        
        pool.flags |= 1; // Set settled bit
        
        // Refund all LPs
        address[] memory lps = comboPoolLPs[comboPoolId];
        for (uint256 i = 0; i < lps.length; i++) {
            address lp = lps[i];
            uint256 stake = comboLPStakes[comboPoolId][lp];
            if (stake > 0) {
                if (_comboPoolUsesBitr(comboPoolId)) {
                    require(bitrToken.transfer(lp, stake), "BITR LP refund failed");
                } else {
                    (bool success, ) = payable(lp).call{value: stake}("");
                    require(success, "STT LP refund failed");
                }
            }
        }
        
        // Refund all bettors
        address[] memory bettors = comboPoolBettors[comboPoolId];
        for (uint256 i = 0; i < bettors.length; i++) {
            address bettor = bettors[i];
            uint256 stake = comboBettorStakes[comboPoolId][bettor];
            if (stake > 0) {
                if (_comboPoolUsesBitr(comboPoolId)) {
                    require(bitrToken.transfer(bettor, stake), "BITR bettor refund failed");
                } else {
                    (bool success, ) = payable(bettor).call{value: stake}("");
                    require(success, "STT bettor refund failed");
                }
            }
        }
        
        emit ComboPoolRefunded(comboPoolId, "Resolution timeout");
    }

    // --- View Functions ---

    function getComboPool(uint256 comboPoolId) external view validComboPool(comboPoolId) returns (ComboPool memory) {
        return comboPools[comboPoolId];
    }

    function getComboPoolWithType(uint256 comboPoolId) external view validComboPool(comboPoolId) returns (ComboPool memory pool, string memory poolType) {
        return (comboPools[comboPoolId], "COMBO_POOL");
    }

    function getComboPoolConditions(uint256 comboPoolId) external view validComboPool(comboPoolId) returns (OutcomeCondition[] memory) {
        return comboPools[comboPoolId].conditions;
    }

    function getComboPoolsByCreator(address creator) external view returns (uint256[] memory) {
        uint256[] memory pools = new uint256[](comboPoolCount);
        uint256 count = 0;
        
        for (uint256 i = 0; i < comboPoolCount; i++) {
            if (comboPools[i].creator == creator) {
                pools[count] = i;
                count++;
            }
        }
        
        // Resize array
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = pools[i];
        }
        
        return result;
    }

    function getActiveCombopools() external view returns (uint256[] memory) {
        uint256[] memory activePools = new uint256[](comboPoolCount);
        uint256 count = 0;
        
        for (uint256 i = 0; i < comboPoolCount; i++) {
            if (!_isComboPoolSettled(i) && block.timestamp < comboPools[i].bettingEndTime) {
                activePools[count] = i;
                count++;
            }
        }
        
        // Resize array
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activePools[i];
        }
        
        return result;
    }

    function getComboPoolAnalytics(uint256 comboPoolId) external view validComboPool(comboPoolId) returns (ComboAnalytics memory) {
        return comboAnalytics[comboPoolId];
    }

    function getComboStats() external view returns (
        uint256 totalPools,
        uint256 totalVolume,
        uint256 averageConditions,
        uint256 mostPopularConditionCount,
        uint256 totalSuccessful
    ) {
        return (
            comboStats.totalComboPools,
            comboStats.totalComboVolume,
            comboStats.averageConditions,
            comboStats.mostPopularConditionCount,
            comboStats.totalSuccessfulCombos
        );
    }

    function comboPoolExists(uint256 comboPoolId) external view returns (bool) {
        return comboPoolId < comboPoolCount;
    }

    function followComboCreator(address creator) external {
        require(creator != msg.sender, "Cannot follow yourself");
        require(creator != address(0), "Invalid creator");
        
        bytes32 followKey = keccak256(abi.encodePacked(msg.sender, creator));
        require(!isComboFollowing[followKey], "Already following");
        
        isComboFollowing[followKey] = true;
        userComboFollowing[msg.sender].push(creator);
        userComboFollowers[creator].push(msg.sender);
        
        emit ComboUserFollowed(msg.sender, creator);
    }

    function unfollowComboCreator(address creator) external {
        bytes32 followKey = keccak256(abi.encodePacked(msg.sender, creator));
        require(isComboFollowing[followKey], "Not following");
        
        isComboFollowing[followKey] = false;
        _removeFromComboArray(userComboFollowing[msg.sender], creator);
        _removeFromComboArray(userComboFollowers[creator], msg.sender);
        
        emit ComboUserUnfollowed(msg.sender, creator);
    }

    function getUserComboBettingHistory(address user) external view returns (uint256[] memory) {
        return userComboBettingHistory[user];
    }

    function getUserComboStats(address user) external view returns (
        uint256 totalBets,
        uint256 totalWins,
        uint256 totalVolume,
        uint256 winRate
    ) {
        return (
            userComboTotalBets[user],
            userComboTotalWins[user],
            userComboTotalVolume[user],
            userComboWinRate[user]
        );
    }

    function getComboFollowingList(address user) external view returns (address[] memory) {
        return userComboFollowing[user];
    }

    function getComboFollowersList(address user) external view returns (address[] memory) {
        return userComboFollowers[user];
    }

    function getComboPoolPerformanceScore(uint256 comboPoolId) external view returns (uint256) {
        return comboPoolPerformanceScore[comboPoolId];
    }

    function getComboCategoryTrendScore(bytes32 categoryHash) external view returns (uint256) {
        return comboCategoryTrendScore[categoryHash];
    }

    function getComboCreatorPerformanceScore(address creator) external view returns (uint256) {
        return comboCreatorPerformanceScore[creator];
    }

    // --- Fee Management ---

    function distributeFees(address stakingContract) external {
        require(msg.sender == feeCollector, "Only fee collector");
        require(stakingContract != address(0), "Invalid staking contract");
        require(stakingContract != address(this), "Cannot distribute to self");
        uint256 _stt = totalCollectedSTT;
        uint256 _bitr = totalCollectedBITR;

        if (_stt > 0) {
            uint256 sttStakers = (_stt * 30) / 100;
            totalCollectedSTT = 0;
            (bool success1, ) = payable(feeCollector).call{value: _stt - sttStakers}("");
            require(success1, "STT fee collector transfer failed");
            (bool success2, ) = payable(stakingContract).call{value: sttStakers}("");
            require(success2, "STT staking transfer failed");
        }
        
        if (_bitr > 0) {
            uint256 bitrStakers = (_bitr * 30) / 100;
            totalCollectedBITR = 0;
            bitrToken.transfer(feeCollector, _bitr - bitrStakers);
            bitrToken.transfer(stakingContract, bitrStakers);
        }
    }

    // --- Internal Helper Functions ---

    function _isComboPoolSettled(uint256 comboPoolId) internal view returns (bool) {
        return (comboPools[comboPoolId].flags & 1) != 0;
    }

    function _comboPoolCreatorSideWon(uint256 comboPoolId) internal view returns (bool) {
        return (comboPools[comboPoolId].flags & 2) != 0;
    }

    function _comboPoolUsesBitr(uint256 comboPoolId) internal view returns (bool) {
        return (comboPools[comboPoolId].flags & 4) != 0;
    }

    function _updateComboAnalytics(uint256 comboPoolId, uint256 amount, uint256 newParticipants) internal {
        ComboAnalytics storage analytics = comboAnalytics[comboPoolId];
        
        analytics.totalVolume += amount;
        analytics.participantCount += newParticipants;
        analytics.lastActivityTime = block.timestamp;
        
        if (analytics.participantCount > 0) {
            analytics.averageBetSize = analytics.totalVolume / analytics.participantCount;
        }
        
        emit ComboAnalyticsUpdated(comboPoolId, analytics.totalVolume, analytics.participantCount);
    }

    function _updateComboStats(bytes32 categoryHash, uint8 conditionCount, uint256 amount) internal {
        comboStats.totalComboPools++;
        comboStats.totalComboVolume += amount;
        comboStats.conditionCountStats[conditionCount]++;
        comboStats.categoryStats[categoryHash]++;
        
        // Update average conditions
        comboStats.averageConditions = (comboStats.averageConditions * (comboStats.totalComboPools - 1) + conditionCount) / comboStats.totalComboPools;
        
        // Update most popular condition count (simplified)
        if (comboStats.conditionCountStats[conditionCount] > comboStats.conditionCountStats[uint8(comboStats.mostPopularConditionCount)]) {
            comboStats.mostPopularConditionCount = conditionCount;
        }
    }

    function _updateComboSuccessRate(uint256 comboPoolId, uint256 successfulConditions, uint256 totalConditions) internal {
        ComboAnalytics storage analytics = comboAnalytics[comboPoolId];
        
        if (successfulConditions == totalConditions) {
            comboStats.totalSuccessfulCombos++;
            analytics.successRate = 100;
        } else {
            analytics.successRate = (successfulConditions * 100) / totalConditions;
        }
        
        analytics.conditionSuccessRates = analytics.successRate;
    }

    function _removeFromComboArray(address[] storage array, address target) internal {
        for (uint256 i = 0; i < array.length; i++) {
            if (array[i] == target) {
                array[i] = array[array.length - 1];
                array.pop();
                break;
            }
        }
    }

    function _updateComboUserBettingData(address user, uint256 comboPoolId, uint256 amount, bool won) internal {
        userComboBettingHistory[user].push(comboPoolId);
        userComboTotalBets[user]++;
        userComboTotalVolume[user] += amount;
        
        if (won) {
            userComboTotalWins[user]++;
        }
        
        if (userComboTotalBets[user] > 0) {
            userComboWinRate[user] = (userComboTotalWins[user] * 100) / userComboTotalBets[user];
        }
        
        emit ComboUserPerformanceUpdated(user, userComboWinRate[user], userComboTotalVolume[user]);
    }

    function _updateComboPoolPerformance(uint256 comboPoolId, uint256 score) internal {
        comboPoolPerformanceScore[comboPoolId] = score;
        emit ComboPoolPerformanceUpdated(comboPoolId, score);
    }

    function _updateComboCategoryTrend(bytes32 categoryHash, uint256 volume) internal {
        comboCategoryTrendScore[categoryHash] += volume;
    }

    function _updateComboCreatorPerformance(address creator, uint256 volume, bool success) internal {
        comboCreatorPerformanceScore[creator] += success ? volume : (volume / 2);
    }
}
