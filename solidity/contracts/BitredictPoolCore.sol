// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ReputationSystem.sol";
import "./libraries/ClaimCalculations.sol";
import "./libraries/PoolValidations.sol";
import "./libraries/PoolStats.sol";
interface IBitredictBoostSystem {
    function getPoolBoost(uint256 poolId) external view returns (uint8 tier, uint256 expiry);
    function isPoolBoosted(uint256 poolId) external view returns (bool);
}
interface IBitredictStaking {
    function addRevenue(uint256 bitrAmount, uint256 sttAmount) external;
}
interface IReputationSystem {
    function getUserReputation(address user) external view returns (uint256);
    function canCreateGuidedPool(address user) external view returns (bool);
    function canCreateOpenPool(address user) external view returns (bool);
    function getReputationBundle(address user) external view returns (uint256, bool, bool, bool);
}
interface IGuidedOracle {
    function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData);
}
interface IOptimisticOracle {
    function getOutcome(string memory marketId) external view returns (bool isSettled, bytes memory outcome);
    function createMarket(string memory marketId, uint256 poolId, string memory question, string memory category, uint256 eventEndTime) external;
}
enum OracleType {
    GUIDED,
    OPEN
}
enum MarketType {
    OVER_UNDER,
    CUSTOM
}
contract BitredictPoolCore is Ownable, ReentrancyGuard {
    IERC20 public bitrToken;
    uint256 public poolCount;
    uint256 public constant creationFeeSTT = 1e18;
    uint256 public constant creationFeeBITR = 50e18;
    uint256 public constant platformFee = 500;
    uint256 public constant bettingGracePeriod = 60;
    uint256 public constant arbitrationTimeout = 24 hours;
    uint256 public constant minPoolStakeSTT = 5e18;
    uint256 public constant minPoolStakeBITR = 1000e18;
    uint256 public constant minBetAmount = 1e18;
    uint256 public constant HIGH_ODDS_THRESHOLD = 500;
    uint256 public constant MAX_PARTICIPANTS = 500;
    uint256 public constant MAX_LP_PROVIDERS = 100;
    uint256 public constant REFUND_BATCH_SIZE = 50; 
    address public immutable feeCollector;
    address public immutable guidedOracle;
    address public immutable optimisticOracle;
    IReputationSystem public reputationSystem;
    IBitredictBoostSystem public boostSystem;
    uint256 public totalCollectedSTT;
    uint256 public totalCollectedBITR;
    mapping(uint256 => uint256) public poolCollectedFeesSTT;
    mapping(uint256 => uint256) public poolCollectedFeesBITR;
    mapping(address => uint256) public creatorPendingFeesSTT;
    mapping(address => uint256) public creatorPendingFeesBITR;
    struct PoolAnalytics {
        uint256 totalVolume;
        uint256 participantCount;
        uint256 averageBetSize;
        uint256 creatorReputation;
        uint256 liquidityRatio;
        uint256 timeToFill;
        bool isHotPool;
        uint256 fillPercentage;
        uint256 lastActivityTime;
    }
    struct CreatorStats {
        uint256 totalPoolsCreated;
        uint256 successfulPools;
        uint256 totalVolumeGenerated;
        uint256 averagePoolSize;
        uint256 reputationScore;
        uint256 winRate;
        uint256 totalEarnings;
        uint256 activePoolsCount;
    }
    struct GlobalStats {
        uint256 totalPools;
        uint256 totalVolume;
        uint256 totalUsers;
        uint256 totalBets;
        uint256 averagePoolSize;
        uint256 lastUpdated;
    }
    struct Pool {
        address creator;           
        uint16 odds;              
        uint8 flags;              
        OracleType oracleType;    
        MarketType marketType;    
        uint256 creatorStake;
        uint256 totalCreatorSideStake;
        uint256 maxBettorStake;
        uint256 totalBettorStake;
        bytes32 predictedOutcome;
        bytes32 result;
        uint256 eventStartTime;
        uint256 eventEndTime;
        uint256 bettingEndTime;
        uint256 resultTimestamp;
        uint256 arbitrationDeadline;
        uint256 maxBetPerUser;
        bytes32 league;           
        bytes32 category;         
        bytes32 homeTeam;        
        bytes32 awayTeam;        
        bytes32 title;           
        string marketId;          
    }
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => address[]) public poolBettors;
    mapping(uint256 => mapping(address => uint256)) public bettorStakes;
    mapping(uint256 => string) public poolDisplayData;
    mapping(uint256 => address[]) public poolLPs;
    mapping(uint256 => mapping(address => uint256)) public lpStakes;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => mapping(address => bool)) public poolWhitelist;
    mapping(address => CreatorStats) public creatorStats;
    mapping(uint256 => PoolAnalytics) public poolAnalytics;
    GlobalStats public globalStats;
    mapping(address => uint256) public predictionStreaks;
    mapping(address => uint256) public longestStreak;
    mapping(address => uint256) public streakMultiplier;
    mapping(bytes32 => uint256[]) public categoryPools;
    mapping(address => uint256[]) public creatorActivePools;
    mapping(uint256 => uint256) public poolIdToCreatorIndex;
    event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, OracleType oracleType, MarketType marketType, string marketId, bytes32 league, bytes32 category);
    event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome);
    event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount);
    event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp);
    event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event PoolRefunded(uint256 indexed poolId, string reason);
    event UserWhitelisted(uint256 indexed poolId, address indexed user);
    event ReputationActionOccurred(address indexed user, ReputationSystem.ReputationAction action, uint256 value, bytes32 indexed poolId, uint256 timestamp);
    event AnalyticsUpdated(uint256 indexed poolId, uint256 totalVolume, uint256 participantCount);
    event ReputationSystemUpdated(address indexed oldSystem, address indexed newSystem);
    event BoostSystemUpdated(address indexed oldSystem, address indexed newSystem);
    event CreatorFeeAccrued(uint256 indexed poolId, address indexed creator, uint256 sttAmount, uint256 bitrAmount);
    event CreatorFeeClaimed(address indexed creator, uint256 sttAmount, uint256 bitrAmount);
    constructor(
        address _bitrToken,
        address _feeCollector,
        address _guidedOracle,
        address _optimisticOracle
    ) Ownable(msg.sender) {
        require(_bitrToken != address(0), "Invalid BITR token address");
        require(_feeCollector != address(0), "Invalid fee collector address");
        require(_guidedOracle != address(0), "Invalid guided oracle");
        require(_optimisticOracle != address(0), "Invalid optimistic oracle");
        bitrToken = IERC20(_bitrToken);
        feeCollector = _feeCollector;
        guidedOracle = _guidedOracle;
        optimisticOracle = _optimisticOracle;
        globalStats.lastUpdated = block.timestamp;
    }
    function setReputationSystem(address _reputationSystem) external onlyOwner {
        require(_reputationSystem != address(0), "Invalid reputation system address");
        address oldSystem = address(reputationSystem);
        reputationSystem = IReputationSystem(_reputationSystem);
        emit ReputationSystemUpdated(oldSystem, _reputationSystem);
    }
    function setBoostSystem(address _boostSystem) external onlyOwner {
        require(_boostSystem != address(0), "Invalid boost system address");
        address oldSystem = address(boostSystem);
        boostSystem = IBitredictBoostSystem(_boostSystem);
        emit BoostSystemUpdated(oldSystem, _boostSystem);
    }
    modifier validPool(uint256 poolId) {
        require(poolId < poolCount);
        require(pools[poolId].creator != address(0));
        _;
    }
    modifier onlyOracle() {
        require(msg.sender == guidedOracle || msg.sender == optimisticOracle);
        _;
    }
    function createPool(
        bytes32 _predictedOutcome,
        uint256 _odds,
        uint256 _creatorStake,
        uint256 _eventStartTime,
        uint256 _eventEndTime,
        bytes32 _league,
        bytes32 _category,
        bytes32 _homeTeam,
        bytes32 _awayTeam,
        bytes32 _title,
        bool _isPrivate,
        uint256 _maxBetPerUser,
        bool _useBitr,
        OracleType _oracleType,
        MarketType _marketType,
        string memory _marketId
    ) external payable nonReentrant returns (uint256) {
        require(_odds > 100 && _odds <= 10000);
        if (_oracleType == OracleType.GUIDED) {
            require(_marketType != MarketType.CUSTOM);
        }
        if (address(reputationSystem) != address(0)) {
            (, bool canCreateGuided, bool canCreateOpen,) = reputationSystem.getReputationBundle(msg.sender);
            if (_oracleType == OracleType.OPEN) {
                require(canCreateOpen);
            } else {
                require(canCreateGuided);
            }
        }
        if (_useBitr) {
            require(_creatorStake >= minPoolStakeBITR);
        } else {
            require(_creatorStake >= minPoolStakeSTT);
        }
        require(_creatorStake <= 1000000 * 1e18);
        require(_eventStartTime > block.timestamp);
        require(_eventEndTime > _eventStartTime);
        require(_eventStartTime > block.timestamp + bettingGracePeriod);
        
        uint256 baseCreationFee = _useBitr ? creationFeeBITR : creationFeeSTT;
        uint256 bitrBalance = bitrToken.balanceOf(msg.sender);
        uint256 discountMultiplier = 100;
        
        if (bitrBalance >= 500000 * 1e18) discountMultiplier = 50;
        else if (bitrBalance >= 200000 * 1e18) discountMultiplier = 70;
        else if (bitrBalance >= 50000 * 1e18) discountMultiplier = 80;
        else if (bitrBalance >= 5000 * 1e18) discountMultiplier = 90;
        
        uint256 adjustedCreationFee = (baseCreationFee * discountMultiplier) / 100;
        uint256 totalRequired = adjustedCreationFee + _creatorStake;
        if (_useBitr) {
            require(msg.value == 0);
            require(bitrToken.transferFrom(msg.sender, address(this), totalRequired));
            require(bitrToken.transfer(feeCollector, adjustedCreationFee), "Fee transfer failed");
        } else {
            require(msg.value == totalRequired);
            (bool success, ) = payable(feeCollector).call{value: adjustedCreationFee, gas: 2300}("");
            require(success, "Fee transfer failed");
        }
        uint8 flags = 0;
        if (_isPrivate) flags |= 4;      
        if (_useBitr) flags |= 8;        
        pools[poolCount] = Pool({
            creator: msg.sender,
            odds: uint16(_odds),
            flags: flags,
            oracleType: _oracleType,
            marketType: _marketType,
            creatorStake: _creatorStake,
            totalCreatorSideStake: _creatorStake,
            maxBettorStake: 0,
            totalBettorStake: 0,
            predictedOutcome: _predictedOutcome,
            result: bytes32(0),
            eventStartTime: _eventStartTime,
            eventEndTime: _eventEndTime,
            bettingEndTime: _eventStartTime - bettingGracePeriod,
            resultTimestamp: 0,
            arbitrationDeadline: _eventEndTime + arbitrationTimeout,
            maxBetPerUser: _maxBetPerUser,
            league: _league,
            category: _category,
            homeTeam: _homeTeam,
            awayTeam: _awayTeam,
            title: _title,
            marketId: _marketId
        });
        emit PoolCreated(
            poolCount, 
            msg.sender, 
            _eventStartTime, 
            _eventEndTime, 
            _oracleType, 
            _marketType,
            _marketId, 
            _league, 
            _category
        );
        emit ReputationActionOccurred(msg.sender, ReputationSystem.ReputationAction.POOL_CREATED, _creatorStake, bytes32(poolCount), block.timestamp);
        uint256 currentPoolId = poolCount;
        poolCount++;
        
        if (_oracleType == OracleType.OPEN) {
            string memory question = string(abi.encodePacked(_title));
            string memory category = string(abi.encodePacked(_category));
            IOptimisticOracle(optimisticOracle).createMarket(_marketId, currentPoolId, question, category, _eventEndTime);
        }
        
        creatorActivePools[msg.sender].push(currentPoolId);
        poolIdToCreatorIndex[currentPoolId] = creatorActivePools[msg.sender].length - 1;
        return currentPoolId;
    }
    function placeBet(uint256 poolId, uint256 amount) external payable nonReentrant validPool(poolId) {
        Pool storage poolPtr = pools[poolId];
        Pool memory pool = poolPtr;
        require(!_isPoolSettled(poolId));
        require(amount >= minBetAmount);
        require(amount <= 100000 * 1e18);
        require(block.timestamp < pool.bettingEndTime);
        require(amount > 0);
        uint256 effectiveCreatorSideStake = pool.totalBettorStake == 0 || pool.totalBettorStake + amount > pool.creatorStake ? 
            pool.totalCreatorSideStake : pool.creatorStake;
        uint256 poolOdds = uint256(pool.odds);
        uint256 currentMaxBettorStake = (effectiveCreatorSideStake * 100) / (poolOdds - 100);
        require(pool.totalBettorStake + amount <= currentMaxBettorStake);
        uint256 currentBettorStake = bettorStakes[poolId][msg.sender];
        if (currentBettorStake == 0) {
            require(poolBettors[poolId].length < MAX_PARTICIPANTS);
        }
        if (_isPoolPrivate(poolId)) {
            require(poolWhitelist[poolId][msg.sender]);
        }
        if (pool.maxBetPerUser > 0) {
            require(currentBettorStake + amount <= pool.maxBetPerUser);
        }
        if (currentBettorStake == 0) {
            poolBettors[poolId].push(msg.sender);
        }
        bettorStakes[poolId][msg.sender] = currentBettorStake + amount;
        poolPtr.totalBettorStake = pool.totalBettorStake + amount;
        poolPtr.maxBettorStake = currentMaxBettorStake;
        if (!_isPoolFilledAbove60(poolId) && (poolPtr.totalBettorStake * 100) / currentMaxBettorStake >= 60) {
            poolPtr.flags |= 16; 
            emit ReputationActionOccurred(pool.creator, ReputationSystem.ReputationAction.POOL_FILLED_ABOVE_60, poolPtr.totalBettorStake, bytes32(poolId), block.timestamp);
        }
        if (_poolUsesBitr(poolId)) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount));
        } else {
            require(msg.value == amount);
        }
        _updatePoolAnalytics(poolId, amount, 1);
        emit BetPlaced(poolId, msg.sender, amount, true);
    }
    function addLiquidity(uint256 poolId, uint256 amount) external payable nonReentrant validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(amount >= minBetAmount);
        require(amount <= 500000 * 1e18);
        require(block.timestamp < pool.bettingEndTime);
        require(pool.totalCreatorSideStake <= type(uint256).max - amount);
        if (lpStakes[poolId][msg.sender] == 0) {
            require(poolLPs[poolId].length < MAX_LP_PROVIDERS);
        }
        if (_isPoolPrivate(poolId)) {
            require(poolWhitelist[poolId][msg.sender]);
        }
        if (lpStakes[poolId][msg.sender] == 0) {
            poolLPs[poolId].push(msg.sender);
        }
        lpStakes[poolId][msg.sender] += amount;
        pool.totalCreatorSideStake += amount;
        uint256 effectiveCreatorSideStake = pool.totalBettorStake == 0 || pool.totalBettorStake > pool.creatorStake ? 
            pool.totalCreatorSideStake : pool.creatorStake;
        uint256 denominator = uint256(pool.odds) - 100;
        pool.maxBettorStake = (effectiveCreatorSideStake * 100) / denominator;
        if (_poolUsesBitr(poolId)) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount));
        } else {
            require(msg.value == amount);
        }
        _updatePoolAnalytics(poolId, amount, 0);
        emit LiquidityAdded(poolId, msg.sender, amount);
    }
    function settlePool(uint256 poolId, bytes32 outcome) external validPool(poolId) onlyOracle {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(block.timestamp >= pool.eventEndTime);
        if (pool.oracleType == OracleType.GUIDED) {
            require(msg.sender == guidedOracle);
        } else if (pool.oracleType == OracleType.OPEN) {
            require(msg.sender == optimisticOracle);
        }
        pool.result = outcome;
        pool.flags |= 1; 
        bool creatorSideWon = (outcome != pool.predictedOutcome);
        if (creatorSideWon) {
            pool.flags |= 2; 
        }
        pool.resultTimestamp = block.timestamp;
        _removePoolFromCreatorActiveList(poolId);
        emit PoolSettled(poolId, outcome, creatorSideWon, block.timestamp);
    }
    function settlePoolAutomatically(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(block.timestamp >= pool.eventEndTime);
        bytes32 outcome;
        bool isReady = false;
        if (pool.oracleType == OracleType.GUIDED) {
            (bool isSet, bytes memory resultData) = IGuidedOracle(guidedOracle).getOutcome(pool.marketId);
            require(isSet);
            require(resultData.length == 32, "Invalid result data length");
            outcome = bytes32(resultData);
            isReady = true;
        } else if (pool.oracleType == OracleType.OPEN) {
            (bool isSettled, bytes memory resultData) = IOptimisticOracle(optimisticOracle).getOutcome(pool.marketId);
            require(isSettled);
            require(resultData.length == 32, "Invalid result data length");
            outcome = bytes32(resultData);
            isReady = true;
        }
        require(isReady);
        pool.result = outcome;
        pool.flags |= 1; 
        bool creatorSideWon = (outcome != pool.predictedOutcome);
        if (creatorSideWon) {
            pool.flags |= 2; 
        }
        pool.resultTimestamp = block.timestamp;
        _removePoolFromCreatorActiveList(poolId);
        emit PoolSettled(poolId, outcome, creatorSideWon, block.timestamp);
    }
    function _processAutomaticRefund(uint256 poolId) internal {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(pool.totalBettorStake == 0);
        require(block.timestamp >= pool.eventStartTime);
        pool.flags |= 1; 
        pool.result = bytes32(0); 
        if (_poolUsesBitr(poolId)) {
            require(bitrToken.transfer(pool.creator, pool.creatorStake));
        } else {
            (bool success, ) = payable(pool.creator).call{value: pool.creatorStake, gas: 2300}("");
            require(success);
        }
        emit PoolSettled(poolId, 0, false, block.timestamp);
        emit RewardClaimed(poolId, pool.creator, pool.creatorStake);
    }
    function checkAndRefundEmptyPool(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(pool.totalBettorStake == 0);
        require(block.timestamp >= pool.eventStartTime);
        _processAutomaticRefund(poolId);
    }
    function isEligibleForRefund(uint256 poolId) external view validPool(poolId) returns (bool) {
        Pool memory pool = pools[poolId];
        return PoolStats.checkRefundEligibility(pool.totalBettorStake, pool.flags);
    }
    function getPoolStats(uint256 poolId) external view validPool(poolId) returns (
        uint256 totalBettorStake,
        uint256 totalCreatorSideStake,
        uint256 bettorCount,
        uint256 lpCount,
        bool isSettled,
        bool eligibleForRefund,
        uint256 timeUntilEventStart,
        uint256 timeUntilBettingEnd
    ) {
        Pool memory pool = pools[poolId];
        totalBettorStake = pool.totalBettorStake;
        totalCreatorSideStake = pool.totalCreatorSideStake;
        bettorCount = poolBettors[poolId].length;
        lpCount = poolLPs[poolId].length;
        isSettled = PoolStats.isPoolSettled(pool.flags);
        eligibleForRefund = PoolStats.checkRefundEligibility(pool.totalBettorStake, pool.flags);
        
        (bool hasStarted,,,uint256 _timeUntilStart) = PoolStats.getPoolTimingInfo(
            pool.eventStartTime,
            pool.eventEndTime,
            pool.bettingEndTime
        );
        
        timeUntilEventStart = _timeUntilStart;
        timeUntilBettingEnd = block.timestamp < pool.bettingEndTime ? 
            pool.bettingEndTime - block.timestamp : 0;
    }
    function getClaimInfo(uint256 poolId, address user) external view validPool(poolId) returns (
        bool canClaim,
        uint256 claimableAmount,
        bool isWinner,
        uint256 userStake,
        bool alreadyClaimed,
        string memory reason
    ) {
        Pool memory pool = pools[poolId];
        alreadyClaimed = claimed[poolId][user];
        if (!_isPoolSettled(poolId)) return (false, 0, false, 0, alreadyClaimed, "Pool not settled");
        if (alreadyClaimed) return (false, 0, false, 0, true, "Already claimed");
        
        bool creatorSideWon = ClaimCalculations.creatorSideWon(pool.predictedOutcome, pool.result);
        
        if (creatorSideWon) {
            if (user == pool.creator) {
                userStake = pool.creatorStake;
                if (userStake == 0) return (false, 0, false, 0, false, "No creator stake");
                
                ClaimCalculations.PoolData memory poolData = ClaimCalculations.PoolData({
                    odds: pool.odds,
                    creatorStake: pool.creatorStake,
                    totalCreatorSideStake: pool.totalCreatorSideStake,
                    totalBettorStake: pool.totalBettorStake
                });
                
                claimableAmount = ClaimCalculations.calculateCreatorClaim(poolData);
                return (true, claimableAmount, true, userStake, false, "Ready to claim");
            }
            
            userStake = lpStakes[poolId][user];
            if (userStake == 0) return (false, 0, false, 0, false, "No LP stake");
            
            claimableAmount = _calculateLPPayoutWithFIFO(poolId, user);
            return (true, claimableAmount, true, userStake, false, "Ready to claim");
        } else {
            userStake = bettorStakes[poolId][user];
            if (userStake == 0) return (false, 0, false, 0, false, "No bet placed");
            
            (, uint256 netPayout,) = ClaimCalculations.calculateBettorPayout(
                userStake,
                pool.odds,
                adjustedFeeRate(user)
            );
            claimableAmount = netPayout;
            return (true, claimableAmount, true, userStake, false, "Ready to claim");
        }
    }
    function _calculateLPPayoutWithFIFO(uint256 poolId, address user) internal view returns (uint256) {
        Pool memory pool = pools[poolId];
        uint256 userLPStake = lpStakes[poolId][user];
        if (userLPStake == 0) return 0;
        
        ClaimCalculations.PoolData memory poolData = ClaimCalculations.PoolData({
            odds: pool.odds,
            creatorStake: pool.creatorStake,
            totalCreatorSideStake: pool.totalCreatorSideStake,
            totalBettorStake: pool.totalBettorStake
        });
        
        uint256 remainingStakes = ClaimCalculations.getRemainingStakesForLP(poolData);
        
        return ClaimCalculations.calculateLPReward(
            poolData,
            lpStakes,
            poolLPs,
            poolId,
            user,
            userLPStake,
            remainingStakes
        );
    }
    function _calculateBettorPayout(uint256 poolId, address user) internal returns (uint256) {
        Pool memory pool = pools[poolId];
        uint256 stake = bettorStakes[poolId][user];
        if (stake == 0) return 0;
        
        (, uint256 netPayout, uint256 fee) = ClaimCalculations.calculateBettorPayout(
            stake,
            pool.odds,
            adjustedFeeRate(user)
        );
        
        if (fee > 0) {
            address creator = pool.creator;
            uint256 creatorShare = (fee * 20) / 100;
            uint256 platformShare = fee - creatorShare;
            
            if (_poolUsesBitr(poolId)) {
                totalCollectedBITR += platformShare;
                poolCollectedFeesBITR[poolId] += platformShare;
                creatorPendingFeesBITR[creator] += creatorShare;
                emit CreatorFeeAccrued(poolId, creator, 0, creatorShare);
            } else {
                totalCollectedSTT += platformShare;
                poolCollectedFeesSTT[poolId] += platformShare;
                creatorPendingFeesSTT[creator] += creatorShare;
                emit CreatorFeeAccrued(poolId, creator, creatorShare, 0);
            }
        }
        
        uint256 minValueSTT = 10 * 1e18;
        uint256 minValueBITR = 2000 * 1e18;
        bool isHighValue = _poolUsesBitr(poolId) ? (stake >= minValueBITR) : (stake >= minValueSTT);
        
        if (isHighValue) {
            emit ReputationActionOccurred(user, ReputationSystem.ReputationAction.BET_WON_HIGH_VALUE, stake, bytes32(poolId), block.timestamp);
        } else {
            emit ReputationActionOccurred(user, ReputationSystem.ReputationAction.BET_WON, stake, bytes32(poolId), block.timestamp);
        }
        
        return netPayout;
    }
    function claim(uint256 poolId) external validPool(poolId) nonReentrant {
        require(_isPoolSettled(poolId));
        require(!claimed[poolId][msg.sender]);
        
        uint256 payout;
        Pool memory pool = pools[poolId];
        
        bool creatorWon = ClaimCalculations.creatorSideWon(pool.predictedOutcome, pool.result);
        
        if (creatorWon) {
            if (msg.sender == pool.creator) {
                require(pool.creatorStake > 0);
                
                ClaimCalculations.PoolData memory poolData = ClaimCalculations.PoolData({
                    odds: pool.odds,
                    creatorStake: pool.creatorStake,
                    totalCreatorSideStake: pool.totalCreatorSideStake,
                    totalBettorStake: pool.totalBettorStake
                });
                
                payout = ClaimCalculations.calculateCreatorClaim(poolData);
                
                uint256 minValueSTT = 20 * 1e18;
                uint256 minValueBITR = 20000 * 1e18;
                bool isHighValue = _poolUsesBitr(poolId) ? 
                    (pool.creatorStake >= minValueBITR) : (pool.creatorStake >= minValueSTT);
                
                if (isHighValue) {
                    emit ReputationActionOccurred(pool.creator, ReputationSystem.ReputationAction.BET_WON_HIGH_VALUE, pool.creatorStake, bytes32(poolId), block.timestamp);
                } else {
                    emit ReputationActionOccurred(pool.creator, ReputationSystem.ReputationAction.BET_WON, pool.creatorStake, bytes32(poolId), block.timestamp);
                }
            } else {
                require(lpStakes[poolId][msg.sender] > 0);
                payout = _calculateLPPayoutWithFIFO(poolId, msg.sender);
            }
        } else {
            require(bettorStakes[poolId][msg.sender] > 0);
            payout = _calculateBettorPayout(poolId, msg.sender);
        }
        
        require(payout > 0);
        claimed[poolId][msg.sender] = true;
        
        bool userWon = creatorWon ? 
            (msg.sender == pool.creator || lpStakes[poolId][msg.sender] > 0) : 
            (bettorStakes[poolId][msg.sender] > 0);
        _updateStreakInternal(msg.sender, userWon);
        
        if (_poolUsesBitr(poolId)) {
            require(bitrToken.transfer(msg.sender, payout));
        } else {
            (bool success, ) = payable(msg.sender).call{value: payout, gas: 2300}("");
            require(success);
        }
        
        emit RewardClaimed(poolId, msg.sender, payout);
    }
    function adjustedFeeRate(address user) external view returns (uint256) {
        return PoolStats.getAdjustedFeeRate(bitrToken.balanceOf(user), platformFee);
    }
    function claimCreatorFees() external nonReentrant {
        uint256 sttAmount = creatorPendingFeesSTT[msg.sender];
        uint256 bitrAmount = creatorPendingFeesBITR[msg.sender];
        require(sttAmount > 0 || bitrAmount > 0, "No fees to claim");
        
        if (sttAmount > 0) {
            creatorPendingFeesSTT[msg.sender] = 0;
            (bool success, ) = payable(msg.sender).call{value: sttAmount, gas: 2300}("");
            require(success, "STT transfer failed");
        }
        
        if (bitrAmount > 0) {
            creatorPendingFeesBITR[msg.sender] = 0;
            require(bitrToken.transfer(msg.sender, bitrAmount), "BITR transfer failed");
        }
        
        emit CreatorFeeClaimed(msg.sender, sttAmount, bitrAmount);
    }
    function getCreatorPendingFees(address creator) external view returns (uint256 sttAmount, uint256 bitrAmount) {
        return (creatorPendingFeesSTT[creator], creatorPendingFeesBITR[creator]);
    }
    function distributeFees(address stakingContract) external nonReentrant {
        require(msg.sender == feeCollector);
        require(stakingContract != address(0), "Invalid staking contract address");
        
        uint256 _stt = totalCollectedSTT;
        uint256 _bitr = totalCollectedBITR;
        uint256 sttStakers = 0;
        uint256 bitrStakers = 0;
        
        if (_stt > 0) {
            sttStakers = (_stt * 30) / 100;
            uint256 sttFeeCollector = _stt - sttStakers;
            totalCollectedSTT = 0;
            (bool success1, ) = payable(feeCollector).call{value: sttFeeCollector, gas: 2300}("");
            require(success1, "FeeCollector STT transfer failed");
            (bool success2, ) = payable(stakingContract).call{value: sttStakers, gas: 2300}("");
            require(success2, "Staking contract STT transfer failed");
        }
        
        if (_bitr > 0) {
            bitrStakers = (_bitr * 30) / 100;
            uint256 bitrFeeCollector = _bitr - bitrStakers;
            totalCollectedBITR = 0;
            require(bitrToken.transfer(feeCollector, bitrFeeCollector), "FeeCollector BITR transfer failed");
            require(bitrToken.transfer(stakingContract, bitrStakers), "Staking contract BITR transfer failed");
        }
        
        if (_stt > 0 || _bitr > 0) {
            IBitredictStaking(stakingContract).addRevenue(bitrStakers, sttStakers);
        }
    }
    function addToWhitelist(uint256 poolId, address user) external validPool(poolId) {
        require(msg.sender == pools[poolId].creator);
        require(user != address(0), "Invalid user address");
        poolWhitelist[poolId][user] = true;
        emit UserWhitelisted(poolId, user);
    }
    function removeFromWhitelist(uint256 poolId, address user) external validPool(poolId) {
        require(msg.sender == pools[poolId].creator);
        require(user != address(0), "Invalid user address");
        poolWhitelist[poolId][user] = false;
    }
    function refundPool(uint256 poolId) external nonReentrant validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!_isPoolSettled(poolId));
        require(!_isPoolRefunded(poolId), "Pool already refunded");
        require(block.timestamp > pool.arbitrationDeadline);
        uint256 totalParticipants = poolLPs[poolId].length + poolBettors[poolId].length;
        if (totalParticipants > REFUND_BATCH_SIZE) {
            pool.flags |= 1;
            pool.flags |= 32;
            emit PoolRefunded(poolId, "Use batchRefund for large pools");
            return;
        }
        pool.flags |= 1;
        pool.flags |= 32; 
        address[] memory lps = poolLPs[poolId];
        uint256 lpCount = lps.length;
        bool useBitr = _poolUsesBitr(poolId);
        for (uint256 i = 0; i < lpCount; ) {
            address lp = lps[i];
            uint256 stake = lpStakes[poolId][lp];
            if (stake > 0) {
                if (useBitr) {
                    require(bitrToken.transfer(lp, stake));
                } else {
                    (bool success, ) = payable(lp).call{value: stake, gas: 2300}("");
                    require(success);
                }
            }
            unchecked { ++i; } 
        }
        address[] memory bettors = poolBettors[poolId];
        uint256 bettorCount = bettors.length;
        for (uint256 i = 0; i < bettorCount; ) {
            address bettor = bettors[i];
            uint256 stake = bettorStakes[poolId][bettor];
            if (stake > 0) {
                if (useBitr) {
                    require(bitrToken.transfer(bettor, stake));
                } else {
                    (bool success, ) = payable(bettor).call{value: stake, gas: 2300}("");
                    require(success);
                }
            }
            unchecked { ++i; } 
        }
        _removePoolFromCreatorActiveList(poolId);
        emit PoolRefunded(poolId, "Arbitration timeout");
    }
    function batchRefund(
        uint256 poolId, 
        uint256 startIndex, 
        uint256 batchSize
    ) external nonReentrant validPool(poolId) {
        require(_isPoolSettled(poolId));
        require(_isPoolRefunded(poolId), "Pool not marked for refund");
        Pool storage pool = pools[poolId];
        require(block.timestamp > pool.arbitrationDeadline);
        require(batchSize <= REFUND_BATCH_SIZE);
        bool useBitr = _poolUsesBitr(poolId);
        uint256 processed = 0;
        uint256 lpCount = poolLPs[poolId].length;
        if (startIndex < lpCount) {
            address[] storage lps = poolLPs[poolId];
            uint256 lpEndIndex = startIndex + batchSize > lpCount ? lpCount : startIndex + batchSize;
            for (uint256 i = startIndex; i < lpEndIndex && processed < batchSize; ) {
                address lp = lps[i];
                uint256 stake = lpStakes[poolId][lp];
                if (stake > 0 && !claimed[poolId][lp]) {
                    claimed[poolId][lp] = true; 
                    if (useBitr) {
                        require(bitrToken.transfer(lp, stake));
                    } else {
                        (bool success, ) = payable(lp).call{value: stake, gas: 2300}("");
                        require(success);
                    }
                    emit RewardClaimed(poolId, lp, stake);
                    processed++;
                }
                unchecked { ++i; }
            }
            return; 
        }
        uint256 bettorStartIndex = startIndex - lpCount;
        uint256 bettorCount = poolBettors[poolId].length;
        require(bettorStartIndex < bettorCount);
        address[] storage bettors = poolBettors[poolId];
        uint256 bettorEndIndex = bettorStartIndex + batchSize > bettorCount ? bettorCount : bettorStartIndex + batchSize;
        for (uint256 i = bettorStartIndex; i < bettorEndIndex && processed < batchSize; ) {
            address bettor = bettors[i];
            uint256 stake = bettorStakes[poolId][bettor];
            if (stake > 0 && !claimed[poolId][bettor]) {
                claimed[poolId][bettor] = true; 
                if (useBitr) {
                    require(bitrToken.transfer(bettor, stake));
                } else {
                    (bool success, ) = payable(bettor).call{value: stake, gas: 2300}("");
                    require(success);
                }
                emit RewardClaimed(poolId, bettor, stake);
                processed++;
            }
            unchecked { ++i; }
        }
        if (bettorStartIndex + batchSize >= bettorCount) {
            _removePoolFromCreatorActiveList(poolId);
            emit PoolRefunded(poolId, "Batch refund completed");
        }
    }
    function getPool(uint256 poolId) external view validPool(poolId) returns (Pool memory) {
        return pools[poolId];
    }
    function getActivePoolsPaginated(
        uint256 offset, 
        uint256 limit
    ) external view returns (
        uint256[] memory poolIds, 
        uint256 totalCount
    ) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < poolCount; ) {
            if (!_isPoolSettled(i) && block.timestamp < pools[i].bettingEndTime) {
                activeCount++;
            }
            unchecked { ++i; }
        }
        totalCount = activeCount;
        if (offset >= activeCount || limit == 0) {
            return (new uint256[](0), totalCount);
        }
        uint256 returnSize = limit;
        if (offset + limit > activeCount) {
            returnSize = activeCount - offset;
        }
        poolIds = new uint256[](returnSize);
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;
        for (uint256 i = 0; i < poolCount && resultIndex < returnSize; ) {
            if (!_isPoolSettled(i) && block.timestamp < pools[i].bettingEndTime) {
                if (currentIndex >= offset) {
                    poolIds[resultIndex] = i;
                    resultIndex++;
                }
                currentIndex++;
            }
            unchecked { ++i; }
        }
        return (poolIds, totalCount);
    }
    function getPoolsByCreator(address creator, uint256 limit) external view returns (uint256[] memory) {
        uint256[] storage creatorPools = creatorActivePools[creator];
        if (limit == 0 || limit > creatorPools.length) limit = creatorPools.length;
        uint256[] memory result = new uint256[](limit);
        for (uint256 i = 0; i < limit; ) {
            result[i] = creatorPools[i];
            unchecked { ++i; }
        }
        return result;
    }
    function poolExists(uint256 poolId) external view returns (bool) {
        return poolId < poolCount;
    }
    function updateStreak(address user, bool won) external {
        require(msg.sender == address(this) || msg.sender == owner());
        _updateStreakInternal(user, won);
    }

    function _updateStreakInternal(address user, bool won) internal {
        if (won) {
            predictionStreaks[user]++;
            if (predictionStreaks[user] > longestStreak[user]) {
                longestStreak[user] = predictionStreaks[user];
            }
            streakMultiplier[user] = calculateStreakMultiplier(predictionStreaks[user]);
        } else {
            predictionStreaks[user] = 0;
            streakMultiplier[user] = 1;
        }
    }
    function calculateStreakMultiplier(uint256 streak) internal pure returns (uint256) {
        if (streak >= 20) return 5;
        if (streak >= 10) return 3;
        if (streak >= 5) return 2;
        return 1;
    }
    function _isPoolSettled(uint256 poolId) internal view returns (bool) {
        return (pools[poolId].flags & 1) != 0;
    }
    function _isPoolPrivate(uint256 poolId) internal view returns (bool) {
        return (pools[poolId].flags & 4) != 0;
    }
    function _poolUsesBitr(uint256 poolId) internal view returns (bool) {
        return (pools[poolId].flags & 8) != 0;
    }
    function _isPoolFilledAbove60(uint256 poolId) internal view returns (bool) {
        return (pools[poolId].flags & 16) != 0;
    }
    function _isPoolRefunded(uint256 poolId) internal view returns (bool) {
        return (pools[poolId].flags & 32) != 0;
    }
    function isPoolRefunded(uint256 poolId) external view validPool(poolId) returns (bool) {
        return _isPoolRefunded(poolId);
    }
    function _removePoolFromCreatorActiveList(uint256 poolId) internal {
        address creator = pools[poolId].creator;
        uint256[] storage activePools = creatorActivePools[creator];
        uint256 index = poolIdToCreatorIndex[poolId];
        if (index < activePools.length && activePools[index] == poolId) {
            uint256 lastIndex = activePools.length - 1;
            if (index != lastIndex) {
                uint256 lastPoolId = activePools[lastIndex];
                activePools[index] = lastPoolId;
                poolIdToCreatorIndex[lastPoolId] = index;
            }
            activePools.pop();
            delete poolIdToCreatorIndex[poolId];
        }
    }
    function _updatePoolAnalytics(uint256 poolId, uint256 amount, uint256 newParticipants) internal {
        PoolAnalytics storage analytics = poolAnalytics[poolId];
        analytics.totalVolume += amount;
        analytics.participantCount += newParticipants;
        analytics.lastActivityTime = block.timestamp;
        if (analytics.participantCount > 0) {
            analytics.averageBetSize = analytics.totalVolume / analytics.participantCount;
        }
        Pool memory pool = pools[poolId];
        if (pool.maxBettorStake > 0) {
            analytics.fillPercentage = (pool.totalBettorStake * 100) / pool.maxBettorStake;
        }
        analytics.liquidityRatio = pool.totalCreatorSideStake > 0 ? 
            (pool.totalBettorStake * 100) / pool.totalCreatorSideStake : 100;
        analytics.isHotPool = analytics.participantCount >= 10 && 
            block.timestamp - analytics.lastActivityTime < 1 hours;
        emit AnalyticsUpdated(poolId, analytics.totalVolume, analytics.participantCount);
    }
    function _updateCreatorStats(address creator, uint256 amount, bool isNewPool) internal {
        CreatorStats storage stats = creatorStats[creator];
        if (isNewPool) {
            stats.totalPoolsCreated++;
            stats.activePoolsCount++;
        }
        stats.totalVolumeGenerated += amount;
        if (stats.totalPoolsCreated > 0) {
            stats.averagePoolSize = stats.totalVolumeGenerated / stats.totalPoolsCreated;
        }
        if (address(reputationSystem) != address(0)) {
            (uint256 reputation,,,) = reputationSystem.getReputationBundle(creator);
            stats.reputationScore = reputation;
        }
    }
    function _updateGlobalStats(uint256 amount, bool isNewPool) internal {
        if (isNewPool) {
            globalStats.totalPools++;
        }
        globalStats.totalVolume += amount;
        globalStats.lastUpdated = block.timestamp;
        if (globalStats.totalPools > 0) {
            globalStats.averagePoolSize = globalStats.totalVolume / globalStats.totalPools;
        }
    }
    function getGlobalStats() external view returns (
        uint256 totalPools,
        uint256 totalVolume,
        uint256 averagePoolSize,
        uint256 lastUpdated
    ) {
        return (
            globalStats.totalPools,
            globalStats.totalVolume,
            globalStats.averagePoolSize,
            globalStats.lastUpdated
        );
    }

    function getPoolAnalytics(uint256 poolId) external view validPool(poolId) returns (
        uint256 popularityScore,
        uint8 riskLevel,
        string memory riskFactors,
        uint256 efficiencyScore,
        uint256 utilizationRate
    ) {
        Pool memory pool = pools[poolId];
        uint256 bettorCount = poolBettors[poolId].length;
        uint256 lpCount = poolLPs[poolId].length;
        uint256 totalVolume = pool.totalCreatorSideStake + pool.totalBettorStake;
        uint256 timeSinceCreation = block.timestamp - pool.eventStartTime;
        uint256 timeUntilEvent = pool.eventStartTime > block.timestamp ? 
            pool.eventStartTime - block.timestamp : 0;
        
        popularityScore = PoolStats.calculatePoolPopularity(
            bettorCount,
            lpCount,
            totalVolume,
            timeSinceCreation
        );
        
        (riskLevel, riskFactors) = PoolStats.assessPoolRisk(
            pool.creatorStake,
            pool.totalBettorStake,
            pool.odds,
            timeUntilEvent
        );
        
        uint256 maxBettorStake = (pool.totalCreatorSideStake * 100) / (uint256(pool.odds) - 100);
        (efficiencyScore, utilizationRate) = PoolStats.calculatePoolEfficiency(
            pool.totalCreatorSideStake,
            pool.totalBettorStake,
            maxBettorStake,
            timeSinceCreation
        );
    }

    function getPotentialWinnings(
        uint256 poolId,
        uint256 betAmount,
        address user
    ) external view validPool(poolId) returns (
        uint256 grossPayout,
        uint256 netPayout,
        uint256 feeAmount
    ) {
        Pool memory pool = pools[poolId];
        uint256 feeRate = adjustedFeeRate(user);
        
        return PoolStats.calculatePotentialWinnings(
            betAmount,
            pool.odds,
            feeRate
        );
    }

    function getCreatorReputation(address creator) external view returns (
        uint256 reputationScore,
        uint256 totalPoolsCreated,
        uint256 totalVolumeCreated,
        uint256 averagePoolSize
    ) {
        uint256[] memory creatorPools = creatorActivePools[creator];
        totalPoolsCreated = creatorPools.length;
        
        if (totalPoolsCreated == 0) {
            return (0, 0, 0, 0);
        }
        
        uint256 totalVolume = 0;
        for (uint256 i = 0; i < totalPoolsCreated; i++) {
            uint256 poolId = creatorPools[i];
            Pool memory pool = pools[poolId];
            totalVolume += pool.totalCreatorSideStake + pool.totalBettorStake;
        }
        
        totalVolumeCreated = totalVolume;
        averagePoolSize = totalVolume / totalPoolsCreated;
        
        reputationScore = PoolStats.calculateCreatorReputation(
            totalPoolsCreated,
            totalVolumeCreated,
            averagePoolSize,
            5000
        );
    }

    function getMarketTrend(
        uint256 poolId,
        uint256 averageVolume
    ) external view validPool(poolId) returns (
        int8 trendDirection,
        uint256 trendStrength
    ) {
        Pool memory pool = pools[poolId];
        uint256 currentVolume = pool.totalCreatorSideStake + pool.totalBettorStake;
        uint256 timeUntilEvent = pool.eventStartTime > block.timestamp ? 
            pool.eventStartTime - block.timestamp : 0;
        
        return PoolStats.calculateMarketTrend(
            currentVolume,
            averageVolume,
            timeUntilEvent
        );
    }
    function getParticipantCounts(uint256 poolId) 
        external view validPool(poolId) returns (
            uint256 bettorCount,
            uint256 lpCount
        ) 
    {
        bettorCount = poolBettors[poolId].length;
        lpCount = poolLPs[poolId].length;
    }
    function isParticipant(uint256 poolId, address user) 
        external view validPool(poolId) returns (bool hasStake) 
    {
        return bettorStakes[poolId][user] > 0 || lpStakes[poolId][user] > 0;
    }
    function getPoolBettorsPaginated(
        uint256 poolId,
        uint256 offset,
        uint256 limit
    ) external view validPool(poolId) returns (
        address[] memory bettors,
        uint256[] memory stakes,
        uint256 totalCount
    ) {
        totalCount = poolBettors[poolId].length;
        if (offset >= totalCount || limit == 0) {
            return (new address[](0), new uint256[](0), totalCount);
        }
        uint256 returnSize = limit;
        if (offset + limit > totalCount) {
            returnSize = totalCount - offset;
        }
        bettors = new address[](returnSize);
        stakes = new uint256[](returnSize);
        address[] storage allBettors = poolBettors[poolId];
        for (uint256 i = 0; i < returnSize; ) {
            address bettor = allBettors[offset + i];
            bettors[i] = bettor;
            stakes[i] = bettorStakes[poolId][bettor];
            unchecked { ++i; }
        }
        return (bettors, stakes, totalCount);
    }
    function getPoolLPsPaginated(
        uint256 poolId,
        uint256 offset,
        uint256 limit
    ) external view validPool(poolId) returns (
        address[] memory lps,
        uint256[] memory stakes,
        uint256 totalCount
    ) {
        totalCount = poolLPs[poolId].length;
        if (offset >= totalCount || limit == 0) {
            return (new address[](0), new uint256[](0), totalCount);
        }
        uint256 returnSize = limit;
        if (offset + limit > totalCount) {
            returnSize = totalCount - offset;
        }
        lps = new address[](returnSize);
        stakes = new uint256[](returnSize);
        address[] storage allLPs = poolLPs[poolId];
        for (uint256 i = 0; i < returnSize; ) {
            address lp = allLPs[offset + i];
            lps[i] = lp;
            stakes[i] = lpStakes[poolId][lp];
            unchecked { ++i; }
        }
        return (lps, stakes, totalCount);
    }
    function getUserPoolStake(uint256 poolId, address user) 
        external view validPool(poolId) returns (
            uint256 bettorStake,
            uint256 lpStake,
            bool hasClaimed
        ) 
    {
        bettorStake = bettorStakes[poolId][user];
        lpStake = lpStakes[poolId][user];
        hasClaimed = claimed[poolId][user];
    }
    function getBatchRefundInfo(uint256 poolId) 
        external view validPool(poolId) returns (
            uint256 totalParticipants,
            bool needsBatchRefund,
            uint256 suggestedBatchSize
        ) 
    {
        uint256 lpCount = poolLPs[poolId].length;
        uint256 bettorCount = poolBettors[poolId].length;
        totalParticipants = lpCount + bettorCount;
        needsBatchRefund = totalParticipants > REFUND_BATCH_SIZE;
        suggestedBatchSize = needsBatchRefund ? REFUND_BATCH_SIZE : totalParticipants;
    }
}
